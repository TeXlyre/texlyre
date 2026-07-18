// src/contexts/FileSyncContext.tsx
import { nanoid } from 'nanoid';
import type React from 'react';
import {
	type ReactNode,
	createContext,
	useCallback,
	useEffect,
	useRef,
	useState,
} from 'react';
import type * as Y from 'yjs';

import { t } from '@/i18n';
import { useAuth } from '../hooks/useAuth';
import { useFileTree } from '../hooks/useFileTree';
import { useSettings } from '../hooks/useSettings';
import { collabService } from '../services/CollabService';
import { fileStorageEventEmitter } from '../services/FileStorageService';
import { fileSyncService } from '../services/FileSyncService';
import type {
	FileSyncContextType,
	FileSyncHoldSignal,
	FileSyncInfo,
	FileSyncNotification,
	FileSyncRequest,
	FileSyncVerification,
} from '../types/fileSync';
import type { YjsDocUrl } from '../types/yjs';

const LOCAL_FILE_MAP_ORIGIN = 'file-sync-local-update';

export const FileSyncContext = createContext<FileSyncContextType>({
	isEnabled: false,
	isSyncing: false,
	lastSync: null,
	notifications: [],
	enableSync: () => {},
	disableSync: () => {},
	requestSync: async () => {},
	clearNotification: () => {},
	clearAllNotifications: () => {},
	cleanupStaleFileReferences: async () => {},
});

interface FileSyncProviderProps {
	children: ReactNode;
	docUrl: YjsDocUrl;
}

