// src/hooks/useOffline.ts
import { useContext } from "react";

import { OfflineContext } from "../contexts/OfflineContext";

export const useOffline = () => {
	const context = useContext(OfflineContext);
	if (!context) {
		throw new Error("useOffline must be used within OfflineProvider");
	}
	return context;
};
