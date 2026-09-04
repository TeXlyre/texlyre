// src/hooks/useStorageQuota.ts
import { useCallback, useEffect, useState } from 'react';

import {
	type StorageQuotaStatus,
	quotaService,
} from '../services/QuotaService';
import { useSettings } from './useSettings';

interface StorageQuotaState extends StorageQuotaStatus {
	isLow: boolean;
	hideBanner: boolean;
	refresh: () => Promise<StorageQuotaStatus>;
	requestPersistence: () => Promise<boolean>;
}

export const useStorageQuota = (): StorageQuotaState => {
	const { getSetting } = useSettings();
	const [status, setStatus] = useState(quotaService.getStatus());

	useEffect(() => {
		const unsubscribe = quotaService.addStatusListener(setStatus);
		void quotaService.refresh();

		return unsubscribe;
	}, []);

	const warningThreshold =
		(getSetting('storage-warning-threshold')?.value as number) ?? 85;

	const minimumFreeMegabytes =
		(getSetting('storage-minimum-free')?.value as number) ?? 200;

	const hideBanner =
		(getSetting('storage-hide-banner')?.value as boolean) ?? false;

	const refresh = useCallback(() => quotaService.refresh(true), []);

	const requestPersistence = useCallback(
		() => quotaService.requestPersistence(),
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
