// src/hooks/useFileSystemBackup.ts
import { useContext } from "react";

import { FileSystemBackupContext } from "../contexts/FileSystemBackupContext";

export const useFileSystemBackup = () => {
	const context = useContext(FileSystemBackupContext);
	if (!context) {
		throw new Error(
			"useFileSystemBackup must be used within a FileSystemBackupProvider",
		);
	}
	return context;
};
