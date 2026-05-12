// src/contexts/OfflineContext.tsx
import type React from 'react';
import { createContext, useEffect, useState } from 'react';

import { type OfflineStatus, offlineService } from '../services/OfflineService';
import { collabService } from '../services/CollabService';
import { useSettings } from '../hooks/useSettings';

interface OfflineContextType extends OfflineStatus {
	isOfflineMode: boolean;
	isCollabOfflineMode: boolean;
	hideOfflineBanner: boolean;
}

export const OfflineContext = createContext<OfflineContextType | undefined>(
	undefined,
);

export const OfflineProvider: React.FC<{ children: React.ReactNode }> = ({
	children,
}) => {
	const { getSetting } = useSettings();

	const forceAppOffline =
		(getSetting('offline-force-app-offline')?.value as boolean) ?? false;

	const airgapExternalRequests =
		(getSetting('offline-airgap-external-requests')?.value as boolean) ?? false;

	const forceCollabOffline =
		(getSetting('offline-force-collab-offline')?.value as boolean) ?? false;

	const hideOfflineBanner =
		(getSetting('offline-hide-banner')?.value as boolean) ?? false;

	const [status, setStatus] = useState(offlineService.getStatus());

	useEffect(() => {
		const unsubscribe = offlineService.addStatusListener(setStatus);

		offlineService.syncServiceWorkerState();
		void offlineService.refreshStatus();

		return unsubscribe;
	}, []);

	useEffect(() => {
		offlineService.setForceOffline(forceAppOffline);
	}, [forceAppOffline]);

	useEffect(() => {
		offlineService.setAirgapExternalRequests(airgapExternalRequests);
	}, [airgapExternalRequests]);

	useEffect(() => {
		collabService.setForceLocalConnections(
			forceCollabOffline || airgapExternalRequests,
		);
	}, [forceCollabOffline, airgapExternalRequests]);

	const isOfflineMode = !status.isOnline;
	const isCollabOfflineMode =
		isOfflineMode || forceCollabOffline || status.airgapExternalRequests;

	return (
		<OfflineContext.Provider
			value={{
				...status,
				isOfflineMode,
				isCollabOfflineMode,
				hideOfflineBanner,
			}}
		>
			{children}
		</OfflineContext.Provider>
	);
};

