// src/hooks/useFileSync.ts
import { useContext } from "react";

import { FileSyncContext } from "../contexts/FileSyncContext";

export const useFileSync = () => {
	const context = useContext(FileSyncContext);
	if (!context) {
		throw new Error("useFileSync must be used within a FileSyncProvider");
	}
	return context;
};
