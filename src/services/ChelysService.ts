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
	derivePasswordStorageWrappingKey,
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
const storageWrappingMethodKey = (userId: string): string =>
	`texlyre-user-${userId}-storage-wrapping-method`;
const storageAccountKey = (userId: string): string =>
	`texlyre-user-${userId}-storage-account-key`;

type StorageWrappingMethod = 'password-v1' | 'prf-v1';

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
			if (!localStorage.getItem(storageWrappingMethodKey(userId))) {
				localStorage.setItem(storageWrappingMethodKey(userId), 'prf-v1');
			}
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
		if (this.storageWrappingKey && this.storageWrappingKeyUserId === user.id) {
			return;
		}
		if (!(await authService.verifyPassword(user.id, password))) {
			throw new Error(t('Current password is incorrect'));
		}
		const method = this.getStorageWrappingMethod(user);
		const wrappingKey =
			method === 'prf-v1'
				? await deriveStorageWrappingKey({
						username,
						password,
						prfOutput: await retrievePrfOutput(),
					})
				: await derivePasswordStorageWrappingKey(username, password);
		await this.setStorageWrappingKey(user.id, wrappingKey, method);
	}

	async reauthenticate(
		user: User,
		password: string,
		username: string = user.username,
	): Promise<void> {
		const prfOutput = await retrievePrfOutput();
		const { identity, storageWrappingKey, storageWrappingMethod } =
			await this.deriveSessionKeys(user, username, password, prfOutput);
		await this.setStorageWrappingKey(
			user.id,
			storageWrappingKey,
			storageWrappingMethod,
		);
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
		const { identity, storageWrappingKey, storageWrappingMethod } =
			await this.deriveSessionKeys(user, user.username, password, prfOutput);
		await this.persistRoom(user, identity, user.username);
		await this.setStorageWrappingKey(
			user.id,
			storageWrappingKey,
			storageWrappingMethod,
		);
		if (!user.isChelysEnrolled) {
			await authService.updateUser({ ...user, isChelysEnrolled: true });
		}
	}

	private async deriveSessionKeys(
		user: User,
		username: string,
		password: string,
		prfOutput: Uint8Array,
	): Promise<{
		identity: DerivedIdentity;
		storageWrappingKey: CryptoKey;
		storageWrappingMethod: StorageWrappingMethod;
	}> {
		const storageWrappingMethod = this.getStorageWrappingMethod(user);
		const [identity, storageWrappingKey] = await Promise.all([
			deriveIdentity({ username, password, prfOutput }),
			storageWrappingMethod === 'prf-v1'
				? deriveStorageWrappingKey({ username, password, prfOutput })
				: derivePasswordStorageWrappingKey(username, password),
		]);
		return { identity, storageWrappingKey, storageWrappingMethod };
	}

	private getStorageWrappingMethod(user: User): StorageWrappingMethod {
		const stored = localStorage.getItem(storageWrappingMethodKey(user.id));
		if (stored === 'password-v1' || stored === 'prf-v1') return stored;
		if (localStorage.getItem(storageAccountKey(user.id))) return 'prf-v1';
		return user.isChelysEnrolled ? 'prf-v1' : 'password-v1';
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
		method: StorageWrappingMethod,
	): Promise<void> {
		this.storageWrappingKey = key;
		this.storageWrappingKeyUserId = userId;
		localStorage.setItem(
			storageUnlockedKey(userId),
			await exportStorageWrappingKey(key),
		);
		localStorage.setItem(storageWrappingMethodKey(userId), method);
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
