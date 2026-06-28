// src/contexts/ChelysContext.tsx
import type React from 'react';
import { type ReactNode, createContext, useEffect, useState } from 'react';

import { chelysAccountSyncService } from '../services/ChelysAccountSyncService';
import { chelysService } from '../services/ChelysService';
import { useAuth } from '../hooks/useAuth';

interface ChelysContextType {
	isEnrolled: boolean;
	isLoggedIn: boolean;
	isOnline: boolean;
	chelysRegister: (username: string, password: string) => Promise<string>;
	chelysLogin: (username: string, password: string) => Promise<void>;
	confirmChelysRegister: (username: string, password: string) => Promise<void>;
	enrollCurrent: (password: string) => Promise<string>;
	renameEnrollment: (newUsername: string) => Promise<void>;
	reauthenticate: (password: string, username?: string) => Promise<void>;
	getPrfHex: () => Promise<string>;
	logoutChelys: () => void;
	disconnect: () => Promise<void>;
}

export const ChelysContext = createContext<ChelysContextType>({
	isEnrolled: false,
	isLoggedIn: false,
	isOnline: false,
	chelysRegister: async () => {
		throw new Error('Not implemented');
	},
	chelysLogin: async () => {
		throw new Error('Not implemented');
	},
	confirmChelysRegister: async () => {
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

	const enrollCurrent = async (password: string): Promise<string> => {
		if (!user) throw new Error('No user');
		const prfHex = await chelysService.enrollCurrent(user, password);
		setIsLoggedIn(true);
		return prfHex;
	};

	const renameEnrollment = async (newUsername: string): Promise<void> => {
		if (!user) throw new Error('No user');
		await chelysService.renameEnrollment(user, newUsername);
	};

	const reauthenticate = async (
		password: string,
		username?: string,
	): Promise<void> => {
		if (!user) throw new Error('No user');
		await chelysService.reauthenticate(user, password, username);
		setIsLoggedIn(true);
	};

	const getPrfHex = async (): Promise<string> => {
		return chelysService.getPrfHex();
	};

	const logoutChelys = (): void => {
		if (!user) return;
		chelysService.logoutChelys(user.id);
		setIsLoggedIn(false);
	};

	const disconnect = async (): Promise<void> => {
		if (!user) throw new Error('No user');
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
				enrollCurrent,
				renameEnrollment,
				reauthenticate,
				getPrfHex,
				logoutChelys,
				disconnect,
			}}
		>
			{children}
		</ChelysContext.Provider>
	);
};
