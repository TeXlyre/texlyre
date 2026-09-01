// src/utils/userDataUtils.ts

export type UserDataType =
	| 'settings'
	| 'properties'
	| 'secrets'
	| 'records'
	| 'all';

export type ConcreteUserDataType = Exclude<UserDataType, 'all'>;

export interface UserDataMutation {
	key: string;
	value?: unknown;
	deleted?: boolean;
}

export interface UserDataChangedDetail {
	userId: string;
	type: ConcreteUserDataType;
	mutation?: UserDataMutation;
}

export const USER_DATA_CHANGED = 'texlyre-user-data-changed';
export const FORCED_DEFAULTS_KEY = 'texlyre-forced-defaults';

export interface ForcedUserData {
	version: string;
	settings: Record<string, unknown>;
	properties: Record<string, unknown>;
}

export function getForcedUserData(): ForcedUserData | null {
	try {
		const raw = localStorage.getItem(FORCED_DEFAULTS_KEY);
		const parsed = raw ? JSON.parse(raw) : null;
		return parsed?.version ? parsed : null;
	} catch {
		return null;
	}
}

export function getUserDataKey(
	userId: string,
	type: ConcreteUserDataType,
): string {
	return `texlyre-user-${userId}-${type}`;
}

export function getUserData<T = any>(
	userId: string,
	type: ConcreteUserDataType,
): T | null {
	const data = localStorage.getItem(getUserDataKey(userId, type));
	return data ? JSON.parse(data) : null;
}

export const notifyUserDataChanged = (
	userId: string,
	type: ConcreteUserDataType,
	mutation?: UserDataMutation,
): void => {
	window.dispatchEvent(
		new CustomEvent<UserDataChangedDetail>(USER_DATA_CHANGED, {
			detail: { userId, type, mutation },
		}),
	);
};

export function setUserData(
	userId: string,
	type: ConcreteUserDataType,
	data: any,
): void {
	localStorage.setItem(getUserDataKey(userId, type), JSON.stringify(data));
	notifyUserDataChanged(userId, type);
}

export function clearUserData(userId: string, type: UserDataType): void {
	const types: ConcreteUserDataType[] =
		type === 'all' ? ['settings', 'properties', 'secrets', 'records'] : [type];
	for (const current of types) {
		localStorage.removeItem(getUserDataKey(userId, current));
		notifyUserDataChanged(userId, current);
	}
}

export function exportUserData(userId: string, type: UserDataType): any {
	if (type === 'all') {
		return {
			settings: getUserData(userId, 'settings'),
			properties: getUserData(userId, 'properties'),
			secrets: getUserData(userId, 'secrets'),
			records: getUserData(userId, 'records'),
		};
	}
	return getUserData(userId, type);
}

export function importUserData(userId: string, data: any): void {
	if (data.settings) setUserData(userId, 'settings', data.settings);
	if (data.properties) setUserData(userId, 'properties', data.properties);
	if (data.secrets) setUserData(userId, 'secrets', data.secrets);
	if (data.records) setUserData(userId, 'records', data.records);
}

export async function downloadUserData(
	userId: string,
	type: UserDataType,
): Promise<void> {
	const data = exportUserData(userId, type);
	const blob = new Blob([JSON.stringify(data, null, 2)], {
		type: 'application/json',
	});
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = `texlyre-userdata-${type}-${Date.now()}.json`;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(url);
}

export async function importFromFile(
	userId: string,
	file: File,
): Promise<void> {
	importUserData(userId, JSON.parse(await file.text()));
}
