// src/chelys/peer/SessionHostRegistry.ts
import type { Awareness } from 'y-protocols/awareness';
import type * as Y from 'yjs';

import { acquireRendezvous, type RendezvousLease } from './RendezvousRoom';
import {
	HOSTS_AWARENESS_FIELD,
	isSessionRequest,
	makeHostKey,
	readHostAdvertisements,
	readPeerState,
	SESSIONS_MAP_NAME,
	type ControlConnection,
	type HostAdvertisement,
	type PeerState,
	type SessionRequest,
} from './SessionContract';
import { TransportHost } from './TransportHost';
import type { HostTransport } from '../types/transport';

const REQUESTER_ABSENCE_GRACE_MS = 5_000;

export interface SessionHostRegistryOptions {
	connection: ControlConnection;
	baseRoomId: string;
	label: string;
	signaling: string[];
	onChannel: (channel: HostTransport) => void;
}

interface HostedSession {
	host: TransportHost | null;
	rendezvous: RendezvousLease;
	requestId: string;
}

export class SessionHostRegistry {
	private readonly hosts = new Map<string, HostedSession>();
	private readonly missingSince = new Map<string, number>();
	private readonly sessions: Y.Map<unknown>;
	private readonly awareness: Awareness;
	private readonly advertisementId = crypto.randomUUID();
	private stopped = true;
	private advertised = false;

	constructor(private readonly options: SessionHostRegistryOptions) {
		this.sessions = options.connection.doc.getMap<unknown>(SESSIONS_MAP_NAME);
		this.awareness = options.connection.awareness;
	}

	start(): void {
		if (!this.stopped) return;
		this.stopped = false;
		this.sessions.observe(this.handleSessions);
		this.awareness.on('change', this.handleAwareness);
		void this.options.connection.ready.then(() => {
			if (this.stopped) return;
			this.publishAdvertisement();
			this.sync();
		});
		this.publishAdvertisement();
		this.sync();
	}

	stop(): void {
		if (this.stopped) return;
		this.stopped = true;
		this.failActiveRequests('Chelys service stopped');
		this.sessions.unobserve(this.handleSessions);
		this.awareness.off('change', this.handleAwareness);
		this.removeAdvertisement();
		for (const sessionId of Array.from(this.hosts.keys())) {
			this.stopHost(sessionId);
		}
		this.missingSince.clear();
	}

	private readonly handleSessions = (): void => this.sync();
	private readonly handleAwareness = (): void => {
		this.publishAdvertisement();
		this.sync();
	};

	private publishAdvertisement(): void {
		if (this.stopped) return;
		const localPeer = this.options.connection.peer;
		if (
			localPeer.kind !== 'chelys' ||
			typeof localPeer.transportPeerId !== 'string'
		) {
			return;
		}
		const key = makeHostKey(this.options.baseRoomId, this.options.label);
		const currentHosts = readHostAdvertisements(this.awareness.getLocalState());
		const advertisement: HostAdvertisement = {
			id: this.advertisementId,
			baseRoomId: this.options.baseRoomId,
			label: this.options.label,
			status: 'ready',
			hostPeerId: localPeer.id,
			hostInstanceId: localPeer.instanceId,
			hostTransportPeerId: localPeer.transportPeerId,
		};
		const existing = currentHosts[key];
		if (
			existing?.id === advertisement.id &&
			existing.hostTransportPeerId === advertisement.hostTransportPeerId
		) {
			this.advertised = true;
			return;
		}
		this.awareness.setLocalStateField(HOSTS_AWARENESS_FIELD, {
			...currentHosts,
			[key]: advertisement,
		});
		this.advertised = true;
	}

	private removeAdvertisement(): void {
		if (!this.advertised) return;
		const key = makeHostKey(this.options.baseRoomId, this.options.label);
		const hosts = {
			...readHostAdvertisements(this.awareness.getLocalState()),
		};
		if (hosts[key]?.id !== this.advertisementId) return;
		delete hosts[key];
		this.awareness.setLocalStateField(HOSTS_AWARENESS_FIELD, hosts);
		this.advertised = false;
	}

	private liveTexlyrePeers(): Map<string, PeerState> {
		const peers = new Map<string, PeerState>();
		for (const state of this.awareness.getStates().values()) {
			const peer = readPeerState(state);
			if (peer?.kind === 'texlyre') peers.set(peer.id, peer);
		}
		return peers;
	}

