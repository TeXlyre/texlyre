// src/hooks/useDiskBackup.ts
import { useContext } from 'react';

import { DiskBackupContext } from '../contexts/DiskBackupContext';

export const useDiskBackup = () => {
	const context = useContext(DiskBackupContext);
	if (!context) {
		throw new Error(
			'useDiskBackup must be used within a FileSystemBackupProvider',
		);
	}
	return context;
};
