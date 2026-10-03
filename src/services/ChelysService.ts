// src/services/ChelysService.ts
import { t } from '@/i18n';
import {
	deriveIdentity,
	fromHex,
	type DerivedIdentity,
} from '@chelys/protocol';
import type { User } from '../types/auth';
import { authService } from './AuthService';
import { chelysAccountSyncService } from './ChelysAccountSyncService';
import {
	displayPrfHex,
	enrollCredential,
	signalUsernameChange,
	retrievePrfOutput,
	ChelysAccountNotFoundError,
} from '../utils/chelysWebauthn';
import { validatePassword, validateUsername } from '../utils/authUtils';
import {
	deriveStorageWrappingKey,
	exportStorageWrappingKey,
	importStorageWrappingKey,
} from '../utils/storageEncryptionUtils';

const roomKey = (userId: string): string =>
	`texlyre-user-${userId}-chelys-room`;
const credentialKey = (userId: string): string =>
	`texlyre-user-${userId}-chelys-credential`;
const storageUnlockedKey = (userId: string): string =>
	`texlyre-user-${userId}-storage-wrapping-key`;
const legacyStorageSessionKey = (userId: string): string =>
	`texlyre-user-${userId}-storage-wrapping-key-session`;

class ChelysService {
	private storageWrappingKey: CryptoKey | null = null;
	private storageWrappingKeyUserId: string | null = null;

	isEnrolled(user: User | null): boolean {
		return !!user?.isChelysEnrolled;
	}

	async chelysRegister(username: string, password: string): Promise<string> {
		if (await authService.getUserByUsername(username)) {
			throw new Error(t('Username already exists'));
		}
		const prfOutput = await enrollCredential(username);
		const user = await authService.register(username, password);
		localStorage.setItem(credentialKey(user.id), username);
		await this.finalize(user, password, prfOutput);
		return displayPrfHex(prfOutput);
	}

	async chelysLogin(username: string, password: string): Promise<void> {
		const prfOutput = await retrievePrfOutput();

		let user: User;
		try {
			user = await authService.login(username, password);
		} catch (error) {
			if (error instanceof Error && error.message === t('User not found')) {
				const invalid =
					validateUsername(username) || validatePassword(password);
				if (invalid) throw new Error(invalid);
				throw new ChelysAccountNotFoundError();
			}
			throw error;
		}

		await this.finalize(user, password, prfOutput);
	}

	async confirmChelysRegister(
		username: string,
		password: string,
	): Promise<void> {
		const prfOutput = await retrievePrfOutput();
		const user = await authService.register(username, password);
		await this.finalize(user, password, prfOutput);
	}

	async chelysLoginWithPrf(
		username: string,
		password: string,
		prfHex: string,
	): Promise<void> {
		const prfOutput = fromHex(prfHex.trim().toLowerCase());

		let user: User;
		try {
			user = await authService.login(username, password);
		} catch (error) {
			if (error instanceof Error && error.message === t('User not found')) {
				const invalid =
					validateUsername(username) || validatePassword(password);
				if (invalid) throw new Error(invalid);
				throw new ChelysAccountNotFoundError();
			}
			throw error;
		}

		await this.finalize(user, password, prfOutput);
	}

	async confirmChelysRegisterWithPrf(
		username: string,
		password: string,
		prfHex: string,
	): Promise<void> {
		const prfOutput = fromHex(prfHex.trim().toLowerCase());
		const user = await authService.register(username, password);
		await this.finalize(user, password, prfOutput);
	}

	async enrollCurrent(user: User, password: string): Promise<string> {
		const prfOutput = await enrollCredential(user.username);
		localStorage.setItem(credentialKey(user.id), user.username);
		await this.finalize(user, password, prfOutput);
		return displayPrfHex(prfOutput);
	}

	async renameEnrollment(user: User, newUsername: string): Promise<void> {
		const enrollmentUsername =
			localStorage.getItem(credentialKey(user.id)) || user.username;
		await signalUsernameChange(enrollmentUsername, newUsername);
	}

	getStorageWrappingKey(): CryptoKey | null {
		return this.storageWrappingKey;
	}

