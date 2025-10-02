// src/contexts/SecretsContext.tsx
import type React from 'react';
import {
	type ReactNode,
	createContext,
	useCallback,
	useEffect,
	useState,
} from 'react';

import { useAuth } from '../hooks/useAuth';

export interface SecretValue {
	value: string;
	metadata?: Record<string, any>;
	lastModified: number;
}

export interface SecretEntry {
	pluginId: string;
	scope: 'global' | 'project';
	projectId?: string | null;
	secretKey: string;
	encryptedValue: string;
	metadata?: Record<string, any>;
	lastModified: number;
}

export interface SecretsContextType {
	isPasswordSet: boolean;
	setPassword: (password: string) => Promise<boolean>;
	clearPassword: () => void;
	setSecret: (
		pluginId: string,
		secretKey: string,
		value: string,
		options?: {
			scope?: 'global' | 'project';
			projectId?: string | null;
			metadata?: Record<string, any>;
		},
	) => Promise<void>;
	getSecret: (
		pluginId: string,
		secretKey: string,
		options?: {
			scope?: 'global' | 'project';
			projectId?: string | null;
		},
	) => Promise<SecretValue | null>;
	removeSecret: (
		pluginId: string,
		secretKey: string,
		options?: {
			scope?: 'global' | 'project';
			projectId?: string | null;
		},
	) => Promise<void>;
	hasSecret: (
		pluginId: string,
		secretKey: string,
		options?: {
			scope?: 'global' | 'project';
			projectId?: string | null;
		},
	) => boolean;
	promptForPassword: (message?: string) => Promise<string | null>;
	getSecretMetadata: (
		pluginId: string,
		secretKey: string,
		options?: {
			scope?: 'global' | 'project';
			projectId?: string | null;
		},
	) => Record<string, any> | null;
	clearAllSecrets: (pluginId?: string) => Promise<void>;
	isPasswordModalOpen: boolean;
	passwordModalMessage: string;
	showPasswordModal: (message?: string) => Promise<string | null>;
	hidePasswordModal: () => void;
	submitPassword: (password: string) => Promise<boolean>;
}

export const SecretsContext = createContext<SecretsContextType>({
	isPasswordSet: false,
	setPassword: async () => false,
	clearPassword: () => { },
	setSecret: async () => { },
	getSecret: async () => null,
	removeSecret: async () => { },
	hasSecret: () => false,
	promptForPassword: async () => null,
	getSecretMetadata: () => null,
	clearAllSecrets: async () => { },
	isPasswordModalOpen: false,
	passwordModalMessage: '',
	showPasswordModal: async () => null,
	hidePasswordModal: () => { },
	submitPassword: async () => false,
});

interface SecretsProviderProps {
	children: ReactNode;
}

