// src/contexts/RecordsContext.tsx
import type React from 'react';
import {
	type ReactNode,
	createContext,
	useCallback,
	useEffect,
	useRef,
} from 'react';

import {
	notifyUserDataChanged,
	type UserDataMutation,
} from '../utils/userDataUtils';
import { createNamedLogger } from '@/logging';

const moduleLog = createNamedLogger('RecordsContext');

export interface RecordEntry<T = unknown> {
	id: string;
	timestamp: number;
	data: T;
}

export interface RecordsContextType {
	appendRecord: <T>(
		key: string,
		data: T,
		options?: {
			scope?: 'global' | 'project';
			projectId?: string;
			maxEntries?: number;
		},
	) => RecordEntry<T> | null;
	listRecords: <T>(
		key: string,
		options?: {
			scope?: 'global' | 'project';
			projectId?: string;
			limit?: number;
		},
	) => RecordEntry<T>[];
	removeRecord: (
		key: string,
		recordId: string,
		options?: { scope?: 'global' | 'project'; projectId?: string },
	) => void;
	clearRecords: (
		key: string,
		options?: { scope?: 'global' | 'project'; projectId?: string },
	) => void;
	clearAllRecords: (keyPrefix?: string) => void;
}

export const RecordsContext = createContext<RecordsContextType>({
	appendRecord: () => null,
	listRecords: () => [],
	removeRecord: () => {},
	clearRecords: () => {},
	clearAllRecords: () => {},
});

interface RecordsProviderProps {
	children: ReactNode;
}

export const RecordsProvider: React.FC<RecordsProviderProps> = ({
	children,
}) => {
	const recordsRef = useRef<Record<string, RecordEntry[]>>({});
	const isLoaded = useRef(false);

	const getCurrentUserId = useCallback((): string | null => {
		return localStorage.getItem('texlyre-current-user');
	}, []);

	const getStorageKey = useCallback((): string => {
		const userId = getCurrentUserId();
		return userId ? `texlyre-user-${userId}-records` : 'texlyre-records';
	}, [getCurrentUserId]);

	const getRecordKey = useCallback(
		(
			key: string,
			scope: 'global' | 'project' = 'global',
			projectId?: string,
		): string => {
			if (scope === 'project' && projectId) {
				return `${key}:project:${projectId}`;
			}
			return `${key}:global`;
		},
		[],
	);

	const persist = useCallback(
		(mutations: UserDataMutation[]) => {
			try {
				localStorage.setItem(
					getStorageKey(),
					JSON.stringify(recordsRef.current),
				);
				const userId = getCurrentUserId();
				if (userId) {
					for (const mutation of mutations) {
						notifyUserDataChanged(userId, 'records', mutation);
					}
				}
			} catch (error) {
				moduleLog.error('Error saving records to localStorage:', error);
			}
		},
		[getStorageKey, getCurrentUserId],
	);

	const reload = useCallback(() => {
		try {
			const stored = localStorage.getItem(getStorageKey());
			recordsRef.current = stored ? JSON.parse(stored) : {};
		} catch (error) {
			moduleLog.error('Error parsing records from localStorage:', error);
			recordsRef.current = {};
		} finally {
			isLoaded.current = true;
		}
	}, [getStorageKey]);

	useEffect(() => {
		reload();
	}, [reload]);

	useEffect(() => {
		const handleStoreChanged = (event: Event) => {
			const detail = (event as CustomEvent).detail;
			if (detail && detail.store !== 'records') return;
			reload();
		};

		window.addEventListener('chelys-account-store-changed', handleStoreChanged);
		return () =>
			window.removeEventListener(
				'chelys-account-store-changed',
				handleStoreChanged,
			);
	}, [reload]);

	const appendRecord = useCallback(
		<T,>(
			key: string,
			data: T,
			options?: {
				scope?: 'global' | 'project';
				projectId?: string;
				maxEntries?: number;
			},
		): RecordEntry<T> | null => {
			reload();
			const recordKey = getRecordKey(key, options?.scope, options?.projectId);
			const entry: RecordEntry<T> = {
				id: Math.random().toString(36).substring(2),
				timestamp: Date.now(),
				data,
			};

			const existing =
				(recordsRef.current[recordKey] as RecordEntry<T>[]) || [];
			const appended = [...existing, entry];
			const limited =
				options?.maxEntries && appended.length > options.maxEntries
					? appended.slice(-options.maxEntries)
					: appended;

			recordsRef.current[recordKey] = limited as RecordEntry[];
			persist([{ key: recordKey, value: limited }]);
			return entry;
		},
		[getRecordKey, persist, reload],
	);

	const listRecords = useCallback(
		<T,>(
			key: string,
			options?: {
				scope?: 'global' | 'project';
				projectId?: string;
				limit?: number;
			},
		): RecordEntry<T>[] => {
			const recordKey = getRecordKey(key, options?.scope, options?.projectId);
			const entries = (recordsRef.current[recordKey] as RecordEntry<T>[]) || [];
			return options?.limit ? entries.slice(-options.limit) : [...entries];
		},
		[getRecordKey],
	);

	const removeRecord = useCallback(
		(
			key: string,
			recordId: string,
			options?: { scope?: 'global' | 'project'; projectId?: string },
		): void => {
			reload();
			const recordKey = getRecordKey(key, options?.scope, options?.projectId);
			const entries = recordsRef.current[recordKey];
			if (!entries) return;

			const next = entries.filter((e) => e.id !== recordId);
			recordsRef.current[recordKey] = next;
			persist([{ key: recordKey, value: next }]);
		},
		[getRecordKey, persist, reload],
	);

	const clearRecords = useCallback(
		(
			key: string,
			options?: { scope?: 'global' | 'project'; projectId?: string },
		): void => {
			reload();
			const recordKey = getRecordKey(key, options?.scope, options?.projectId);
			delete recordsRef.current[recordKey];
			persist([{ key: recordKey, deleted: true }]);
		},
		[getRecordKey, persist, reload],
	);

	const clearAllRecords = useCallback(
		(keyPrefix?: string): void => {
			reload();
			const removedKeys = Object.keys(recordsRef.current).filter((recordKey) =>
				keyPrefix ? recordKey.startsWith(keyPrefix) : true,
			);
			if (removedKeys.length === 0) return;
			for (const recordKey of removedKeys) delete recordsRef.current[recordKey];
			persist(removedKeys.map((key) => ({ key, deleted: true })));
		},
		[persist, reload],
	);

	return (
		<RecordsContext.Provider
			value={{
				appendRecord,
				listRecords,
				removeRecord,
				clearRecords,
				clearAllRecords,
			}}
		>
			{children}
		</RecordsContext.Provider>
	);
};
