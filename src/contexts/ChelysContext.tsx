// src/contexts/ChelysContext.tsx
import type React from 'react';
import { type ReactNode, createContext, useEffect, useState } from 'react';

import { t } from '@/i18n';
import { setAccountControlUser } from '@chelys/peer/AccountControlRoom';
import { chelysAccountSyncService } from '../services/ChelysAccountSyncService';
import { chelysService } from '../services/ChelysService';
import { useAuth } from '../hooks/useAuth';
import { getTempPrf, clearTempPrf } from '../utils/chelysWebauthn';

interface ChelysContextType {
	isEnrolled: boolean;
	isLoggedIn: boolean;
	isOnline: boolean;
	storageUnlocked: boolean;
	storageUnlockReady: boolean;
	chelysRegister: (username: string, password: string) => Promise<string>;
	chelysLogin: (username: string, password: string) => Promise<void>;
	confirmChelysRegister: (username: string, password: string) => Promise<void>;
	chelysLoginWithPrf: (
		username: string,
		password: string,
		prfHex: string,
	) => Promise<void>;
	confirmChelysRegisterWithPrf: (
		username: string,
		password: string,
		prfHex: string,
	) => Promise<void>;
	enrollCurrent: (password: string) => Promise<string>;
	renameEnrollment: (newUsername: string) => Promise<void>;
	unlockStorage: (password: string, username?: string) => Promise<void>;
	reauthenticate: (password: string, username?: string) => Promise<void>;
	getPrfHex: () => Promise<string>;
	isPrfPromptOpen: boolean;
	prfPasswordModalMessage: string;
	prfPasswordModalTitle: string;
	submitPrfPassword: (password: string) => Promise<boolean>;
	cancelPrfPrompt: () => void;
	logoutChelys: () => void;
	disconnect: () => Promise<void>;
}

export const ChelysContext = createContext<ChelysContextType>({
	isEnrolled: false,
	isLoggedIn: false,
	isOnline: false,
	storageUnlocked: false,
	storageUnlockReady: false,
	isPrfPromptOpen: false,
	prfPasswordModalMessage: '',
	prfPasswordModalTitle: '',
	chelysRegister: async () => {
		throw new Error('Not implemented');
	},
	chelysLogin: async () => {
		throw new Error('Not implemented');
	},
	confirmChelysRegister: async () => {
		throw new Error('Not implemented');
	},
	chelysLoginWithPrf: async () => {
		throw new Error('Not implemented');
	},
	confirmChelysRegisterWithPrf: async () => {
		throw new Error('Not implemented');
	},
	enrollCurrent: async () => {
		throw new Error('Not implemented');
	},
	renameEnrollment: async () => {
		throw new Error('Not implemented');
	},
	unlockStorage: async () => {
		throw new Error('Not implemented');
	},
	reauthenticate: async () => {
		throw new Error('Not implemented');
	},
	getPrfHex: async () => {
		throw new Error('Not implemented');
	},
	submitPrfPassword: async () => false,
	cancelPrfPrompt: () => {},
	logoutChelys: () => {},
	disconnect: async () => {
		throw new Error('Not implemented');
	},
});

interface ChelysProviderProps {
	children: ReactNode;
}

