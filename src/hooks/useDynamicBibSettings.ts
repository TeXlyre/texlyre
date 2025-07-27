// src/hooks/useDynamicBibSettings.ts
import { useEffect, useCallback } from 'react';
import { useSettings } from './useSettings';
import { fileStorageService } from '../services/FileStorageService';

export const useDynamicBibSettings = () => {
	const { registerSetting, updateSetting, getSetting } = useSettings();

	const updateBibFileOptions = useCallback(async () => {
		try {
			const allFiles = await fileStorageService.getAllFiles();
			const bibFiles = allFiles.filter(file =>
				file.name.endsWith('.bib') &&
				!file.isDeleted
			);

			const options = bibFiles.map(file => ({
				label: file.name,
				value: file.path
			}));

			// Add option to create new file
			options.unshift({
				label: "Create new bibliography.bib",
				value: "CREATE_NEW"
			});

			// Update the setting with new options
			const currentSetting = getSetting("jabref-lsp-target-bib-file");
			if (currentSetting) {
				updateSetting("jabref-lsp-target-bib-file", {
					...currentSetting,
					options
				});
			}

		} catch (error) {
			console.error('Error updating bib file options:', error);
		}
	}, [getSetting, updateSetting]);

	const createNewBibFile = useCallback(async (fileName: string = 'bibliography.bib'): Promise<string | null> => {
		try {
			const filePath = `/${fileName}`;

			// Check if file already exists
			const existingFile = await fileStorageService.getFileByPath(filePath);
			if (existingFile && !existingFile.isDeleted) {
				console.warn(`File ${filePath} already exists`);
				return filePath;
			}

			// Create new .bib file
			const fileNode = {
				id: crypto.randomUUID(),
				name: fileName,
				path: filePath,
				type: 'file' as const,
				content: '% Bibliography file created by TeXlyre\n% Add your BibTeX entries here\n\n',
				lastModified: Date.now(),
				size: 0,
				mimeType: 'text/x-bibtex',
				isBinary: false,
				isDeleted: false
			};

			await fileStorageService.storeFile(fileNode, { showConflictDialog: false });

			// Update the setting to use the new file
			updateSetting("jabref-lsp-target-bib-file", filePath);

			// Refresh options
			await updateBibFileOptions();

			return filePath;

		} catch (error) {
			console.error('Error creating new bib file:', error);
			return null;
		}
	}, [updateSetting, updateBibFileOptions]);

	const handleTargetFileChange = useCallback(async (newValue: string) => {
		if (newValue === "CREATE_NEW") {
			const createdFile = await createNewBibFile();
			if (createdFile) {
				// Dispatch event to refresh file tree
				document.dispatchEvent(new CustomEvent('refresh-file-tree'));
			}
		}
	}, [createNewBibFile]);

	useEffect(() => {
		// Register the dynamic setting if it doesn't exist
		const existingSetting = getSetting("jabref-lsp-target-bib-file");
		if (!existingSetting) {
			registerSetting({
				id: "jabref-lsp-target-bib-file",
				category: "LSP",
				subcategory: "JabRef",
				type: "select",
				label: "Target bibliography file",
				description: "Local .bib file to import JabRef entries into",
				defaultValue: "",
				options: [],
				onChange: handleTargetFileChange
			});
		}

		// Update options when component mounts
		updateBibFileOptions();

		// Listen for file tree changes
		const handleFileTreeChange = () => {
			updateBibFileOptions();
		};

		document.addEventListener('refresh-file-tree', handleFileTreeChange);

		// Set up periodic refresh (every 5 seconds when active)
		const interval = setInterval(updateBibFileOptions, 5000);

		return () => {
			document.removeEventListener('refresh-file-tree', handleFileTreeChange);
			clearInterval(interval);
		};
	}, [registerSetting, getSetting, updateBibFileOptions, handleTargetFileChange]);

	return {
		updateBibFileOptions,
		createNewBibFile,
		handleTargetFileChange
	};
};