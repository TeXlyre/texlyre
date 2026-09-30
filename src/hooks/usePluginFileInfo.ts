import { useEffect, useState } from 'react';

import { createNamedLogger } from '@/logging';
import {
	fileStoreService,
	type FileStorageChange,
} from '../services/FileStoreService';

const moduleLog = createNamedLogger('usePluginFileInfo');

interface PluginFileInfo {
	fileName: string;
	filePath: string;
	mimeType?: string;
	fileSize?: number;
	lastModified?: number;
}

export const usePluginFileInfo = (fileId?: string, fileName?: string) => {
	const [fileInfo, setFileInfo] = useState<PluginFileInfo>({
		fileName: fileName || 'Unknown file',
		filePath: fileName || 'Unknown file',
	});

	useEffect(() => {
		const loadFileInfo = async () => {
			if (fileId) {
				try {
					const file = await fileStoreService.getFile(fileId);
					if (file) {
						setFileInfo({
							fileName: file.name,
							filePath: file.path,
							mimeType: file.mimeType,
							fileSize: file.size,
							lastModified: file.lastModified,
						});
					}
				} catch (error) {
					moduleLog.error('Error loading file info:', error);
				}
			} else if (fileName) {
				setFileInfo({
					fileName,
					filePath: fileName,
				});
			}
		};

		const handleContentChanged = (event: Event) => {
			const { detail } = event as CustomEvent<FileStorageChange>;
			if (!fileId || detail.fileId !== fileId) return;

			setFileInfo((current) => ({
				...current,
				filePath: detail.filePath ?? current.filePath,
				fileSize: detail.size ?? current.fileSize,
				lastModified: detail.lastModified ?? current.lastModified,
			}));
		};

		void loadFileInfo();
		document.addEventListener('file-content-changed', handleContentChanged);
		return () => {
			document.removeEventListener(
				'file-content-changed',
				handleContentChanged,
			);
		};
	}, [fileId, fileName]);

	return fileInfo;
};
