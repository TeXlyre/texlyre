// src/components/storage/RemoteStorageStatusIndicator.tsx
import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { t } from '@/i18n';
import { createNamedLogger } from '@/logging';
import { useAuth } from '../../hooks/useAuth';
import { useChelys } from '../../hooks/useChelys';
import { useSettings } from '../../hooks/useSettings';
import {
	notificationService,
	shouldShowNotification,
} from '../../services/NotificationService';
import { storageSyncService } from '../../services/StorageSyncService';
import {
	genericStorageService,
	StorageProtocolError,
} from '../../services/GenericStorageService';
import type { StorageProjectStatus } from '../../types/storage';
import { SyncIcon } from '../common/Icons';

const moduleLog = createNamedLogger('RemoteStorageStatusIndicator');

interface RemoteStorageStatusIndicatorProps {
	projectId: string;
}

const RemoteStorageStatusIndicator: React.FC<
	RemoteStorageStatusIndicatorProps
> = ({ projectId }) => {
	const { user, isGuestUser } = useAuth();
	const { storageUnlocked, storageUnlockReady } = useChelys();
	const { getSetting } = useSettings();
	const [status, setStatus] = useState<StorageProjectStatus>('checking');
	const [syncing, setSyncing] = useState(false);
	const checkingRef = useRef(false);
	const syncingRef = useRef(false);
	const lastNotifiedRevisionRef = useRef<string | null>(null);
	const checkFailedRef = useRef(false);
	const reportedCheckErrorRef = useRef(false);
	const mountedRef = useRef(true);

	const userId = user && !isGuestUser(user) ? user.id : null;
	const binding = userId
		? storageSyncService.getProjectBinding(userId, projectId)
		: null;
	const periodicChecks =
		(getSetting('storage-check-for-updates')?.value as boolean) ?? false;
	const savedInterval = Number(
		getSetting('storage-check-interval')?.value ?? 60,
	);
	const intervalSeconds = Number.isFinite(savedInterval)
		? Math.max(10, Math.min(3600, savedInterval))
		: 60;

	const notify = useCallback(
		(kind: 'info' | 'success' | 'error', message: string) => {
			if (!shouldShowNotification('storage-notifications', kind)) return;
			if (kind === 'error') notificationService.showError(message);
			else if (kind === 'success') notificationService.showSuccess(message);
			else notificationService.showInfo(message);
		},
		[],
	);

	const checkForUpdates = useCallback(async () => {
		if (!userId || checkingRef.current || syncingRef.current) return;
		if (!storageUnlockReady) {
			if (mountedRef.current) setStatus('checking');
			return;
		}
		if (!storageUnlocked || !navigator.onLine) {
			if (mountedRef.current) setStatus('unavailable');
			return;
		}
		checkingRef.current = true;
		if (mountedRef.current) {
			setStatus((current) =>
				current === 'unavailable' || current === 'error'
					? 'checking'
					: current,
			);
		}
		try {
			const result = await storageSyncService.checkBoundProjectRevision(
				userId,
				projectId,
			);
			if (!result || syncingRef.current || !mountedRef.current) return;
			setStatus(result.status);
			checkFailedRef.current = false;
			reportedCheckErrorRef.current = false;
			if (
				result.status === 'updates-available' &&
				result.revision &&
				lastNotifiedRevisionRef.current !== result.revision
			) {
				lastNotifiedRevisionRef.current = result.revision;
				notify('info', t('Remote storage updates are available'));
			}
		} catch (error) {
			moduleLog.warn('Failed to check remote storage:', error);
			const protocolError =
				error instanceof StorageProtocolError ||
				(error instanceof Error &&
					error.message === 'Invalid storage HEAD response');
			if (!syncingRef.current && mountedRef.current) {
				setStatus(protocolError ? 'error' : 'unavailable');
			}
			checkFailedRef.current = !protocolError;
			if (protocolError && !reportedCheckErrorRef.current && mountedRef.current) {
				reportedCheckErrorRef.current = true;
				notify('error', t('Could not check remote storage for updates'));
			}
		} finally {
			checkingRef.current = false;
		}
	}, [userId, projectId, storageUnlockReady, storageUnlocked, notify]);

	useEffect(() => {
		mountedRef.current = true;
		lastNotifiedRevisionRef.current = null;
		checkFailedRef.current = false;
		reportedCheckErrorRef.current = false;
		setStatus('checking');
		void checkForUpdates();

		const onVisible = () => {
			if (document.visibilityState === 'visible') void checkForUpdates();
		};
		const onOnline = () => void checkForUpdates();
		const unsubscribeStatus = genericStorageService.onStatusChange(
			(configId, connectionStatus) => {
				if (
					configId === binding?.providerId &&
					connectionStatus === 'connected' &&
					checkFailedRef.current
				) {
					void checkForUpdates();
				}
			},
		);
		const onStorageSynced = (event: Event) => {
			const detail = (
				event as CustomEvent<{
					userId: string;
					projectId: string;
				}>
			).detail;
			if (
				detail?.userId === userId &&
				detail.projectId === projectId &&
				!syncingRef.current
			) {
				setStatus('synced');
			}
		};
		document.addEventListener('storage-project-synced', onStorageSynced);
		document.addEventListener('visibilitychange', onVisible);
		window.addEventListener('online', onOnline);
		return () => {
			mountedRef.current = false;
			unsubscribeStatus();
			document.removeEventListener('storage-project-synced', onStorageSynced);
			document.removeEventListener('visibilitychange', onVisible);
			window.removeEventListener('online', onOnline);
		};
	}, [checkForUpdates, userId, projectId, binding?.providerId]);

	useEffect(() => {
		if (!periodicChecks || !userId || !binding?.enabled) return;
		const timer = window.setInterval(() => {
			if (document.visibilityState === 'visible') void checkForUpdates();
		}, intervalSeconds * 1000);
		return () => window.clearInterval(timer);
	}, [
		periodicChecks,
		userId,
		binding?.enabled,
		intervalSeconds,
		checkForUpdates,
	]);

	if (!binding || !userId) return null;

	const available = binding.enabled && storageUnlocked;
	const currentStatus = syncing
		? 'syncing'
		: !storageUnlockReady
			? 'checking'
			: !available
				? 'unavailable'
				: status;
	const statusLabel = (() => {
		switch (currentStatus) {
			case 'checking':
				return t('Checking...');
			case 'syncing':
				return t('Syncing...');
			case 'synced':
				return t('No remote updates');
			case 'local-only':
				return t('Not stored remotely');
			case 'updates-available':
				return t('Updates available');
			case 'unavailable':
				return t('Unavailable');
			default:
				return t('Error');
		}
	})();

	const handleSync = async () => {
		if (syncingRef.current || !available || !navigator.onLine) return;
		syncingRef.current = true;
		setSyncing(true);
		try {
			await storageSyncService.syncBoundProject(userId, projectId);
			setStatus('synced');
			notify('success', t('Remote storage synchronized'));
		} catch (error) {
			moduleLog.warn('Manual remote storage sync failed:', error);
			setStatus('error');
			notify(
				'error',
				t('Remote storage sync failed: {message}', {
					message: error instanceof Error ? error.message : String(error),
				}),
			);
		} finally {
			syncingRef.current = false;
			setSyncing(false);
			void checkForUpdates();
		}
	};

	return (
		<button
			type='button'
			className='ui-badge'
			data-variant='label'
			data-tone={
				currentStatus === 'error'
					? 'danger'
					: currentStatus === 'updates-available'
						? 'warning'
						: undefined
			}
			onClick={() => void handleSync()}
			disabled={!available || !navigator.onLine || syncing}
			title={
				available
					? t('Remote storage: {status}. Click to sync.', {
						status: statusLabel,
					})
					: t('Remote storage unavailable')
			}
			aria-label={t('Sync project with remote storage')}
		>
			<SyncIcon />
			<span>{t('Storage')}</span>
			<span>{statusLabel}</span>
		</button>
	);
};

export default RemoteStorageStatusIndicator;