export const ChelysProvider: React.FC<ChelysProviderProps> = ({ children }) => {
	const { user, isGuestUser } = useAuth();
	const [isLoggedIn, setIsLoggedIn] = useState(false);
	const [storageUnlocked, setStorageUnlocked] = useState(false);
	const [storageUnlockReadyUserId, setStorageUnlockReadyUserId] = useState<
		string | null
	>(null);

	const [isPrfPromptOpen, setIsPrfPromptOpen] = useState(false);
	const prfPasswordModalMessage = t(
		'Enter your TeXlyre password to finish connecting Chelys:',
	);
	const prfPasswordModalTitle = t('Connect Chelys');

	const isEnrolled = !isGuestUser(user) && chelysService.isEnrolled(user);
	// Readiness is user-scoped so a restored login cannot inherit the pre-auth
	// `ready` state and prompt before its cached storage key has been restored.
	const storageUnlockReady =
		!user || isGuestUser(user)
			? true
			: storageUnlockReadyUserId === user.id;

	useEffect(() => {
		setAccountControlUser(
			user
				? {
						id: user.id,
						username: user.username,
						name: user.name ?? user.username,
						color: user.color,
						colorLight: user.colorLight,
					}
				: null,
		);

		return () => setAccountControlUser(null);
	}, [user]);

	useEffect(() => {
		if (!user || isGuestUser(user)) {
			chelysAccountSyncService.stop();
			setIsLoggedIn(false);
			setStorageUnlocked(false);
			setStorageUnlockReadyUserId(null);
			return;
		}

		let active = true;
		setStorageUnlockReadyUserId(null);
		void chelysService.restoreStorageWrappingKey(user.id).then((unlocked) => {
			if (!active) return;
			setStorageUnlocked(unlocked);
			setStorageUnlockReadyUserId(user.id);
		});

		const keys = chelysService.getRoomKeys(user.id);
		setIsLoggedIn(keys !== null);
		if (keys) {
			void chelysAccountSyncService.start(
				keys.roomId,
				keys.roomKey,
				user.id,
				user.username,
				user.color,
				user.colorLight,
			);
		} else {
			chelysAccountSyncService.stop();
		}
		if (getTempPrf()) setIsPrfPromptOpen(true);

		return () => {
			active = false;
		};
	}, [user, isGuestUser]);

	const chelysRegister = async (
		username: string,
		password: string,
	): Promise<string> => {
		const prfHex = await chelysService.chelysRegister(username, password);
		setIsLoggedIn(true);
		setStorageUnlocked(true);
		if (user) setStorageUnlockReadyUserId(user.id);
		return prfHex;
	};

	const chelysLogin = async (
		username: string,
		password: string,
	): Promise<void> => {
		await chelysService.chelysLogin(username, password);
		setIsLoggedIn(true);
		setStorageUnlocked(true);
	};

	const confirmChelysRegister = async (
		username: string,
		password: string,
	): Promise<void> => {
		await chelysService.confirmChelysRegister(username, password);
		setIsLoggedIn(true);
		setStorageUnlocked(true);
	};

	const chelysLoginWithPrf = async (
		username: string,
		password: string,
		prfHex: string,
	): Promise<void> => {
		await chelysService.chelysLoginWithPrf(username, password, prfHex);
		setIsLoggedIn(true);
		setStorageUnlocked(true);
	};

	const confirmChelysRegisterWithPrf = async (
		username: string,
		password: string,
		prfHex: string,
	): Promise<void> => {
		await chelysService.confirmChelysRegisterWithPrf(
			username,
			password,
			prfHex,
		);
		setIsLoggedIn(true);
		setStorageUnlocked(true);
	};

	const enrollCurrent = async (password: string): Promise<string> => {
		if (!user) throw new Error(t('No user'));
		const prfHex = await chelysService.enrollCurrent(user, password);
		setIsLoggedIn(true);
		setStorageUnlocked(true);
		setStorageUnlockReadyUserId(user.id);
		return prfHex;
	};

	const renameEnrollment = async (newUsername: string): Promise<void> => {
		if (!user) throw new Error(t('No user'));
		await chelysService.renameEnrollment(user, newUsername);
	};

	const unlockStorage = async (
		password: string,
		username?: string,
	): Promise<void> => {
		if (!user) throw new Error(t('No user'));
		await chelysService.unlockStorage(user, password, username);
		setStorageUnlocked(true);
		setStorageUnlockReadyUserId(user.id);
	};

	const reauthenticate = async (
		password: string,
		username?: string,
	): Promise<void> => {
		if (!user) throw new Error(t('No user'));
		await chelysService.reauthenticate(user, password, username);
		setIsLoggedIn(true);
		setStorageUnlocked(true);
		setStorageUnlockReadyUserId(user.id);
	};

	const getPrfHex = async (): Promise<string> => {
		return chelysService.getPrfHex();
	};

	const submitPrfPassword = async (password: string): Promise<boolean> => {
		const prfHex = getTempPrf();
		if (!user || !prfHex) return false;
		try {
			await chelysLoginWithPrf(user.username, password, prfHex);
		} catch {
			return false;
		}
		clearTempPrf();
		setIsPrfPromptOpen(false);
		return true;
	};

	const cancelPrfPrompt = (): void => {
		clearTempPrf();
		setIsPrfPromptOpen(false);
	};

	const logoutChelys = (): void => {
		if (!user) return;
		chelysService.logoutChelys(user.id);
		setIsLoggedIn(false);
		setStorageUnlocked(false);
		setStorageUnlockReadyUserId(user.id);
	};

	const disconnect = async (): Promise<void> => {
		if (!user) throw new Error(t('No user'));
		await chelysService.disconnect(user);
		setIsLoggedIn(false);
		setStorageUnlocked(chelysService.getStorageWrappingKey() !== null);
	};

	return (
		<ChelysContext.Provider
			value={{
				isEnrolled,
				isLoggedIn,
				isOnline: false,
				storageUnlocked,
				storageUnlockReady,
				chelysRegister,
				chelysLogin,
				confirmChelysRegister,
				chelysLoginWithPrf,
				confirmChelysRegisterWithPrf,
				enrollCurrent,
				renameEnrollment,
				unlockStorage,
				reauthenticate,
				getPrfHex,
				isPrfPromptOpen,
				prfPasswordModalMessage,
				prfPasswordModalTitle,
				submitPrfPassword,
				cancelPrfPrompt,
				logoutChelys,
				disconnect,
			}}
		>
			{children}
		</ChelysContext.Provider>
	);
};
