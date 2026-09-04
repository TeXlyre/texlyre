import { useEffect, useState } from 'react';

import { createNamedLogger } from '@/logging';
import { fileStoreService } from '../services/FileStoreService';

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

		loadFileInfo();
	}, [fileId, fileName]);

	return fileInfo;
};