	async restoreStorageWrappingKey(userId: string): Promise<boolean> {
		if (this.storageWrappingKey && this.storageWrappingKeyUserId === userId) {
			return true;
		}
		this.storageWrappingKey = null;
		this.storageWrappingKeyUserId = null;
		let stored = localStorage.getItem(storageUnlockedKey(userId));
		if (!stored) {
			stored = sessionStorage.getItem(legacyStorageSessionKey(userId));
			if (stored) {
				localStorage.setItem(storageUnlockedKey(userId), stored);
				sessionStorage.removeItem(legacyStorageSessionKey(userId));
			}
		}
		if (!stored) return false;
		try {
			this.storageWrappingKey = await importStorageWrappingKey(stored);
			this.storageWrappingKeyUserId = userId;
			return true;
		} catch {
			localStorage.removeItem(storageUnlockedKey(userId));
			sessionStorage.removeItem(legacyStorageSessionKey(userId));
			return false;
		}
	}

	async unlockStorage(
		user: User,
		password: string,
		username: string = user.username,
	): Promise<void> {
		if (
			this.storageWrappingKey &&
			this.storageWrappingKeyUserId === user.id
		) {
			return;
		}
		if (!(await authService.verifyPassword(user.id, password))) {
			throw new Error(t('Current password is incorrect'));
		}
		const prfOutput = await retrievePrfOutput();
		await this.setStorageWrappingKey(
			user.id,
			await deriveStorageWrappingKey({ username, password, prfOutput }),
		);
	}

	async reauthenticate(
		user: User,
		password: string,
		username: string = user.username,
	): Promise<void> {
		const prfOutput = await retrievePrfOutput();
		const { identity, storageWrappingKey } = await this.deriveSessionKeys(
			username,
			password,
			prfOutput,
		);
		await this.setStorageWrappingKey(user.id, storageWrappingKey);
		void this.persistRoom(user, identity, username);
		if (!user.isChelysEnrolled) {
			await authService.updateUser({ ...user, isChelysEnrolled: true });
		}
	}

	async getPrfHex(): Promise<string> {
		const prfOutput = await retrievePrfOutput();
		return displayPrfHex(prfOutput);
	}

	async disconnect(user: User): Promise<void> {
		this.clearChelysConnection(user.id);
		await authService.updateUser({ ...user, isChelysEnrolled: false });
	}

	logoutChelys(userId: string): void {
		this.clearChelysConnection(userId);
		this.clearStorageUnlock(userId);
	}

	getRoomKeys(userId: string): DerivedIdentity | null {
		const raw = localStorage.getItem(roomKey(userId));
		if (!raw) return null;
		try {
			return JSON.parse(raw) as DerivedIdentity;
		} catch {
			return null;
		}
	}

	private async finalize(
		user: User,
		password: string,
		prfOutput: Uint8Array,
	): Promise<void> {
		const { identity, storageWrappingKey } = await this.deriveSessionKeys(
			user.username,
			password,
			prfOutput,
		);
		await this.persistRoom(user, identity, user.username);
		await this.setStorageWrappingKey(user.id, storageWrappingKey);
		if (!user.isChelysEnrolled) {
			await authService.updateUser({ ...user, isChelysEnrolled: true });
		}
	}

	private async deriveSessionKeys(
		username: string,
		password: string,
		prfOutput: Uint8Array,
	): Promise<{ identity: DerivedIdentity; storageWrappingKey: CryptoKey }> {
		const [identity, storageWrappingKey] = await Promise.all([
			deriveIdentity({ username, password, prfOutput }),
			deriveStorageWrappingKey({ username, password, prfOutput }),
		]);
		return { identity, storageWrappingKey };
	}

	private async persistRoom(
		user: User,
		identity: DerivedIdentity,
		username: string,
	): Promise<void> {
		localStorage.setItem(roomKey(user.id), JSON.stringify(identity));
		await chelysAccountSyncService.start(
			identity.roomId,
			identity.roomKey,
			user.id,
			username,
			user.color,
			user.colorLight,
		);
	}

	private async setStorageWrappingKey(
		userId: string,
		key: CryptoKey,
	): Promise<void> {
		this.storageWrappingKey = key;
		this.storageWrappingKeyUserId = userId;
		localStorage.setItem(
			storageUnlockedKey(userId),
			await exportStorageWrappingKey(key),
		);
		sessionStorage.removeItem(legacyStorageSessionKey(userId));
	}

	private clearChelysConnection(userId: string): void {
		localStorage.removeItem(roomKey(userId));
		chelysAccountSyncService.stop();
		chelysAccountSyncService.clearSyncState(userId);
	}

	private clearStorageUnlock(userId: string): void {
		if (this.storageWrappingKeyUserId === userId) {
			this.storageWrappingKey = null;
			this.storageWrappingKeyUserId = null;
		}
		localStorage.removeItem(storageUnlockedKey(userId));
		sessionStorage.removeItem(legacyStorageSessionKey(userId));
	}
}

export const chelysService = new ChelysService();
