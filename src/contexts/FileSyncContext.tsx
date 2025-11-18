// src/contexts/FileSyncContext.tsx
import { t } from '@/i18n';
import { nanoid } from 'nanoid';
import type React from 'react';
import {
  type ReactNode,
  createContext,
  useCallback,
  useEffect,
  useRef,
  useState
} from
  'react';
import type * as Y from 'yjs';

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
  FileSyncVerification
} from
  '../types/fileSync';
import type { YjsDocUrl } from '../types/yjs';

export const FileSyncContext = createContext<FileSyncContextType>({
  isEnabled: false,
  isSyncing: false,
  lastSync: null,
  notifications: [],
  enableSync: () => { },
  disableSync: () => { },
  requestSync: async () => { },
  clearNotification: () => { },
  clearAllNotifications: () => { },
  cleanupStaleFileReferences: async () => { }
});

interface FileSyncProviderProps {
  children: ReactNode;
  docUrl: YjsDocUrl;
}

export const FileSyncProvider: React.FC<FileSyncProviderProps> = ({
  children,
  docUrl
}) => {
  const { user } = useAuth();
  const { registerSetting, getSetting } = useSettings();
  const { refreshFileTree } = useFileTree();

  const [isFileSyncEnabled, setIsFileSyncEnabled] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTimestamp, setLastSyncTimestamp] = useState<number | null>(
    null
  );
  const [notifications, setNotifications] = useState<FileSyncNotification[]>(
    []
  );
  const [autoSyncIntervalSeconds, setAutoSyncIntervalSeconds] = useState(10);
  const [holdTimeoutSeconds, setHoldTimeoutSeconds] = useState(30);
  const [_requestTimeoutSeconds, setRequestTimeoutSeconds] = useState(60);
  const [conflictResolutionStrategy, setConflictResolutionStrategy] =
    useState('prefer-latest');
  const [fileSyncServerUrl, setFileSyncServerUrl] = useState('');
  const [syncNotificationsEnabled, setSyncNotificationsEnabled] =
    useState(true);

  const ydocRef = useRef<Y.Doc | null>(null);
  const isInitializedRef = useRef(false);
  const settingsRegistered = useRef(false);
  const syncIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const activeHoldsRef = useRef<Set<string>>(new Set());
  const processedRequestsRef = useRef<Set<string>>(new Set());
  const syncThrottleRef = useRef<NodeJS.Timeout | null>(null);

  const projectId = docUrl ?
    docUrl.startsWith('yjs:') ?
      docUrl.slice(4) :
      docUrl :
    '';

  const addNotification = useCallback(
    (notification: Omit<FileSyncNotification, 'id' | 'timestamp'>) => {
      if (!syncNotificationsEnabled) return;

      const fullNotification: FileSyncNotification = {
        id: nanoid(),
        timestamp: Date.now(),
        ...notification
      };

      console.log('[FileSyncContext] Adding notification:', fullNotification);
      setNotifications((prev) => [...prev, fullNotification]);
    },
    [syncNotificationsEnabled]
  );

  const updateLocalFileMap = useCallback(async () => {
    if (!user || !ydocRef.current || !isFileSyncEnabled || !docUrl) return;
    try {
      const localFiles = await fileSyncService.getLocalFileSyncInfo(
        user.id,
        user.username
      );
      const fileSyncMap = ydocRef.current.getMap('fileSync');
      fileSyncMap.set(user.id, localFiles);
      console.log(
        '[FileSyncContext] Updated local file map with',
        localFiles.length,
        'files'
      );
    } catch (error) {
      console.error('Error updating local file map:', error);
      addNotification({
        type: 'sync_error',
        message: `Failed to update file map: ${error instanceof Error ? error.message : 'unknown error'}`
      });
    }
  }, [user, isFileSyncEnabled, addNotification, docUrl]);

  const createHoldSignal = useCallback(
    (targetPeerId: string): FileSyncHoldSignal => {
      const holdSignal: FileSyncHoldSignal = {
        id: nanoid(),
        holderId: user?.id,
        holderUsername: user?.username,
        targetPeerId,
        timestamp: Date.now(),
        expiresAt: Date.now() + holdTimeoutSeconds * 1000,
        status: 'active'
      };
      return holdSignal;
    },
    [user, holdTimeoutSeconds]
  );

  const issueHoldSignal = useCallback(
    (targetPeerId: string) => {
      if (!ydocRef.current || activeHoldsRef.current.has(targetPeerId))
        return null;

      const holdSignal = createHoldSignal(targetPeerId);
      const holdSignalsArray =
        ydocRef.current.getArray<FileSyncHoldSignal>('holdSignals');
      holdSignalsArray.push([holdSignal]);
      activeHoldsRef.current.add(targetPeerId);

      addNotification({
        type: 'hold_signal',
        message: `Issued hold signal for peer ${targetPeerId}`,
        data: { holdSignalId: holdSignal.id, targetPeerId }
      });

      setTimeout(() => {
        activeHoldsRef.current.delete(targetPeerId);
      }, holdTimeoutSeconds * 1000);

      return holdSignal;
    },
    [createHoldSignal, addNotification, holdTimeoutSeconds]
  );

  const releaseHoldSignal = useCallback(
    (holdSignalId: string) => {
      if (!ydocRef.current) return;

      const holdSignalsArray =
        ydocRef.current.getArray<FileSyncHoldSignal>('holdSignals');
      for (let i = 0; i < holdSignalsArray.length; i++) {
        const signal = holdSignalsArray.get(i);
        if (signal.id === holdSignalId && signal.holderId === user?.id) {
          const updatedSignal = { ...signal, status: 'released' as const };
          holdSignalsArray.delete(i, 1);
          holdSignalsArray.insert(i, [updatedSignal]);
          activeHoldsRef.current.delete(signal.targetPeerId);
          break;
        }
      }
    },
    [user]
  );

  const monitorConnectedPeers = useCallback(() => {
    if (!ydocRef.current || !isFileSyncEnabled) return;

    const awareness = collabService.getAwareness(projectId, 'file_sync');
    if (!awareness) return;

    const connectedPeers = new Set(Array.from(awareness.getStates().keys()));
    const fileSyncMap = ydocRef.current.getMap('fileSync');

    fileSyncMap.forEach((_, peerId) => {
      if (peerId !== user?.id && !connectedPeers.has(Number.parseInt(peerId))) {
        console.log(`[FileSyncContext] Removing disconnected peer: ${peerId}`);
        fileSyncMap.delete(peerId);
      }
    });
  }, [user, isFileSyncEnabled, projectId]);

  const checkAndRequestFiles = useCallback(async () => {
    if (!user || !ydocRef.current || !isFileSyncEnabled) return;

    try {
      const fileSyncMap = ydocRef.current.getMap('fileSync');
      const localFiles = await fileSyncService.getLocalFileSyncInfo(
        user.id,
        user.username
      );

      fileSyncMap.forEach((remoteFiles, peerId) => {
        if (peerId === user.id || fileSyncService.isSyncDisabledForPeer(peerId))
          return;

        if (
          !fileSyncService.shouldTriggerSync(
            localFiles,
            remoteFiles as FileSyncInfo[]
          )) {
          return;
        }

        const filesToRequest = fileSyncService.determineFilesToRequest(
          localFiles,
          remoteFiles as FileSyncInfo[],
          conflictResolutionStrategy as any
        );

        console.log(
          `[FileSyncContext] Files to request for peer ${peerId}:`,
          filesToRequest.length
        );

        if (filesToRequest.length > 0) {
          const holdSignal = issueHoldSignal(peerId);
          if (holdSignal) {
            setTimeout(() => {
              const requestsArray =
                ydocRef.current?.getArray<FileSyncRequest>('syncRequests');
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
                holdSignalId: holdSignal.id
              };
              requestsArray.push([syncRequest]);

              addNotification({
                type: 'sync_request',
                message: `Requesting ${filesToRequest.length} file(s) from peer`,
                data: {
                  requestId: syncRequest.id,
                  fileCount: filesToRequest.length
                }
              });
            }, 1000);
          }
        }
      });
    } catch (error) {
      console.error('Error checking and requesting files:', error);
      addNotification({
        type: 'sync_error',
        message: `Error during file check: ${error instanceof Error ? error.message : 'unknown error'}`
      });
    }
  }, [
    user,
    isFileSyncEnabled,
    conflictResolutionStrategy,
    issueHoldSignal,
    addNotification]
  );

  const handleIncomingSyncRequest = useCallback(
    async (request: FileSyncRequest) => {
      if (!user || !ydocRef.current || request.providerId !== user.id) return;
      if (processedRequestsRef.current.has(request.id)) return;

      processedRequestsRef.current.add(request.id);
      const operationId = `filesync-upload-${request.id}`;

      try {
        setIsSyncing(true);
        fileSyncService.showLoadingNotification(
          `Preparing ${request.files.length} file(s) for download...`,
          operationId
        );

        const uploadResult = await fileSyncService.uploadFiles(
          request.files,
          request.id,
          fileSyncServerUrl
        );

        const requestsArray =
          ydocRef.current.getArray<FileSyncRequest>('syncRequests');
        const requestIndex = requestsArray.
          toArray().
          findIndex((r) => r.id === request.id);
        if (requestIndex >= 0) {
          const updatedRequest: FileSyncRequest = {
            ...requestsArray.get(requestIndex),
            providerUsername: user.username,
            status: 'ready',
            filePizzaLink: uploadResult.link
          };
          requestsArray.delete(requestIndex, 1);
          requestsArray.insert(requestIndex, [updatedRequest]);
        }

        fileSyncService.showSuccessNotification(
          `Prepared ${request.files.length} file(s) for download`,
          { operationId }
        );

        addNotification({
          type: 'sync_progress',
          message: `Prepared ${request.files.length} file(s) for download`,
          data: { requestId: request.id, fileCount: request.files.length }
        });
      } catch (error) {
        console.error(
          'Error handling incoming sync request:',
          error
        );

        fileSyncService.showErrorNotification(
          `Failed to prepare files: ${error instanceof Error ? error.message : 'unknown error'}`,
          { operationId }
        );

        const requestsArray =
          ydocRef.current.getArray<FileSyncRequest>('syncRequests');
        const requestIndex = requestsArray.
          toArray().
          findIndex((r) => r.id === request.id);
        if (requestIndex >= 0) {
          const failedRequest = {
            ...requestsArray.get(requestIndex),
            status: 'failed' as const
          };
          requestsArray.delete(requestIndex, 1);
          requestsArray.insert(requestIndex, [failedRequest]);
        }
        processedRequestsRef.current.delete(request.id);
      } finally {
        setIsSyncing(false);
      }
    },
    [user, fileSyncServerUrl, addNotification]
  );

  const handleSyncRequestUpdate = useCallback(
    async (request: FileSyncRequest) => {
      if (
        !user ||
        !ydocRef.current ||
        request.requesterId !== user.id ||
        request.status !== 'ready' ||
        !request.filePizzaLink)

        return;
      if (processedRequestsRef.current.has(`download_${request.id}`)) return;

      processedRequestsRef.current.add(`download_${request.id}`);
      const operationId = `filesync-download-${request.id}`;

      try {
        setIsSyncing(true);
        fileSyncService.showLoadingNotification(
          `Downloading ${request.files.length} file(s)...`,
          operationId
        );

        const remoteTimestamps = new Map<string, number>();
        request.filePaths?.forEach((path, index) => {
          if (request.remoteTimestamps?.[index]) {
            remoteTimestamps.set(path, request.remoteTimestamps[index]);
          }
        });

        const remoteDocumentIds = new Map<string, string>();
        request.filePaths?.forEach((path, index) => {
          if (request.documentIds?.[index]) {
            remoteDocumentIds.set(path, request.documentIds[index] as string);
          }
        });

        const remoteDeletionStates = new Map<string, boolean>();
        request.filePaths?.forEach((path, index) => {
          if (request.deletionStates?.[index] !== undefined) {
            remoteDeletionStates.set(path, request.deletionStates[index]);
          }
        });

        await fileSyncService.downloadFiles(
          request.filePizzaLink,
          request.filePaths || request.files,
          remoteTimestamps,
          remoteDocumentIds,
          remoteDeletionStates,
          fileSyncServerUrl
        );

        const requestsArray =
          ydocRef.current.getArray<FileSyncRequest>('syncRequests');
        const requestIndex = requestsArray.
          toArray().
          findIndex((r) => r.id === request.id);
        if (requestIndex >= 0) {
          const completedRequest = {
            ...requestsArray.get(requestIndex),
            status: 'completed' as const
          };
          requestsArray.delete(requestIndex, 1);
          requestsArray.insert(requestIndex, [completedRequest]);
        }

        const verification: FileSyncVerification = {
          id: nanoid(),
          requestId: request.id,
          verifierId: user.id,
          verifierUsername: user.username,
          providerId: request.providerId,
          timestamp: Date.now(),
          status: 'success'
        };

        const verificationsArray =
          ydocRef.current.getArray<FileSyncVerification>('verifications');
        verificationsArray.push([verification]);

        releaseHoldSignal(request.holdSignalId);
        fileSyncService.clearSyncFailures(request.providerId);

        const newLastSync = Date.now();
        setLastSyncTimestamp(newLastSync);

        fileSyncService.showSuccessNotification(
          `Downloaded ${request.files.length} file(s) successfully`,
          { operationId }
        );

        addNotification({
          type: 'sync_complete',
          message: `Downloaded ${request.files.length} file(s) successfully`,
          data: { requestId: request.id, fileCount: request.files.length }
        });

        await refreshFileTree();
        await updateLocalFileMap();
      } catch (error) {
        console.error('Error downloading files:', error);

        const isDisabled = fileSyncService.trackSyncFailure(request.providerId);

        fileSyncService.showErrorNotification(
          `Failed to download files: ${error instanceof Error ? error.message : 'unknown error'}`,
          { operationId }
        );

        if (isDisabled) {
          addNotification({
            type: 'sync_error',
            message:
              'Sync with peer disabled due to repeated failures. Refresh to re-enable.',
            data: { requestId: request.id, disabled: true }
          });
        }

        const verification: FileSyncVerification = {
          id: nanoid(),
          requestId: request.id,
          verifierId: user.id,
          verifierUsername: user.username,
          providerId: request.providerId,
          timestamp: Date.now(),
          status: 'failure',
          message: error instanceof Error ? error.message : 'unknown error'
        };

        const verificationsArray =
          ydocRef.current.getArray<FileSyncVerification>('verifications');
        verificationsArray.push([verification]);

        releaseHoldSignal(request.holdSignalId);
        processedRequestsRef.current.delete(`download_${request.id}`);

        addNotification({
          type: 'sync_error',
          message: `Failed to download files: ${error instanceof Error ? error.message : 'unknown error'}`,
          data: { requestId: request.id }
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
      releaseHoldSignal]

  );

  const handleVerification = useCallback(
    (verification: FileSyncVerification) => {
      if (!user || verification.providerId !== user.id) return;

      const message =
        verification.status === 'success' ?
          `Sync completed successfully with ${verification.verifierUsername}` :
          `Sync failed with ${verification.verifierUsername}: ${verification.message || 'unknown error'}`;

      addNotification({
        type: 'verification',
        message,
        data: { verificationId: verification.id, status: verification.status }
      });

      if (verification.status === 'success') {
        setTimeout(async () => {
          await updateLocalFileMap();
        }, 1000);
      }
    },
    [user, addNotification, updateLocalFileMap]
  );

  const cleanupExpiredHolds = useCallback(() => {
    if (!ydocRef.current) return;

    const holdSignalsArray =
      ydocRef.current.getArray<FileSyncHoldSignal>('holdSignals');
    const now = Date.now();

    for (let i = holdSignalsArray.length - 1; i >= 0; i--) {
      const signal = holdSignalsArray.get(i);
      if (signal.expiresAt < now && signal.status === 'active') {
        const expiredSignal = { ...signal, status: 'expired' as const };
        holdSignalsArray.delete(i, 1);
        holdSignalsArray.insert(i, [expiredSignal]);

        if (signal.holderId === user?.id) {
          activeHoldsRef.current.delete(signal.targetPeerId);
        }
      }
    }
  }, [user]);

  const cleanupCompletedRequests = useCallback(() => {
    if (!ydocRef.current) return;

    const requestsArray =
      ydocRef.current.getArray<FileSyncRequest>('syncRequests');
    const verificationsArray =
      ydocRef.current.getArray<FileSyncVerification>('verifications');
    const now = Date.now();
    const CLEANUP_THRESHOLD = 5 * 60 * 1000;

    for (let i = requestsArray.length - 1; i >= 0; i--) {
      const request = requestsArray.get(i);
      if (
        (request.status === 'completed' || request.status === 'failed') &&
        now - request.timestamp > CLEANUP_THRESHOLD) {
        requestsArray.delete(i, 1);
      }
    }

    for (let i = verificationsArray.length - 1; i >= 0; i--) {
      const verification = verificationsArray.get(i);
      if (now - verification.timestamp > CLEANUP_THRESHOLD) {
        verificationsArray.delete(i, 1);
      }
    }
  }, []);

  const performSync = useCallback(async () => {
    if (!isFileSyncEnabled || !user || !isInitializedRef.current || !docUrl)
      return;

    console.log('[FileSyncContext] Performing sync cycle...');
    cleanupExpiredHolds();
    cleanupCompletedRequests();
    await updateLocalFileMap();
    await checkAndRequestFiles();
  }, [
    isFileSyncEnabled,
    user,
    docUrl,
    cleanupExpiredHolds,
    cleanupCompletedRequests,
    updateLocalFileMap,
    checkAndRequestFiles]
  );

  const throttledPerformSync = useCallback(() => {
    if (syncThrottleRef.current) {
      clearTimeout(syncThrottleRef.current);
    }

    syncThrottleRef.current = setTimeout(() => {
      console.log('[FileSyncContext] File storage changed, triggering sync.');
      performSync();
      syncThrottleRef.current = null;
    }, 1000);
  }, [performSync]);

  const enableSync = useCallback(() => {
    console.log('[FileSyncContext] Enabling file sync');
    setIsFileSyncEnabled(true);
    fileSyncService.showSuccessNotification(t('File sync enabled'), {
      duration: 2000
    });
    setTimeout(performSync, 1000);
  }, [performSync]);

  const disableSync = useCallback(() => {
    console.log('[FileSyncContext] Disabling file sync');
    setIsFileSyncEnabled(false);
    fileSyncService.cleanup();
    activeHoldsRef.current.clear();
    processedRequestsRef.current.clear();

    if (syncThrottleRef.current) {
      clearTimeout(syncThrottleRef.current);
      syncThrottleRef.current = null;
    }

    Object.keys(localStorage).forEach((key) => {
      if (
        key.startsWith('sync-failures-') ||
        key.startsWith('sync-disabled-')) {
        localStorage.removeItem(key);
      }
    });

    if (syncIntervalRef.current) {
      clearInterval(syncIntervalRef.current);
      syncIntervalRef.current = null;
    }

    fileSyncService.showInfoNotification(t('File sync disabled'), {
      duration: 2000
    });
  }, []);

  useEffect(() => {
    if (settingsRegistered.current) return;
    settingsRegistered.current = true;

    const initialEnable =
      getSetting('file-sync-enable')?.value as boolean ?? false;
    const initialAutoInterval =
      getSetting('file-sync-auto-interval')?.value as number ?? 10;
    const initialHoldTimeout =
      getSetting('file-sync-hold-timeout')?.value as number ?? 30;
    const initialRequestTimeout =
      getSetting('file-sync-request-timeout')?.value as number ?? 60;
    const initialConflictResolution =
      getSetting('file-sync-conflict-resolution')?.value as string ??
      'prefer-latest';
    const initialServerUrl =
      getSetting('file-sync-server-url')?.value as string ??
      'http://filepizza.localhost:8082';
    const initialNotifications =
      getSetting('file-sync-notifications')?.value as boolean ?? true;

    setIsFileSyncEnabled(initialEnable);
    setAutoSyncIntervalSeconds(initialAutoInterval);
    setHoldTimeoutSeconds(initialHoldTimeout);
    setRequestTimeoutSeconds(initialRequestTimeout);
    setConflictResolutionStrategy(initialConflictResolution);
    setFileSyncServerUrl(initialServerUrl);
    setSyncNotificationsEnabled(initialNotifications);

    registerSetting({
      id: 'file-sync-enable',
      category: t("Collaboration"),
      subcategory: t("File Synchronization"),
      type: 'checkbox',
      label: t("Enable file synchronization with peers"),
      defaultValue: initialEnable,
      onChange: (value) => {
        if (value) enableSync(); else
          disableSync();
      }
    });

    registerSetting({
      id: 'file-sync-auto-interval',
      category: t("Collaboration"),
      subcategory: t("File Synchronization"),
      type: 'number',
      label: t("Auto-sync interval (seconds)"),
      description: t("How often to check for file changes and sync"),
      defaultValue: initialAutoInterval,
      min: 5,
      max: 300,
      onChange: (value) => {
        setAutoSyncIntervalSeconds(value as number);
      }
    });

    registerSetting({
      id: 'file-sync-hold-timeout',
      category: t("Collaboration"),
      subcategory: t("File Synchronization"),
      type: 'number',
      label: t("Hold signal timeout (seconds)"),
      description: t("How long to hold a peer before timeout"),
      defaultValue: initialHoldTimeout,
      min: 10,
      max: 120,
      onChange: (value) => {
        setHoldTimeoutSeconds(value as number);
      }
    });

    registerSetting({
      id: 'file-sync-request-timeout',
      category: t("Collaboration"),
      subcategory: t("File Synchronization"),
      type: 'number',
      label: t("Request timeout (seconds)"),
      description: t("How long to wait for file transfer completion"),
      defaultValue: initialRequestTimeout,
      min: 30,
      max: 300,
      onChange: (value) => {
        setRequestTimeoutSeconds(value as number);
      }
    });

    registerSetting({
      id: 'file-sync-conflict-resolution',
      category: t("Collaboration"),
      subcategory: t("File Synchronization"),
      type: 'select',
      label: t("Conflict resolution strategy"),
      description: t("How to handle file conflicts when both local and remote files have changed"),

      defaultValue: initialConflictResolution,
      options: [
        { label: t("Prefer Latest (Default)"), value: 'prefer-latest' },
        { label: t("Prefer Local (Do nothing)"), value: 'prefer-local' },
        { label: t("Notify of Conflicts"), value: 'notify' }],

      onChange: (value) => {
        setConflictResolutionStrategy(value as string);
      }
    });

    registerSetting({
      id: 'file-sync-server-url',
      category: t("Collaboration"),
      subcategory: t("File Synchronization"),
      type: 'text',
      label: t("FilePizza server URL"),
      description: t("Server URL for peer-to-peer file transfers"),
      defaultValue: initialServerUrl,
      onChange: (value) => {
        setFileSyncServerUrl(value as string);
      }
    });

    registerSetting({
      id: 'file-sync-notifications',
      category: t("Collaboration"),
      subcategory: t("File Synchronization"),
      type: 'checkbox',
      label: t("Show sync notifications"),
      description: t("Display notifications for file sync activities"),
      defaultValue: initialNotifications,
      onChange: (value) => {
        setSyncNotificationsEnabled(value as boolean);
      }
    });
  }, [registerSetting, getSetting, enableSync, disableSync]);

  useEffect(() => {
    if (!user || !projectId || isInitializedRef.current) return;

    const signalingServersSetting = getSetting('collab-signaling-servers');
    const awarenessTimeoutSetting = getSetting('collab-awareness-timeout');
    const autoReconnectSetting = getSetting('collab-auto-reconnect');

    // Wait until all collaboration settings are available
    if (!signalingServersSetting || !awarenessTimeoutSetting || !autoReconnectSetting) {
      return;
    }

    const signalingServers = signalingServersSetting.value as string;
    const awarenessTimeout = awarenessTimeoutSetting.value as number;
    const autoReconnect = autoReconnectSetting.value as boolean;

    const serversToUse = signalingServers.split(',').map((s) => s.trim());

    try {
      const { doc } = collabService.connect(projectId, 'file_sync', {
        signalingServers: serversToUse,
        autoReconnect,
        awarenessTimeout: awarenessTimeout * 1000
      });
      ydocRef.current = doc;
      isInitializedRef.current = true;

      const fileSyncMap = doc.getMap('fileSync');
      const requestsArray = doc.getArray<FileSyncRequest>('syncRequests');
      const verificationsArray =
        doc.getArray<FileSyncVerification>('verifications');

      fileSyncMap.observe(() => {
        if (isFileSyncEnabled) {
          setTimeout(checkAndRequestFiles, 1000);
        }
      });

      requestsArray.observe(() => {
        if (isFileSyncEnabled) {
          const requests = requestsArray.toArray();
          requests.forEach((request) => {
            if (
              request.providerId === user.id &&
              request.status === 'pending') {
              handleIncomingSyncRequest(request);
            } else if (
              request.requesterId === user.id &&
              request.status === 'ready') {
              handleSyncRequestUpdate(request);
            }
          });
        }
      });

      verificationsArray.observe(() => {
        if (isFileSyncEnabled) {
          const verifications = verificationsArray.toArray();
          verifications.forEach((verification) => {
            handleVerification(verification);
          });
        }
      });
    } catch (error) {
      console.error(
        'Error initializing YJS doc for file sync:',
        error
      );
      fileSyncService.showErrorNotification(t('Failed to initialize file sync'), {
        duration: 5000
      });
    }

    return () => {
      if (projectId) {
        collabService.disconnect(projectId, 'file_sync');
      }
      isInitializedRef.current = false;
    };
  }, [
    user,
    projectId,
    isFileSyncEnabled,
    checkAndRequestFiles,
    handleIncomingSyncRequest,
    handleSyncRequestUpdate,
    handleVerification,
    getSetting]
  );

  useEffect(() => {
    if (!isFileSyncEnabled || !isInitializedRef.current) {
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
      autoSyncIntervalSeconds * 1000
    );
    syncIntervalRef.current = intervalId;
    const initialSyncTimeout = setTimeout(
      () => performSyncWithPeerMonitoring(),
      1000
    );

    return () => {
      clearInterval(intervalId);
      clearTimeout(initialSyncTimeout);
    };
  }, [
    isFileSyncEnabled,
    isInitializedRef.current,
    performSync,
    monitorConnectedPeers,
    autoSyncIntervalSeconds]
  );

  const cleanupStaleFileReferences = useCallback(async () => { }, []);

  const requestSync = useCallback(async () => {
    if (!user || !isFileSyncEnabled) return;

    const operationId = `filesync-manual-${Date.now()}`;
    setIsSyncing(true);

    try {
      fileSyncService.showLoadingNotification(
        t('Manual sync initiated...'),
        operationId
      );
      await performSync();
      fileSyncService.showSuccessNotification(t('Manual sync completed'), {
        operationId
      });
    } catch (error) {
      fileSyncService.showErrorNotification(
        t('Manual sync failed: ') + `${error instanceof Error ? error.message : t('unknown error')}`,
        { operationId }
      );
    } finally {
      setIsSyncing(false);
    }
  }, [user, isFileSyncEnabled, performSync]);

  const clearNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const clearAllNotifications = useCallback(() => setNotifications([]), []);

  useEffect(() => {
    const unsubscribe = fileSyncService.addListener(addNotification);
    return unsubscribe;
  }, [addNotification]);

  useEffect(() => {
    const unsubscribe = fileStorageEventEmitter.onChange(() => {
      if (isFileSyncEnabled) {
        throttledPerformSync();
      }
    });
    return unsubscribe;
  }, [throttledPerformSync, isFileSyncEnabled]);

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
        cleanupStaleFileReferences
      }}>

      {children}
    </FileSyncContext.Provider>);

};