	private sync(): void {
		if (this.stopped) return;
		const localPeer = this.options.connection.peer;
		if (!localPeer.transportPeerId) return;
		const livePeers = this.liveTexlyrePeers();
		const relevant = new Set<string>();
		const now = Date.now();

		this.sessions.forEach((value, sessionId) => {
			if (!isSessionRequest(value) || value.id !== sessionId) return;
			if (
				value.baseRoomId !== this.options.baseRoomId ||
				value.label !== this.options.label ||
				value.targetHostPeerId !== localPeer.id ||
				value.targetHostInstanceId !== localPeer.instanceId ||
				value.targetHostTransportPeerId !== localPeer.transportPeerId
			) {
				return;
			}

			relevant.add(sessionId);
			if (value.status === 'error') {
				this.stopHost(sessionId);
				return;
			}

			const requester = livePeers.get(value.requesterPeerId);
			const requesterValid =
				requester?.instanceId === value.requesterInstanceId &&
				requester.transportPeerId === value.requesterTransportPeerId;
			if (!requesterValid) {
				const missingAt = this.missingSince.get(sessionId) ?? now;
				this.missingSince.set(sessionId, missingAt);
				if (now - missingAt >= REQUESTER_ABSENCE_GRACE_MS) {
					this.stopHost(sessionId);
					this.fail(value, 'TeXlyre requester is no longer present');
				}
				return;
			}
			this.missingSince.delete(sessionId);
			this.ensureHost(value);
		});

		for (const sessionId of Array.from(this.hosts.keys())) {
			if (!relevant.has(sessionId)) this.stopHost(sessionId);
		}
	}

	private ensureHost(request: SessionRequest): void {
		const existing = this.hosts.get(request.id);
		if (existing?.requestId === request.requestId) return;
		if (existing) this.stopHost(request.id);

		const rendezvous = acquireRendezvous(
			request.sessionRoomId,
			this.options.signaling,
		);
		const hosted: HostedSession = {
			host: null,
			rendezvous,
			requestId: request.requestId,
		};
		this.hosts.set(request.id, hosted);
		void this.startHost(request, hosted);
	}

	private async startHost(
		request: SessionRequest,
		hosted: HostedSession,
	): Promise<void> {
		try {
			await hosted.rendezvous.connection.ready;
		} catch (error) {
			if (this.hosts.get(request.id) !== hosted) return;
			this.fail(
				request,
				error instanceof Error ? error.message : String(error),
			);
			return;
		}

		if (this.stopped || this.hosts.get(request.id) !== hosted) return;
		const hostSessionTransportPeerId =
			hosted.rendezvous.connection.peer.transportPeerId;
		if (!hostSessionTransportPeerId) {
			this.fail(
				request,
				'Chelys service session has no WebRTC transport identity',
			);
			return;
		}

		const host = new TransportHost({
			provider: hosted.rendezvous.connection.provider,
			remoteTransportPeerId: request.requesterSessionTransportPeerId,
			channelLabel: request.channelLabel,
			label: this.options.label,
		});
		hosted.host = host;
		host.onChannel(this.options.onChannel);
		host.start();

		const ready = await host.whenReady();
		if (
			this.stopped ||
			!ready ||
			this.hosts.get(request.id) !== hosted ||
			hosted.host !== host
		) {
			return;
		}
		const current = this.sessions.get(request.id);
		if (!isSessionRequest(current) || current.requestId !== request.requestId) {
			this.stopHost(request.id);
			return;
		}
		if (current.status === 'requested') {
			this.sessions.set(request.id, {
				...current,
				targetHostSessionTransportPeerId: hostSessionTransportPeerId,
				status: 'ready',
			} satisfies SessionRequest);
		}
	}

	private fail(request: SessionRequest, error: string): void {
		const current = this.sessions.get(request.id);
		if (!isSessionRequest(current) || current.requestId !== request.requestId) {
			return;
		}
		this.sessions.set(request.id, {
			...current,
			status: 'error',
			error,
		} satisfies SessionRequest);
	}

	private failActiveRequests(error: string): void {
		const localPeer = this.options.connection.peer;
		const matching: SessionRequest[] = [];
		this.sessions.forEach((value, sessionId) => {
			if (!isSessionRequest(value) || value.id !== sessionId) return;
			if (
				value.baseRoomId === this.options.baseRoomId &&
				value.label === this.options.label &&
				value.targetHostPeerId === localPeer.id &&
				value.targetHostInstanceId === localPeer.instanceId &&
				value.status !== 'error'
			) {
				matching.push(value);
			}
		});
		for (const request of matching) this.fail(request, error);
	}

	private stopHost(sessionId: string): void {
		const hosted = this.hosts.get(sessionId);
		if (!hosted) return;
		this.hosts.delete(sessionId);
		hosted.host?.stop();
		hosted.rendezvous.release();
	}
}
