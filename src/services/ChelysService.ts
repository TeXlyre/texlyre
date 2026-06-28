// src/services/ChelysService.ts
import { deriveIdentity, type DerivedIdentity } from '@chelys/protocol';

import { t } from '@/i18n';
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

const roomKey = (userId: string): string =>
	`texlyre-user-${userId}-chelys-room`;
const credentialKey = (userId: string): string =>
	`texlyre-user-${userId}-chelys-credential`;

class ChelysService {
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

	async reauthenticate(
		user: User,
		password: string,
		username: string = user.username,
	): Promise<void> {
		const prfOutput = await retrievePrfOutput();
		const identity = await deriveIdentity({
			username,
			password,
			prfOutput,
		});
		this.persistRoom(user.id, identity, username);
		if (!user.isChelysEnrolled) {
			await authService.updateUser({ ...user, isChelysEnrolled: true });
		}
	}

	async getPrfHex(): Promise<string> {
		const prfOutput = await retrievePrfOutput();
		return displayPrfHex(prfOutput);
	}

	async disconnect(user: User): Promise<void> {
		this.clearRoom(user.id);
		await authService.updateUser({ ...user, isChelysEnrolled: false });
	}

	logoutChelys(userId: string): void {
		this.clearRoom(userId);
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
		const identity = await deriveIdentity({
			username: user.username,
			password,
			prfOutput,
		});
		this.persistRoom(user.id, identity, user.username);
		if (!user.isChelysEnrolled) {
			await authService.updateUser({ ...user, isChelysEnrolled: true });
		}
	}

	private persistRoom(
		userId: string,
		identity: DerivedIdentity,
		username: string,
	): void {
		localStorage.setItem(roomKey(userId), JSON.stringify(identity));
		void chelysAccountSyncService.start(
			identity.roomId,
			identity.roomKey,
			userId,
			username,
		);
	}

	private clearRoom(userId: string): void {
		localStorage.removeItem(roomKey(userId));
		chelysAccountSyncService.stop();
	}
}

export const chelysService = new ChelysService();
