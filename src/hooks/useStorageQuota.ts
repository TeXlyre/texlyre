// src/hooks/useStorageQuota.ts
import { useCallback, useEffect, useState } from 'react';

import {
	type StorageQuotaStatus,
	storageQuotaService,
} from '../services/StorageQuotaService';
import { useSettings } from './useSettings';

interface StorageQuotaState extends StorageQuotaStatus {
	isLow: boolean;
	hideBanner: boolean;
	refresh: () => Promise<StorageQuotaStatus>;
	requestPersistence: () => Promise<boolean>;
}

export const useStorageQuota = (): StorageQuotaState => {
	const { getSetting } = useSettings();
	const [status, setStatus] = useState(storageQuotaService.getStatus());

	useEffect(() => {
		const unsubscribe = storageQuotaService.addStatusListener(setStatus);
		void storageQuotaService.refresh();

		return unsubscribe;
	}, []);

	const warningThreshold =
		(getSetting('storage-warning-threshold')?.value as number) ?? 85;

	const minimumFreeMegabytes =
		(getSetting('storage-minimum-free')?.value as number) ?? 200;

	const hideBanner =
		(getSetting('storage-hide-banner')?.value as boolean) ?? false;

	const refresh = useCallback(() => storageQuotaService.refresh(true), []);

	const requestPersistence = useCallback(
		() => storageQuotaService.requestPersistence(),
		[],
	);

	const isLow =
		status.isSupported &&
		status.quotaBytes > 0 &&
		(status.usedRatio * 100 >= warningThreshold ||
			status.availableBytes <= minimumFreeMegabytes * 1024 * 1024);

	return {
		...status,
		isLow,
		hideBanner,
		refresh,
		requestPersistence,
	};
};