export const FileSyncProvider: React.FC<FileSyncProviderProps> = ({
	children,
	docUrl,
}) => {
	const { user } = useAuth();
	const { getSetting } = useSettings();
	const { refreshFileTree } = useFileTree();

	const [isSyncing, setIsSyncing] = useState(false);
	const [lastSyncTimestamp, setLastSyncTimestamp] = useState<number | null>(
		null,
	);
	const [notifications, setNotifications] = useState<FileSyncNotification[]>(
		[],
	);

	const ydocRef = useRef<Y.Doc | null>(null);
	const initializedProjectIdRef = useRef<string | null>(null);
	const syncIntervalRef = useRef<NodeJS.Timeout | null>(null);
	const syncThrottleRef = useRef<NodeJS.Timeout | null>(null);
	const activeHoldsRef = useRef<Set<string>>(new Set());
	const processedRequestsRef = useRef<Set<string>>(new Set());
	const awarenessCleanupRef = useRef<(() => void) | null>(null);
	const enableSyncTimeoutRef = useRef<NodeJS.Timeout | null>(null);

	const isFileSyncEnabled =
		(getSetting('file-sync-enable')?.value as boolean) ?? false;
	const autoSyncIntervalSeconds =
		(getSetting('file-sync-auto-interval')?.value as number) ?? 10;
	const holdTimeoutSeconds =
		(getSetting('file-sync-hold-timeout')?.value as number) ?? 30;
	const requestTimeoutSeconds =
		(getSetting('file-sync-request-timeout')?.value as number) ?? 60;
	const conflictResolutionStrategy =
		(getSetting('file-sync-conflict-resolution')?.value as string) ??
		'prefer-latest';
	const fileSyncServerUrl =
		(getSetting('file-sync-server-url')?.value as string) ??
		'http://filepizza.localhost:8082';
	const syncNotificationsEnabled =
		(getSetting('file-sync-notifications')?.value as boolean) ?? true;

	const projectId = docUrl
		? docUrl.startsWith('yjs:')
			? docUrl.slice(4)
			: docUrl
		: '';

	const addNotification = useCallback(
		(notification: Omit<FileSyncNotification, 'id' | 'timestamp'>) => {
			if (!syncNotificationsEnabled) return;

			const fullNotification: FileSyncNotification = {
				id: nanoid(),
				timestamp: Date.now(),
				...notification,
			};

			console.log('[FileSyncContext] Adding notification:', fullNotification);
			setNotifications((prev) => [...prev, fullNotification]);
		},
		[syncNotificationsEnabled],
	);

	const getRequestsArray = useCallback(
		() => ydocRef.current?.getArray<FileSyncRequest>('syncRequests'),
		[],
	);

	const updateRequest = useCallback(
		(requestId: string, patch: Partial<FileSyncRequest>) => {
			const requestsArray = getRequestsArray();
			if (!requestsArray) return;

			const index = requestsArray
				.toArray()
				.findIndex((r) => r.id === requestId);
			if (index < 0) return;

			const currentRequest = requestsArray.get(index);

			requestsArray.delete(index, 1);
			requestsArray.insert(index, [{ ...currentRequest, ...patch }]);
		},
		[getRequestsArray],
	);

	const deleteRequest = useCallback(
		(requestId: string) => {
			const requestsArray = getRequestsArray();
			if (!requestsArray) return;

			const index = requestsArray
				.toArray()
				.findIndex((r) => r.id === requestId);
			if (index >= 0) requestsArray.delete(index, 1);

			processedRequestsRef.current.delete(requestId);
			processedRequestsRef.current.delete(`download_${requestId}`);
		},
		[getRequestsArray],
	);

	const cleanupStaleRequests = useCallback(() => {
		const requestsArray = getRequestsArray();
		if (!requestsArray) return;

		const now = Date.now();
		const timeoutMs = requestTimeoutSeconds * 1000;

		for (let i = requestsArray.length - 1; i >= 0; i--) {
			const request = requestsArray.get(i);
			if (
				request.status === 'completed' ||
				request.status === 'failed' ||
				now - request.timestamp > timeoutMs
			) {
				if (request.providerId === user?.id) {
					fileSyncService.releaseUploader(request.id);
				}
				processedRequestsRef.current.delete(request.id);
				processedRequestsRef.current.delete(`download_${request.id}`);
				requestsArray.delete(i, 1);
			}
		}
	}, [getRequestsArray, requestTimeoutSeconds, user]);

	const isRequestExpired = useCallback(
		(request: FileSyncRequest) =>
			Date.now() - request.timestamp > requestTimeoutSeconds * 1000,
		[requestTimeoutSeconds],
	);

	const updateLocalFileMap = useCallback(async (): Promise<
		FileSyncInfo[] | null
	> => {
		if (!user || !ydocRef.current || !isFileSyncEnabled || !docUrl) return null;

		const activeProjectId = projectId;

		try {
			const localFiles = await fileSyncService.getLocalFileSyncInfo(
				user.id,
				user.username,
				docUrl,
			);

			if (
				initializedProjectIdRef.current !== activeProjectId ||
				!ydocRef.current
			) {
				return null;
			}

			ydocRef.current.transact(() => {
				ydocRef.current!.getMap('fileSync').set(user.id, localFiles);
			}, LOCAL_FILE_MAP_ORIGIN);

			console.log(
				'[FileSyncContext] Updated local file map with',
				localFiles.length,
				'files',
			);

			return localFiles;
		} catch (error) {
			console.error('[FileSyncContext] Error updating local file map:', error);
			addNotification({
				type: 'sync_error',
				message: `Failed to update file map: ${
					error instanceof Error ? error.message : 'unknown error'
				}`,
			});
			return null;
		}
	}, [user, isFileSyncEnabled, addNotification, docUrl, projectId]);

	const createHoldSignal = useCallback(
		(targetPeerId: string): FileSyncHoldSignal => ({
			id: nanoid(),
			holderId: user?.id,
			holderUsername: user?.username,
			targetPeerId,
			timestamp: Date.now(),
			expiresAt: Date.now() + holdTimeoutSeconds * 1000,
			status: 'active',
		}),
		[user, holdTimeoutSeconds],
	);

	const issueHoldSignal = useCallback(
		(targetPeerId: string) => {
			if (!ydocRef.current || activeHoldsRef.current.has(targetPeerId))
				return null;

			const holdSignal = createHoldSignal(targetPeerId);
			ydocRef.current
				.getArray<FileSyncHoldSignal>('holdSignals')
				.push([holdSignal]);
			activeHoldsRef.current.add(targetPeerId);

			addNotification({
				type: 'hold_signal',
				message: `Issued hold signal for peer ${targetPeerId}`,
				data: { holdSignalId: holdSignal.id, targetPeerId },
			});

			setTimeout(() => {
				activeHoldsRef.current.delete(targetPeerId);
			}, holdTimeoutSeconds * 1000);

			return holdSignal;
		},
		[createHoldSignal, addNotification, holdTimeoutSeconds],
	);

	const releaseHoldSignal = useCallback(
		(holdSignalId: string) => {
			if (!ydocRef.current) return;

			const holdSignalsArray =
				ydocRef.current.getArray<FileSyncHoldSignal>('holdSignals');

			for (let i = 0; i < holdSignalsArray.length; i++) {
				const signal = holdSignalsArray.get(i);
				if (signal.id !== holdSignalId || signal.holderId !== user?.id)
					continue;

				holdSignalsArray.delete(i, 1);
				holdSignalsArray.insert(i, [{ ...signal, status: 'released' }]);
				activeHoldsRef.current.delete(signal.targetPeerId);
				break;
			}
		},
		[user],
	);

	const monitorConnectedPeers = useCallback(() => {
		if (!ydocRef.current || !isFileSyncEnabled) return;

		const awareness = collabService.getAwareness(projectId, 'file_sync');
		if (!awareness) return;

		const connectedPeers = new Set(Array.from(awareness.getStates().keys()));
		const fileSyncMap = ydocRef.current.getMap('fileSync');

		const disconnectedPeers: string[] = [];
		fileSyncMap.forEach((_, peerId) => {
			if (peerId !== user?.id && !connectedPeers.has(Number.parseInt(peerId))) {
				disconnectedPeers.push(peerId);
			}
		});

		if (!disconnectedPeers.length) return;

		const disconnected = new Set(disconnectedPeers);
		for (const peerId of disconnectedPeers) {
			console.log(`[FileSyncContext] Removing disconnected peer: ${peerId}`);
			fileSyncMap.delete(peerId);
		}

		const requestsArray = getRequestsArray();
		if (requestsArray) {
			for (let i = requestsArray.length - 1; i >= 0; i--) {
				const request = requestsArray.get(i);
				if (
					disconnected.has(request.providerId) ||
					disconnected.has(request.requesterId)
				) {
					if (request.providerId === user?.id) {
						fileSyncService.releaseUploader(request.id);
					}
					processedRequestsRef.current.delete(request.id);
					processedRequestsRef.current.delete(`download_${request.id}`);
					requestsArray.delete(i, 1);
				}
			}
		}

		const holdSignalsArray =
			ydocRef.current.getArray<FileSyncHoldSignal>('holdSignals');
		for (let i = holdSignalsArray.length - 1; i >= 0; i--) {
			const signal = holdSignalsArray.get(i);
			if (
				disconnected.has(signal.targetPeerId) ||
				(signal.holderId && disconnected.has(signal.holderId))
			) {
				holdSignalsArray.delete(i, 1);
				activeHoldsRef.current.delete(signal.targetPeerId);
			}
		}
	}, [user, isFileSyncEnabled, projectId, getRequestsArray]);

	const checkAndRequestFiles = useCallback(
		async (localFilesArg?: FileSyncInfo[]) => {
			if (!user || !ydocRef.current || !isFileSyncEnabled) return;

			const activeProjectId = projectId;

			try {
				const fileSyncMap = ydocRef.current.getMap('fileSync');
				const localFiles =
					localFilesArg ??
					(await fileSyncService.getLocalFileSyncInfo(
						user.id,
						user.username,
						docUrl,
					));

				if (
					initializedProjectIdRef.current !== activeProjectId ||
					!ydocRef.current
				) {
					return;
				}

				fileSyncMap.forEach((remoteFiles, peerId) => {
					if (
						peerId === user.id ||
						fileSyncService.isSyncDisabledForPeer(peerId)
					)
						return;

					if (
						!fileSyncService.shouldTriggerSync(
							localFiles,
							remoteFiles as FileSyncInfo[],
						)
					) {
						return;
					}

					const filesToRequest = fileSyncService.determineFilesToRequest(
						localFiles,
						remoteFiles as FileSyncInfo[],
						conflictResolutionStrategy as any,
					);

					console.log(
						`[FileSyncContext] Files to request for peer ${peerId}:`,
						filesToRequest.length,
					);

					if (!filesToRequest.length) return;

					const holdSignal = issueHoldSignal(peerId);
					if (!holdSignal) return;

					setTimeout(() => {
						if (initializedProjectIdRef.current !== activeProjectId) return;

						const requestsArray = getRequestsArray();
						if (!requestsArray) return;

						const syncRequest: FileSyncRequest = {
							id: nanoid(),
							requesterId: user.id,
							requesterUsername: user.username,
							providerId: peerId,
							files: filesToRequest.map((f) => f.remoteFileId),
							filePaths: filesToRequest.map((f) => f.filePath),
							remoteTimestamps: filesToRequest.map((f) => f.lastModified),
							documentIds: filesToRequest.map((f) => f.documentId),
							deletionStates: filesToRequest.map((f) => f.isDeleted),
							timestamp: Date.now(),
							status: 'pending',
							holdSignalId: holdSignal.id,
						};

						requestsArray.push([syncRequest]);

						addNotification({
							type: 'sync_request',
							message: `Requesting ${filesToRequest.length} file(s) from peer`,
							data: {
								requestId: syncRequest.id,
								fileCount: filesToRequest.length,
							},
						});
					}, 1000);
				});
			} catch (error) {
				console.error(
					'[FileSyncContext] Error checking and requesting files:',
					error,
				);
				addNotification({
					type: 'sync_error',
					message: `Error during file check: ${
						error instanceof Error ? error.message : 'unknown error'
					}`,
				});
			}
		},
		[
			user,
			isFileSyncEnabled,
			projectId,
			docUrl,
			conflictResolutionStrategy,
			issueHoldSignal,
			addNotification,
			getRequestsArray,
		],
	);

	const handleIncomingSyncRequest = useCallback(
		async (request: FileSyncRequest) => {
			if (!user || !ydocRef.current || request.providerId !== user.id) return;
			if (isRequestExpired(request)) return deleteRequest(request.id);
			if (processedRequestsRef.current.has(request.id)) return;

			processedRequestsRef.current.add(request.id);
			const operationId = `filesync-upload-${request.id}`;

			try {
				setIsSyncing(true);
				fileSyncService.showLoadingNotification(
					`Preparing ${request.files.length} file(s) for download...`,
					operationId,
				);

				const uploadResult = await fileSyncService.uploadFiles(
					request.files,
					request.id,
					fileSyncServerUrl,
					docUrl,
				);

				updateRequest(request.id, {
					providerUsername: user.username,
					status: 'ready',
					filePizzaLink: uploadResult.link,
					timestamp: Date.now(),
				});

				fileSyncService.showSuccessNotification(
					`Prepared ${request.files.length} file(s) for download`,
					{ operationId },
				);

				addNotification({
					type: 'sync_progress',
					message: `Prepared ${request.files.length} file(s) for download`,
					data: { requestId: request.id, fileCount: request.files.length },
				});
			} catch (error) {
				console.error(
					'[FileSyncContext] Error handling incoming sync request:',
					error,
				);

				fileSyncService.showErrorNotification(
					`Failed to prepare files: ${
						error instanceof Error ? error.message : 'unknown error'
					}`,
					{ operationId },
				);

				updateRequest(request.id, {
					status: 'failed',
					timestamp: Date.now(),
				});
				processedRequestsRef.current.delete(request.id);
			} finally {
				setIsSyncing(false);
			}
		},
		[
			user,
			fileSyncServerUrl,
			addNotification,
			updateRequest,
			deleteRequest,
			isRequestExpired,
			docUrl,
		],
	);

	const handleSyncRequestUpdate = useCallback(
		async (request: FileSyncRequest) => {
			if (
				!user ||
				!ydocRef.current ||
				request.requesterId !== user.id ||
				request.status !== 'ready' ||
				!request.filePizzaLink
			) {
				return;
			}

			if (isRequestExpired(request)) return deleteRequest(request.id);

			const processedKey = `download_${request.id}`;
			if (processedRequestsRef.current.has(processedKey)) return;

			processedRequestsRef.current.add(processedKey);
			const operationId = `filesync-download-${request.id}`;

			try {
				setIsSyncing(true);
				fileSyncService.showLoadingNotification(
					`Downloading ${request.files.length} file(s)...`,
					operationId,
				);

				const remoteTimestamps = new Map<string, number>();
				const remoteDocumentIds = new Map<string, string>();
				const remoteDeletionStates = new Map<string, boolean>();

				request.filePaths?.forEach((path, index) => {
					const timestamp = request.remoteTimestamps?.[index];
					const documentId = request.documentIds?.[index];
					const deletionState = request.deletionStates?.[index];

					if (timestamp) remoteTimestamps.set(path, timestamp);
					if (documentId) remoteDocumentIds.set(path, documentId as string);
					if (deletionState !== undefined)
						remoteDeletionStates.set(path, deletionState);
				});

				await fileSyncService.downloadFiles(
					request.filePizzaLink,
					request.filePaths || request.files,
					remoteTimestamps,
					remoteDocumentIds,
					remoteDeletionStates,
					fileSyncServerUrl,
					docUrl,
				);

				deleteRequest(request.id);

				ydocRef.current.getArray<FileSyncVerification>('verifications').push([
					{
						id: nanoid(),
						requestId: request.id,
						verifierId: user.id,
						verifierUsername: user.username,
						providerId: request.providerId,
						timestamp: Date.now(),
						status: 'success',
					},
				]);

				releaseHoldSignal(request.holdSignalId);
				fileSyncService.clearSyncFailures(request.providerId);
				setLastSyncTimestamp(Date.now());

				fileSyncService.showSuccessNotification(
					`Downloaded ${request.files.length} file(s) successfully`,
					{ operationId },
				);

				addNotification({
					type: 'sync_complete',
					message: `Downloaded ${request.files.length} file(s) successfully`,
					data: { requestId: request.id, fileCount: request.files.length },
				});

				await refreshFileTree();
				await updateLocalFileMap();
			} catch (error) {
				console.error('[FileSyncContext] Error downloading files:', error);

				const message =
					error instanceof Error ? error.message : 'unknown error';
				const isDisabled = fileSyncService.trackSyncFailure(request.providerId);

				updateRequest(request.id, {
					status: 'failed',
					timestamp: Date.now(),
				});

				fileSyncService.showErrorNotification(
					`Failed to download files: ${message}`,
					{
						operationId,
					},
				);

				if (isDisabled) {
					addNotification({
						type: 'sync_error',
						message:
							'Sync with peer disabled due to repeated failures. Refresh to re-enable.',
						data: { requestId: request.id, disabled: true },
					});
				}

				ydocRef.current.getArray<FileSyncVerification>('verifications').push([
					{
						id: nanoid(),
						requestId: request.id,
						verifierId: user.id,
						verifierUsername: user.username,
						providerId: request.providerId,
						timestamp: Date.now(),
						status: 'failure',
						message,
					},
				]);

				releaseHoldSignal(request.holdSignalId);
				processedRequestsRef.current.delete(processedKey);

				addNotification({
					type: 'sync_error',
					message: `Failed to download files: ${message}`,
					data: { requestId: request.id },
				});
			} finally {
				setIsSyncing(false);
			}
		},
		[
			user,
			addNotification,
			refreshFileTree,
			updateLocalFileMap,
			fileSyncServerUrl,
			releaseHoldSignal,
			updateRequest,
			deleteRequest,
			isRequestExpired,
			docUrl,
		],
	);

	const handleVerification = useCallback(
		(verification: FileSyncVerification) => {
			if (!user || verification.providerId !== user.id) return;

			fileSyncService.releaseUploader(verification.requestId);
			processedRequestsRef.current.delete(verification.requestId);

			addNotification({
				type: 'verification',
				message:
					verification.status === 'success'
						? `Sync completed successfully with ${verification.verifierUsername}`
						: `Sync failed with ${verification.verifierUsername}: ${
								verification.message || 'unknown error'
							}`,
				data: { verificationId: verification.id, status: verification.status },
			});

			if (verification.status === 'success') {
				setTimeout(updateLocalFileMap, 1000);
			}
		},
		[user, addNotification, updateLocalFileMap],
	);

	const cleanupExpiredHolds = useCallback(() => {
		if (!ydocRef.current) return;

		const holdSignalsArray =
			ydocRef.current.getArray<FileSyncHoldSignal>('holdSignals');
		const now = Date.now();

		for (let i = holdSignalsArray.length - 1; i >= 0; i--) {
			const signal = holdSignalsArray.get(i);
			if (signal.expiresAt >= now || signal.status !== 'active') continue;

			holdSignalsArray.delete(i, 1);
			holdSignalsArray.insert(i, [{ ...signal, status: 'expired' }]);

			if (signal.holderId === user?.id) {
				activeHoldsRef.current.delete(signal.targetPeerId);
			}
		}
	}, [user]);

	const cleanupCompletedRequests = useCallback(() => {
		if (!ydocRef.current) return;

		cleanupStaleRequests();

		const verificationsArray =
			ydocRef.current.getArray<FileSyncVerification>('verifications');
		const threshold = 5 * 60 * 1000;
		const now = Date.now();

		for (let i = verificationsArray.length - 1; i >= 0; i--) {
			if (now - verificationsArray.get(i).timestamp > threshold) {
				verificationsArray.delete(i, 1);
			}
		}
	}, [cleanupStaleRequests]);

	const performSync = useCallback(async () => {
		if (
			!isFileSyncEnabled ||
			!user ||
			initializedProjectIdRef.current !== projectId ||
			!docUrl
		) {
			return;
		}

		console.log('[FileSyncContext] Performing sync cycle...');
		cleanupExpiredHolds();
		cleanupCompletedRequests();
		const localFiles = await updateLocalFileMap();
		await checkAndRequestFiles(localFiles ?? undefined);
	}, [
		isFileSyncEnabled,
		user,
		docUrl,
		projectId,
		cleanupExpiredHolds,
		cleanupCompletedRequests,
		updateLocalFileMap,
		checkAndRequestFiles,
	]);

	const throttledPerformSync = useCallback(() => {
		if (syncThrottleRef.current) clearTimeout(syncThrottleRef.current);

		syncThrottleRef.current = setTimeout(() => {
			console.log('[FileSyncContext] File storage changed, triggering sync.');
			performSync();
			syncThrottleRef.current = null;
		}, 1000);
	}, [performSync]);

	const enableSync = useCallback(() => {
		console.log('[FileSyncContext] Enabling file sync');
		fileSyncService.showSuccessNotification(t('File sync enabled'), {
			duration: 2000,
		});
		if (enableSyncTimeoutRef.current)
			clearTimeout(enableSyncTimeoutRef.current);
		enableSyncTimeoutRef.current = setTimeout(performSync, 1000);
	}, [performSync]);

	const disableSync = useCallback(() => {
		console.log('[FileSyncContext] Disabling file sync');
		fileSyncService.cleanup();
		activeHoldsRef.current.clear();
		processedRequestsRef.current.clear();

		if (enableSyncTimeoutRef.current)
			clearTimeout(enableSyncTimeoutRef.current);
		if (syncThrottleRef.current) clearTimeout(syncThrottleRef.current);
		if (syncIntervalRef.current) clearInterval(syncIntervalRef.current);

		enableSyncTimeoutRef.current = null;
		syncThrottleRef.current = null;
		syncIntervalRef.current = null;

		Object.keys(localStorage).forEach((key) => {
			if (
				key.startsWith('sync-failures-') ||
				key.startsWith('sync-disabled-')
			) {
				localStorage.removeItem(key);
			}
		});

		fileSyncService.showInfoNotification(t('File sync disabled'), {
			duration: 2000,
		});
	}, []);

	useEffect(() => {
		if (!user || !projectId) return;
		if (initializedProjectIdRef.current === projectId) return;

		const signalingServersSetting = getSetting('collab-signaling-servers');
		const awarenessTimeoutSetting = getSetting('collab-awareness-timeout');
		const autoReconnectSetting = getSetting('collab-auto-reconnect');

		if (
			!signalingServersSetting ||
			!awarenessTimeoutSetting ||
			!autoReconnectSetting
		) {
			return;
		}

		try {
			const { doc } = collabService.connect(projectId, 'file_sync', {
				signalingServers: (signalingServersSetting.value as string)
					.split(',')
					.map((s) => s.trim()),
				autoReconnect: autoReconnectSetting.value as boolean,
				awarenessTimeout: (awarenessTimeoutSetting.value as number) * 1000,
			});

			ydocRef.current = doc;
			initializedProjectIdRef.current = projectId;

			const fileSyncMap = doc.getMap('fileSync');
			const requestsArray = doc.getArray<FileSyncRequest>('syncRequests');
			const verificationsArray =
				doc.getArray<FileSyncVerification>('verifications');

			cleanupStaleRequests();

			fileSyncMap.observe((_event, transaction) => {
				if (transaction.origin === LOCAL_FILE_MAP_ORIGIN) return;
				if (isFileSyncEnabled) setTimeout(checkAndRequestFiles, 1000);
			});

			requestsArray.observe(() => {
				if (!isFileSyncEnabled) return;

				requestsArray.toArray().forEach((request) => {
					if (request.providerId === user.id && request.status === 'pending') {
						handleIncomingSyncRequest(request);
					} else if (
						request.requesterId === user.id &&
						request.status === 'ready'
					) {
						handleSyncRequestUpdate(request);
					}
				});
			});

			verificationsArray.observe(() => {
				if (!isFileSyncEnabled) return;

				verificationsArray.toArray().forEach(handleVerification);
			});

			const awareness = collabService.getAwareness(projectId, 'file_sync');
			const handleAwarenessChange = () => {
				if (isFileSyncEnabled) monitorConnectedPeers();
			};
			awareness?.on('change', handleAwarenessChange);

			awarenessCleanupRef.current = () =>
				awareness?.off('change', handleAwarenessChange);
		} catch (error) {
			console.error(
				'[FileSyncContext] Error initializing YJS doc for file sync:',
				error,
			);
			fileSyncService.showErrorNotification(
				t('Failed to initialize file sync'),
				{
					duration: 5000,
				},
			);
		}

		return () => {
			awarenessCleanupRef.current?.();
			awarenessCleanupRef.current = null;
			if (projectId) collabService.disconnect(projectId, 'file_sync');

			if (initializedProjectIdRef.current === projectId) {
				initializedProjectIdRef.current = null;
			}

			ydocRef.current = null;
			activeHoldsRef.current.clear();
			processedRequestsRef.current.clear();

			if (syncThrottleRef.current) clearTimeout(syncThrottleRef.current);
			if (syncIntervalRef.current) clearInterval(syncIntervalRef.current);

			syncThrottleRef.current = null;
			syncIntervalRef.current = null;
		};
	}, [
		user,
		projectId,
		isFileSyncEnabled,
		checkAndRequestFiles,
		handleIncomingSyncRequest,
		handleSyncRequestUpdate,
		handleVerification,
		getSetting,
		cleanupStaleRequests,
		monitorConnectedPeers,
	]);

	useEffect(() => {
		if (!isFileSyncEnabled || initializedProjectIdRef.current !== projectId) {
			if (syncIntervalRef.current) clearInterval(syncIntervalRef.current);
			syncIntervalRef.current = null;
			return;
		}

		const performSyncWithPeerMonitoring = async () => {
			monitorConnectedPeers();
			await performSync();
		};

		const intervalId = setInterval(
			performSyncWithPeerMonitoring,
			autoSyncIntervalSeconds * 1000,
		);
		const initialSyncTimeout = setTimeout(performSyncWithPeerMonitoring, 1000);

		syncIntervalRef.current = intervalId;

		return () => {
			clearInterval(intervalId);
			clearTimeout(initialSyncTimeout);
		};
	}, [
		isFileSyncEnabled,
		projectId,
		performSync,
		monitorConnectedPeers,
		autoSyncIntervalSeconds,
	]);

	const cleanupStaleFileReferences = useCallback(async () => {}, []);

	const requestSync = useCallback(async () => {
		if (!user || !isFileSyncEnabled) return;

		const operationId = `filesync-manual-${Date.now()}`;
		setIsSyncing(true);

		try {
			fileSyncService.showLoadingNotification(
				t('Manual sync initiated...'),
				operationId,
			);
			await performSync();
			fileSyncService.showSuccessNotification(t('Manual sync completed'), {
				operationId,
			});
		} catch (error) {
			fileSyncService.showErrorNotification(
				t('Manual sync failed: ') +
					`${error instanceof Error ? error.message : t('unknown error')}`,
				{ operationId },
			);
		} finally {
			setIsSyncing(false);
		}
	}, [user, isFileSyncEnabled, performSync]);

	const clearNotification = useCallback((id: string) => {
		setNotifications((prev) => prev.filter((n) => n.id !== id));
	}, []);

	const clearAllNotifications = useCallback(() => setNotifications([]), []);

	useEffect(
		() => fileSyncService.addListener(addNotification),
		[addNotification],
	);

	useEffect(() => {
		const unsubscribe = fileStorageEventEmitter.onChange(() => {
			if (isFileSyncEnabled) throttledPerformSync();
		});

		return unsubscribe;
	}, [throttledPerformSync, isFileSyncEnabled]);

	useEffect(() => {
		if (isFileSyncEnabled) enableSync();
		else disableSync();
	}, [isFileSyncEnabled, enableSync, disableSync]);

	return (
		<FileSyncContext.Provider
			value={{
				isEnabled: isFileSyncEnabled,
				isSyncing,
				lastSync: lastSyncTimestamp,
				notifications,
				enableSync,
				disableSync,
				requestSync,
				clearNotification,
				clearAllNotifications,
				cleanupStaleFileReferences,
			}}
		>
			{children}
		</FileSyncContext.Provider>
	);
};
