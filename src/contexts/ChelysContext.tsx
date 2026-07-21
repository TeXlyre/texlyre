// src/contexts/ChelysContext.tsx
import type React from 'react';
import { type ReactNode, createContext, useEffect, useState } from 'react';

import { t } from '@/i18n';
import { chelysAccountSyncService } from '../services/ChelysAccountSyncService';
import { chelysService } from '../services/ChelysService';
import { useAuth } from '../hooks/useAuth';
import { getTempPrf, clearTempPrf } from '../utils/chelysWebauthn';

interface ChelysContextType {
	isEnrolled: boolean;
	isLoggedIn: boolean;
	isOnline: boolean;
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

	const [isPrfPromptOpen, setIsPrfPromptOpen] = useState(false);
	const prfPasswordModalMessage = t(
		'Enter your TeXlyre password to finish connecting Chelys:',
	);
	const prfPasswordModalTitle = t('Connect Chelys');

	const isEnrolled = !isGuestUser(user) && chelysService.isEnrolled(user);

	useEffect(() => {
		if (!user || isGuestUser(user)) {
			setIsLoggedIn(false);
			return;
		}
		const keys = chelysService.getRoomKeys(user.id);
		setIsLoggedIn(keys !== null);
		if (keys) {
			void chelysAccountSyncService.start(
				keys.roomId,
				keys.roomKey,
				user.id,
				user.username,
			);
		}
		if (getTempPrf()) setIsPrfPromptOpen(true);
	}, [user, isGuestUser]);

	const chelysRegister = async (
		username: string,
		password: string,
	): Promise<string> => {
		const prfHex = await chelysService.chelysRegister(username, password);
		setIsLoggedIn(true);
		return prfHex;
	};

	const chelysLogin = async (
		username: string,
		password: string,
	): Promise<void> => {
		await chelysService.chelysLogin(username, password);
		setIsLoggedIn(true);
	};

	const confirmChelysRegister = async (
		username: string,
		password: string,
	): Promise<void> => {
		await chelysService.confirmChelysRegister(username, password);
		setIsLoggedIn(true);
	};

	const chelysLoginWithPrf = async (
		username: string,
		password: string,
		prfHex: string,
	): Promise<void> => {
		await chelysService.chelysLoginWithPrf(username, password, prfHex);
		setIsLoggedIn(true);
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
	};

	const enrollCurrent = async (password: string): Promise<string> => {
		if (!user) throw new Error(t('No user'));
		const prfHex = await chelysService.enrollCurrent(user, password);
		setIsLoggedIn(true);
		return prfHex;
	};

	const renameEnrollment = async (newUsername: string): Promise<void> => {
		if (!user) throw new Error(t('No user'));
		await chelysService.renameEnrollment(user, newUsername);
	};

	const reauthenticate = async (
		password: string,
		username?: string,
	): Promise<void> => {
		if (!user) throw new Error(t('No user'));
		await chelysService.reauthenticate(user, password, username);
		setIsLoggedIn(true);
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
	};

	const disconnect = async (): Promise<void> => {
		if (!user) throw new Error(t('No user'));
		await chelysService.disconnect(user);
		setIsLoggedIn(false);
	};

	return (
		<ChelysContext.Provider
			value={{
				isEnrolled,
				isLoggedIn,
				isOnline: false,
				chelysRegister,
				chelysLogin,
				confirmChelysRegister,
				chelysLoginWithPrf,
				confirmChelysRegisterWithPrf,
				enrollCurrent,
				renameEnrollment,
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
