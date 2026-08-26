// src/chelys/peer/SessionClient.ts
import {
	getAccountControlConnection,
	getAccountControlUser,
	whenAccountControlConnected,
} from './AccountControlRoom';
import { acquireRendezvous, type RendezvousLease } from './RendezvousRoom';
import {
	isSessionRequest,
	makeChannelLabel,
	makeHostKey,
	makeSessionId,
	makeSessionRoomId,
	readHostAdvertisements,
	readPeerState,
	SESSIONS_MAP_NAME,
	type ControlConnection,
	type HostAdvertisement,
	type SessionRequest,
} from './SessionContract';
import type { ControlMode } from '../types/transport';

const HOST_ABSENCE_GRACE_MS = 5_000;
const DEFAULT_SESSION_REQUEST_TIMEOUT_MS = 30_000;

export interface SessionLease {
	connection: ControlConnection;
	request: SessionRequest;
	remoteTransportPeerId: string;
	channelLabel: string;
	release(): void;
	onInvalid(handler: (error: Error) => void): () => void;
}

export interface OpenSessionOptions {
	baseRoomId: string;
	controlRoomId: string;
	controlMode: ControlMode;
	signaling: string[];
	label: string;
	timeoutMs?: number;
}

async function acquireControlConnection(options: OpenSessionOptions): Promise<{
	connection: ControlConnection;
	release: () => void;
}> {
	if (options.controlMode === 'dedicated') {
		const lease = acquireRendezvous(
			options.controlRoomId,
			options.signaling,
			getAccountControlUser(),
		);
		await lease.connection.ready;
		return {
			connection: lease.connection,
			release: lease.release,
		};
	}

	const current = getAccountControlConnection();
	const connection = current ?? (await whenAccountControlConnected());
	await connection.ready;
	if (connection.roomId !== options.controlRoomId) {
		throw new Error(
			'Chelys account control room changed while opening service',
		);
	}
	return {
		connection,
		release: () => undefined,
	};
}

function findHost(
	connection: ControlConnection,
	baseRoomId: string,
	label: string,
): HostAdvertisement | null {
	const key = makeHostKey(baseRoomId, label);
	const candidates: HostAdvertisement[] = [];

	for (const [clientId, state] of connection.awareness.getStates()) {
		if (clientId === connection.awareness.clientID) continue;
		const peer = readPeerState(state);
		if (peer?.kind !== 'chelys') continue;
		const advertisement = readHostAdvertisements(state)[key];
		if (
			!advertisement ||
			advertisement.status !== 'ready' ||
			advertisement.baseRoomId !== baseRoomId ||
			advertisement.label !== label ||
			advertisement.hostPeerId !== peer.id ||
			advertisement.hostInstanceId !== peer.instanceId ||
			advertisement.hostTransportPeerId !== peer.transportPeerId
		) {
			continue;
		}
		candidates.push(advertisement);
	}

	candidates.sort((left, right) =>
		left.hostInstanceId.localeCompare(right.hostInstanceId),
	);
	return candidates[0] ?? null;
}

function waitForHost(
	connection: ControlConnection,
	baseRoomId: string,
	label: string,
	timeoutMs: number,
): Promise<HostAdvertisement> {
	const immediate = findHost(connection, baseRoomId, label);
	if (immediate) return Promise.resolve(immediate);

	return new Promise((resolve, reject) => {
		let settled = false;
		const finish = (value?: HostAdvertisement, error?: Error): void => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			connection.awareness.off('change', inspect);
			if (error) reject(error);
			else resolve(value!);
		};
		const inspect = (): void => {
			const value = findHost(connection, baseRoomId, label);
			if (value) finish(value);
		};
		const timer = setTimeout(
			() => finish(undefined, new Error(`Chelys does not advertise ${label}`)),
			timeoutMs,
		);
		connection.awareness.on('change', inspect);
		inspect();
	});
}

