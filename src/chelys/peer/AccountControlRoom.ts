// src/chelys/peer/AccountControlRoom.ts
import type { RendezvousUser } from './RendezvousRoom';
import type { ControlConnection } from './SessionContract';

export interface AccountControlRoomProvider {
	getRoomId(): string | null;
	getConnection(): ControlConnection | null;
	whenConnected(): Promise<ControlConnection>;
}

let accountControlRoom: AccountControlRoomProvider | null = null;
let localUser: RendezvousUser | null = null;

export function setAccountControlRoomProvider(
	provider: AccountControlRoomProvider | null,
): void {
	accountControlRoom = provider;
}

export function setAccountControlUser(user: RendezvousUser | null): void {
	localUser = user;
}

export function getAccountControlRoomId(): string | null {
	return accountControlRoom?.getRoomId() ?? null;
}

export function getAccountControlConnection(): ControlConnection | null {
	return accountControlRoom?.getConnection() ?? null;
}

export function whenAccountControlConnected(): Promise<ControlConnection> {
	if (!accountControlRoom) {
		return Promise.reject(
			new Error('No Chelys account control room is registered'),
		);
	}
	return accountControlRoom.whenConnected();
}

export function getAccountControlUser(): RendezvousUser | undefined {
	const state = getAccountControlConnection()?.awareness.getLocalState()
		?.user as Partial<RendezvousUser> | undefined;

	return state?.username
		? {
			id: state.id,
			username: state.username,
			name: state.name,
			color: state.color,
			colorLight: state.colorLight,
		}
		: localUser ?? undefined;
}
