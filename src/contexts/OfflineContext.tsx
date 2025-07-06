// src/contexts/OfflineContext.tsx
import type React from "react";
import { createContext, useContext, useEffect, useState } from "react";

import { type OfflineStatus, offlineService } from "../services/OfflineService";

interface OfflineContextType extends OfflineStatus {
	isOfflineMode: boolean;
}

export const OfflineContext = createContext<OfflineContextType | undefined>(
	undefined,
);

export const OfflineProvider: React.FC<{ children: React.ReactNode }> = ({
	children,
}) => {
	const [status, setStatus] = useState(offlineService.getStatus());
	const isOfflineMode = !status.isOnline;

	useEffect(() => {
		const unsubscribe = offlineService.addStatusListener(setStatus);
		return unsubscribe;
	}, []);

	return (
		<OfflineContext.Provider value={{ ...status, isOfflineMode }}>
			{children}
		</OfflineContext.Provider>
	);
};