export async function openSession(
	options: OpenSessionOptions,
): Promise<SessionLease> {
	const timeoutMs = options.timeoutMs ?? DEFAULT_SESSION_REQUEST_TIMEOUT_MS;
	const acquired = await acquireControlConnection(options);
	const controlConnection = acquired.connection;
	let sessionLease: RendezvousLease | null = null;

	try {
		const requesterTransportPeerId = controlConnection.peer.transportPeerId;
		if (!requesterTransportPeerId) {
			throw new Error(
				'TeXlyre awareness peer has no WebRTC transport identity',
			);
		}
		const host = await waitForHost(
			controlConnection,
			options.baseRoomId,
			options.label,
			timeoutMs,
		);
		const requestId = crypto.randomUUID();
		const id = makeSessionId(
			options.baseRoomId,
			options.label,
			controlConnection.peer.instanceId,
		);
		const channelLabel = makeChannelLabel(options.label, requestId);
		const sessionRoomId = makeSessionRoomId(
			options.controlRoomId,
			controlConnection.peer.id,
		);
		const session = acquireRendezvous(
			sessionRoomId,
			options.signaling,
			getAccountControlUser(),
		);
		sessionLease = session;
		await session.connection.ready;
		const requesterSessionTransportPeerId =
			session.connection.peer.transportPeerId;
		if (!requesterSessionTransportPeerId) {
			throw new Error(
				'TeXlyre service session has no WebRTC transport identity',
			);
		}

		const request: SessionRequest = {
			id,
			requestId,
			baseRoomId: options.baseRoomId,
			label: options.label,
			channelLabel,
			sessionRoomId,
			requesterPeerId: controlConnection.peer.id,
			requesterInstanceId: controlConnection.peer.instanceId,
			requesterTransportPeerId,
			requesterSessionTransportPeerId,
			targetHostPeerId: host.hostPeerId,
			targetHostInstanceId: host.hostInstanceId,
			targetHostTransportPeerId: host.hostTransportPeerId,
			status: 'requested',
			createdAt: Date.now(),
		};
		const sessions = controlConnection.doc.getMap<unknown>(SESSIONS_MAP_NAME);
		let released = false;
		let hostAbsenceTimer: ReturnType<typeof setTimeout> | null = null;
		const invalidHandlers = new Set<(error: Error) => void>();

		const emitInvalid = (error: Error): void => {
			for (const handler of Array.from(invalidHandlers)) handler(error);
		};

		const release = (): void => {
			if (released) return;
			released = true;
			if (hostAbsenceTimer) clearTimeout(hostAbsenceTimer);
			hostAbsenceTimer = null;
			sessions.unobserve(inspectRequest);
			controlConnection.awareness.off('change', inspectHost);
			const current = sessions.get(id);
			if (
				isSessionRequest(current) &&
				current.requestId === requestId &&
				current.requesterInstanceId === request.requesterInstanceId
			) {
				sessions.delete(id);
			}
			invalidHandlers.clear();
			session.release();
			acquired.release();
		};

		const inspectRequest = (): void => {
			if (released) return;
			const current = sessions.get(id);
			if (!isSessionRequest(current)) {
				emitInvalid(
					new Error(`Chelys service session disappeared for ${options.label}`),
				);
				return;
			}
			if (current.requestId !== requestId) {
				emitInvalid(
					new Error(`Chelys service session was replaced for ${options.label}`),
				);
				return;
			}
			if (current.status === 'error') {
				emitInvalid(
					new Error(current.error || `Chelys rejected ${options.label}`),
				);
			}
		};

		const inspectHost = (): void => {
			if (released) return;
			const current = findHost(
				controlConnection,
				options.baseRoomId,
				options.label,
			);
			const sameHost =
				current?.hostPeerId === host.hostPeerId &&
				current.hostInstanceId === host.hostInstanceId &&
				current.hostTransportPeerId === host.hostTransportPeerId;
			if (sameHost) {
				if (hostAbsenceTimer) clearTimeout(hostAbsenceTimer);
				hostAbsenceTimer = null;
				return;
			}
			if (hostAbsenceTimer) return;
			hostAbsenceTimer = setTimeout(() => {
				hostAbsenceTimer = null;
				if (!released) {
					emitInvalid(
						new Error(`Chelys service host disappeared for ${options.label}`),
					);
				}
			}, HOST_ABSENCE_GRACE_MS);
		};

		let ready: SessionRequest;
		try {
			ready = await new Promise<SessionRequest>((resolve, reject) => {
				let settled = false;
				const finish = (value?: SessionRequest, error?: Error): void => {
					if (settled) return;
					settled = true;
					clearTimeout(timer);
					sessions.unobserve(observer);
					if (error) reject(error);
					else resolve(value!);
				};
				const inspect = (): void => {
					const current = sessions.get(id);
					if (!isSessionRequest(current) || current.requestId !== requestId) {
						return;
					}
					if (current.status === 'error') {
						finish(
							undefined,
							new Error(current.error || `Chelys rejected ${options.label}`),
						);
					} else if (current.status === 'ready') {
						finish(current);
					}
				};
				const observer = (): void => inspect();
				const timer = setTimeout(
					() =>
						finish(
							undefined,
							new Error(
								`Timed out opening ${options.label} through the awareness contract`,
							),
						),
					timeoutMs,
				);
				sessions.observe(observer);
				sessions.set(id, request);
				inspect();
			});
		} catch (error) {
			release();
			throw error;
		}

		const remoteTransportPeerId = ready.targetHostSessionTransportPeerId;
		if (!remoteTransportPeerId) {
			release();
			throw new Error(
				`Chelys did not publish a session peer for ${options.label}`,
			);
		}

		sessions.observe(inspectRequest);
		controlConnection.awareness.on('change', inspectHost);

		return {
			connection: session.connection,
			request: ready,
			remoteTransportPeerId,
			channelLabel: ready.channelLabel,
			release,
			onInvalid(handler: (error: Error) => void): () => void {
				invalidHandlers.add(handler);
				return () => invalidHandlers.delete(handler);
			},
		};
	} catch (error) {
		sessionLease?.release();
		acquired.release();
		throw error;
	}
}