export const SecretsProvider: React.FC<SecretsProviderProps> = ({
	children,
}) => {
	const { user } = useAuth();
	const [userPassword, setUserPassword] = useState<string | null>(null);
	const [secretsCache, setSecretsCache] = useState<Map<string, SecretValue>>(
		new Map(),
	);

	const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
	const [passwordModalMessage, setPasswordModalMessage] = useState('');
	const [passwordResolve, setPasswordResolve] = useState<
		((password: string | null) => void) | null
	>(null);

	const isPasswordSet = userPassword !== null;

	const getStorageKey = useCallback((userId: string): string => {
		return `texlyre-user-${userId}-secrets`;
	}, []);

	const getSecretId = useCallback(
		(
			pluginId: string,
			secretKey: string,
			scope: 'global' | 'project' = 'global',
			projectId?: string | null,
		): string => {
			return scope === 'project' && projectId
				? `${pluginId}:${scope}:${projectId}:${secretKey}`
				: `${pluginId}:${scope}:${secretKey}`;
		},
		[],
	);

	const _hashWithPassword = useCallback(
		async (data: string, password: string): Promise<string> => {
			const encoder = new TextEncoder();
			const combined = encoder.encode(data + password);
			const hashBuffer = await crypto.subtle.digest('SHA-256', combined);
			const hashArray = Array.from(new Uint8Array(hashBuffer));
			return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
		},
		[],
	);

	const encryptWithPassword = useCallback(
		async (data: string, password: string): Promise<string> => {
			const encoder = new TextEncoder();
			const dataBuffer = encoder.encode(data);

			const passwordBuffer = encoder.encode(password);
			const keyMaterial = await crypto.subtle.importKey(
				'raw',
				passwordBuffer,
				{ name: 'PBKDF2' },
				false,
				['deriveKey'],
			);

			const salt = crypto.getRandomValues(new Uint8Array(16));

			const key = await crypto.subtle.deriveKey(
				{
					name: 'PBKDF2',
					salt: salt,
					iterations: 100000,
					hash: 'SHA-256',
				},
				keyMaterial,
				{ name: 'AES-GCM', length: 256 },
				false,
				['encrypt'],
			);

			const iv = crypto.getRandomValues(new Uint8Array(12));

			const encrypted = await crypto.subtle.encrypt(
				{ name: 'AES-GCM', iv: iv },
				key,
				dataBuffer,
			);

			const result = new Uint8Array(
				salt.length + iv.length + encrypted.byteLength,
			);
			result.set(salt, 0);
			result.set(iv, salt.length);
			result.set(new Uint8Array(encrypted), salt.length + iv.length);

			return btoa(String.fromCharCode(...result));
		},
		[],
	);

	const decryptWithPassword = useCallback(
		async (encryptedData: string, password: string): Promise<string> => {
			try {
				const encoder = new TextEncoder();
				const decoder = new TextDecoder();

				const data = new Uint8Array(
					atob(encryptedData)
						.split('')
						.map((c) => c.charCodeAt(0)),
				);

				const salt = data.slice(0, 16);
				const iv = data.slice(16, 28);
				const encrypted = data.slice(28);

				const passwordBuffer = encoder.encode(password);
				const keyMaterial = await crypto.subtle.importKey(
					'raw',
					passwordBuffer,
					{ name: 'PBKDF2' },
					false,
					['deriveKey'],
				);

				const key = await crypto.subtle.deriveKey(
					{
						name: 'PBKDF2',
						salt: salt,
						iterations: 100000,
						hash: 'SHA-256',
					},
					keyMaterial,
					{ name: 'AES-GCM', length: 256 },
					false,
					['decrypt'],
				);

				const decrypted = await crypto.subtle.decrypt(
					{ name: 'AES-GCM', iv: iv },
					key,
					encrypted,
				);

				return decoder.decode(decrypted);
			} catch (_error) {
				throw new Error(
					'Failed to decrypt secret - invalid password or corrupted data',
				);
			}
		},
		[],
	);

	const verifyPassword = useCallback(
		async (password: string): Promise<boolean> => {
			if (!user) return false;

			try {
				const { authService } = await import('../services/AuthService');
				return await authService.verifyPassword(user.id, password);
			} catch (error) {
				console.error('Error verifying password:', error);
				return false;
			}
		},
		[user],
	);

	const loadStoredSecrets = useCallback(
		async (_password: string): Promise<void> => {
			if (!user) return;

			try {
				const storageKey = getStorageKey(user.id);
				const storedData = localStorage.getItem(storageKey);

				if (!storedData) {
					setSecretsCache(new Map());
					return;
				}

				const secrets: SecretEntry[] = JSON.parse(storedData);
				const newCache = new Map<string, SecretValue>();

				for (const entry of secrets) {
					try {
						const secretId = getSecretId(
							entry.pluginId,
							entry.secretKey,
							entry.scope,
							entry.projectId,
						);

						newCache.set(secretId, {
							value: '',
							metadata: entry.metadata,
							lastModified: entry.lastModified,
						});
					} catch (error) {
						console.error(
							`Error processing secret ${entry.pluginId}:${entry.secretKey}:`,
							error,
						);
					}
				}

				setSecretsCache(newCache);
			} catch (error) {
				console.error('Error loading stored secrets:', error);
				setSecretsCache(new Map());
			}
		},
		[user, getStorageKey, getSecretId],
	);

	const _saveSecretsToStorage = useCallback(async (): Promise<void> => {
		if (!user || !userPassword) return;

		try {
			const storageKey = getStorageKey(user.id);
			const storedData = localStorage.getItem(storageKey);
			const existingSecrets: SecretEntry[] = storedData
				? JSON.parse(storedData)
				: [];

			localStorage.setItem(storageKey, JSON.stringify(existingSecrets));
		} catch (error) {
			console.error('Error saving secrets to storage:', error);
		}
	}, [user, userPassword, getStorageKey]);

	const setPassword = useCallback(
		async (password: string): Promise<boolean> => {
			if (!password.trim()) return false;

			const isValid = await verifyPassword(password);
			if (!isValid) return false;

			setUserPassword(password);
			await loadStoredSecrets(password);
			return true;
		},
		[verifyPassword, loadStoredSecrets],
	);

	const clearPassword = useCallback(() => {
		setUserPassword(null);
		setSecretsCache(new Map());
	}, []);

	const promptForPassword = useCallback(
		async (message?: string): Promise<string | null> => {
			if (userPassword) return userPassword;

			return new Promise((resolve) => {
				setPasswordModalMessage(
					message || 'Enter your TeXlyre password to access encrypted secrets:',
				);
				setPasswordResolve(() => resolve);
				setIsPasswordModalOpen(true);
			});
		},
		[userPassword],
	);

	const showPasswordModal = useCallback(
		async (message?: string): Promise<string | null> => {
			return promptForPassword(message);
		},
		[promptForPassword],
	);

	const hidePasswordModal = useCallback(() => {
		setIsPasswordModalOpen(false);
		if (passwordResolve) {
			passwordResolve(null);
			setPasswordResolve(null);
		}
	}, [passwordResolve]);

	const submitPassword = useCallback(
		async (password: string): Promise<boolean> => {
			const success = await setPassword(password);
			if (success && passwordResolve) {
				passwordResolve(password);
				setPasswordResolve(null);
				setIsPasswordModalOpen(false);
			}
			return success;
		},
		[setPassword, passwordResolve],
	);

	const setSecret = useCallback(
		async (
			pluginId: string,
			secretKey: string,
			value: string,
			options?: {
				scope?: 'global' | 'project';
				projectId?: string | null;
				metadata?: Record<string, any>;
			},
		): Promise<void> => {
			if (!user || !value.trim())
				throw new Error('Invalid user or empty secret value');

			const password = await promptForPassword();
			if (!password) throw new Error('Password required to store secrets');

			const scope = options?.scope || 'global';
			const secretId = getSecretId(
				pluginId,
				secretKey,
				scope,
				options?.projectId,
			);

			try {
				const encryptedValue = await encryptWithPassword(value, password);
				const now = Date.now();

				setSecretsCache(
					(prev) =>
						new Map(
							prev.set(secretId, {
								value,
								metadata: options?.metadata,
								lastModified: now,
							}),
						),
				);

				const storageKey = getStorageKey(user.id);
				const existingData = localStorage.getItem(storageKey);
				const secrets: SecretEntry[] = existingData
					? JSON.parse(existingData)
					: [];

				const existingIndex = secrets.findIndex(
					(s) =>
						s.pluginId === pluginId &&
						s.secretKey === secretKey &&
						s.scope === scope &&
						s.projectId === options?.projectId,
				);

				const newEntry: SecretEntry = {
					pluginId,
					secretKey,
					scope,
					projectId: options?.projectId,
					encryptedValue,
					metadata: options?.metadata,
					lastModified: now,
				};

				if (existingIndex >= 0) {
					secrets[existingIndex] = newEntry;
				} else {
					secrets.push(newEntry);
				}

				localStorage.setItem(storageKey, JSON.stringify(secrets));
			} catch (error) {
				console.error('Error storing secret:', error);
				throw new Error('Failed to store secret');
			}
		},
		[
			user,
			userPassword,
			promptForPassword,
			getSecretId,
			encryptWithPassword,
			getStorageKey,
		],
	);

	const getSecret = useCallback(
		async (
			pluginId: string,
			secretKey: string,
			options?: {
				scope?: 'global' | 'project';
				projectId?: string | null;
			},
		): Promise<SecretValue | null> => {
			if (!user) return null;

			const scope = options?.scope || 'global';
			const secretId = getSecretId(
				pluginId,
				secretKey,
				scope,
				options?.projectId,
			);

			const cached = secretsCache.get(secretId);
			if (cached?.value) {
				return cached;
			}

			try {
				const storageKey = getStorageKey(user.id);
				const storedData = localStorage.getItem(storageKey);

				if (!storedData) return null;

				const secrets: SecretEntry[] = JSON.parse(storedData);
				const entry = secrets.find(
					(s) =>
						s.pluginId === pluginId &&
						s.secretKey === secretKey &&
						s.scope === scope &&
						s.projectId === options?.projectId,
				);

				if (!entry) return null;

				const password = await promptForPassword();
				if (!password) return null;

				try {
					const decryptedValue = await decryptWithPassword(
						entry.encryptedValue,
						password,
					);

					const secretValue: SecretValue = {
						value: decryptedValue,
						metadata: entry.metadata,
						lastModified: entry.lastModified,
					};

					setSecretsCache((prev) => new Map(prev.set(secretId, secretValue)));

					return secretValue;
				} catch (decryptError) {
					console.error('Failed to decrypt secret:', decryptError);
					throw new Error('Invalid password or corrupted secret data');
				}
			} catch (error) {
				console.error('Error retrieving secret:', error);
				return null;
			}
		},
		[
			user,
			secretsCache,
			getSecretId,
			promptForPassword,
			getStorageKey,
			decryptWithPassword,
		],
	);

	const removeSecret = useCallback(
		async (
			pluginId: string,
			secretKey: string,
			options?: {
				scope?: 'global' | 'project';
				projectId?: string | null;
			},
		): Promise<void> => {
			if (!user) return;

			const scope = options?.scope || 'global';
			const secretId = getSecretId(
				pluginId,
				secretKey,
				scope,
				options?.projectId,
			);

			setSecretsCache((prev) => {
				const newCache = new Map(prev);
				newCache.delete(secretId);
				return newCache;
			});

			try {
				const storageKey = getStorageKey(user.id);
				const existingData = localStorage.getItem(storageKey);

				if (existingData) {
					const secrets: SecretEntry[] = JSON.parse(existingData);
					const filteredSecrets = secrets.filter(
						(s) =>
							!(
								s.pluginId === pluginId &&
								s.secretKey === secretKey &&
								s.scope === scope &&
								s.projectId === options?.projectId
							),
					);
					localStorage.setItem(storageKey, JSON.stringify(filteredSecrets));
				}
			} catch (error) {
				console.error('Error removing secret from storage:', error);
			}
		},
		[user, getSecretId, getStorageKey],
	);

	const hasSecret = useCallback(
		(
			pluginId: string,
			secretKey: string,
			options?: {
				scope?: 'global' | 'project';
				projectId?: string | null;
			},
		): boolean => {
			if (!user) return false;

			const scope = options?.scope || 'global';

			try {
				const storageKey = getStorageKey(user.id);
				const storedData = localStorage.getItem(storageKey);

				if (!storedData) return false;

				const secrets: SecretEntry[] = JSON.parse(storedData);
				return secrets.some(
					(s) =>
						s.pluginId === pluginId &&
						s.secretKey === secretKey &&
						s.scope === scope &&
						s.projectId === options?.projectId,
				);
			} catch (error) {
				console.error('Error checking secret existence:', error);
				return false;
			}
		},
		[user, getStorageKey],
	);

	const getSecretMetadata = useCallback(
		(
			pluginId: string,
			secretKey: string,
			options?: {
				scope?: 'global' | 'project';
				projectId?: string | null;
			},
		): Record<string, any> | null => {
			if (!user) return null;

			const scope = options?.scope || 'global';

			try {
				const storageKey = getStorageKey(user.id);
				const storedData = localStorage.getItem(storageKey);

				if (!storedData) return null;

				const secrets: SecretEntry[] = JSON.parse(storedData);
				const entry = secrets.find(
					(s) =>
						s.pluginId === pluginId &&
						s.secretKey === secretKey &&
						s.scope === scope &&
						s.projectId === options?.projectId,
				);

				return entry?.metadata || null;
			} catch (error) {
				console.error('Error getting secret metadata:', error);
				return null;
			}
		},
		[user, getStorageKey],
	);

	const clearAllSecrets = useCallback(
		async (pluginId?: string): Promise<void> => {
			if (!user) return;

			try {
				const storageKey = getStorageKey(user.id);

				if (pluginId) {
					const existingData = localStorage.getItem(storageKey);
					if (existingData) {
						const secrets: SecretEntry[] = JSON.parse(existingData);
						const filteredSecrets = secrets.filter(
							(s) => s.pluginId !== pluginId,
						);
						localStorage.setItem(storageKey, JSON.stringify(filteredSecrets));
					}

					setSecretsCache((prev) => {
						const newCache = new Map(prev);
						for (const [key] of newCache) {
							if (key.startsWith(`${pluginId}:`)) {
								newCache.delete(key);
							}
						}
						return newCache;
					});
				} else {
					localStorage.removeItem(storageKey);
					setSecretsCache(new Map());
				}
			} catch (error) {
				console.error('Error clearing secrets:', error);
			}
		},
		[user, getStorageKey],
	);

	useEffect(() => {
		if (!user) {
			clearPassword();
		}
	}, [user, clearPassword]);

	return (
		<SecretsContext.Provider
			value={{
				isPasswordSet,
				setPassword,
				clearPassword,
				setSecret,
				getSecret,
				removeSecret,
				hasSecret,
				promptForPassword,
				getSecretMetadata,
				clearAllSecrets,
				isPasswordModalOpen,
				passwordModalMessage,
				showPasswordModal,
				hidePasswordModal,
				submitPassword,
			}}
		>
			{children}
		</SecretsContext.Provider>
	);
};
