import { useEffect, useState } from "react";

import { fileStorageService } from "../services/FileStorageService";

interface PluginFileInfo {
	fileName: string;
	filePath: string;
	mimeType?: string;
	fileSize?: number;
	lastModified?: number;
}

export const usePluginFileInfo = (fileId?: string, fileName?: string) => {
	const [fileInfo, setFileInfo] = useState<PluginFileInfo>({
		fileName: fileName || "Unknown file",
		filePath: fileName || "Unknown file",
	});

	useEffect(() => {
		const loadFileInfo = async () => {
			if (fileId) {
				try {
					const file = await fileStorageService.getFile(fileId);
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
					console.error("Error loading file info:", error);
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
