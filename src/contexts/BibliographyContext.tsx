// src/contexts/BibliographyContext.tsx
import type React from "react";
import {
	type ReactNode,
	createContext,
	useCallback,
	useEffect,
	useState,
} from "react";

import { useAuth } from "../hooks/useAuth";
import { useProperties } from "../hooks/useProperties";
import { fileStorageService } from "../services/FileStorageService";
import { BibtexParser } from "../../extras/viewers/bibtex/BibtexParser";

export interface BibliographyFile {
	path: string;
	name: string;
	id: string;
}

export interface BibEntry {
	key: string;
	entryType: string;
	fields: Record<string, string>;
	rawEntry: string;
	source?: 'local' | 'external';
	isImported?: boolean;
	filePath?: string;
}

export interface BibliographyContextType {
	getTargetFile: (pluginId: string, projectId?: string) => string | null;
	setTargetFile: (pluginId: string, filePath: string, projectId?: string) => void;
	getAvailableFiles: () => BibliographyFile[];
	createBibFile: (fileName?: string) => Promise<string | null>;
	refreshAvailableFiles: () => Promise<void>;
	registerPluginTargetFile: (pluginId: string, pluginName: string) => void;
	getLocalEntries: () => Promise<BibEntry[]>;
	importEntry: (entry: BibEntry, pluginId: string, projectId?: string, duplicateHandling?: string) => Promise<boolean>;
	isImporting: (entryKey: string) => boolean;
}

export const BibliographyContext = createContext<BibliographyContextType>({
	getTargetFile: () => null,
	setTargetFile: () => {},
	getAvailableFiles: () => [],
	createBibFile: async () => null,
	refreshAvailableFiles: async () => {},
	registerPluginTargetFile: () => {},
	getLocalEntries: async () => [],
	importEntry: async () => false,
	isImporting: () => false,
});

interface BibliographyProviderProps {
	children: ReactNode;
}

export const BibliographyProvider: React.FC<BibliographyProviderProps> = ({ children }) => {
	const { getProperty, setProperty, registerProperty } = useProperties();
	const { user } = useAuth();
	const [availableFiles, setAvailableFiles] = useState<BibliographyFile[]>([]);
	const [importingEntries, setImportingEntries] = useState<Set<string>>(new Set());

	const getPropertyId = (pluginId: string) => `${pluginId}-target-bib-file`;

	const getTargetFile = useCallback((pluginId: string, projectId?: string): string | null => {
		const propertyId = getPropertyId(pluginId);
		const scopeOptions = projectId ? { scope: "project" as const, projectId } : { scope: "global" as const };
		return getProperty(propertyId, scopeOptions) as string | null;
	}, [getProperty]);

	const setTargetFile = useCallback((pluginId: string, filePath: string, projectId?: string) => {
		const propertyId = getPropertyId(pluginId);
		const scopeOptions = projectId ? { scope: "project" as const, projectId } : { scope: "global" as const };
		setProperty(propertyId, filePath, scopeOptions);
	}, [setProperty]);

	const refreshAvailableFiles = useCallback(async () => {
		try {
			const allFiles = await fileStorageService.getAllFiles();
			const bibFiles = allFiles.filter(file =>
				(file.name.endsWith('.bib') || file.name.endsWith('.bibtex')) &&
				!file.isDeleted
			);

			const files = bibFiles.map(file => ({
				path: file.path,
				name: file.name,
				id: file.id
			}));

			setAvailableFiles(files);
		} catch (error) {
			console.error('[BibliographyContext] Error refreshing available files:', error);
			setAvailableFiles([]);
		}
	}, []);

	const createBibFile = useCallback(async (fileName: string = 'bibliography.bib'): Promise<string | null> => {
		try {
			const filePath = `/${fileName}`;

			const existingFile = await fileStorageService.getFileByPath(filePath);
			if (existingFile && !existingFile.isDeleted) {
				console.warn(`[BibliographyContext] File ${filePath} already exists`);
				return filePath;
			}

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
			await refreshAvailableFiles();

			console.log(`[BibliographyContext] Created new bibliography file: ${filePath}`);
			return filePath;
		} catch (error) {
			console.error('[BibliographyContext] Error creating new bib file:', error);
			return null;
		}
	}, [refreshAvailableFiles]);

	const getLocalEntries = useCallback(async (): Promise<BibEntry[]> => {
		try {
			const allFiles = await fileStorageService.getAllFiles();
			const bibFiles = allFiles.filter(file =>
				file.name.endsWith('.bib') &&
				!file.isDeleted &&
				file.content
			);

			const allLocalEntries: BibEntry[] = [];

			for (const bibFile of bibFiles) {
				const content = typeof bibFile.content === 'string'
					? bibFile.content
					: new TextDecoder().decode(bibFile.content);

				try {
					const parsedEntries = BibtexParser.parse(content);
					const bibEntries: BibEntry[] = parsedEntries.map(entry => ({
						key: entry.id,
						entryType: entry.type,
						fields: entry.fields,
						rawEntry: BibtexParser.serializeEntry(entry),
						source: 'local' as const,
						isImported: false,
						filePath: bibFile.path
					}));

					allLocalEntries.push(...bibEntries);
				} catch (parseError) {
					console.error(`[BibliographyContext] Error parsing ${bibFile.path}:`, parseError);
				}
			}

			return allLocalEntries;
		} catch (error) {
			console.error('[BibliographyContext] Error getting local entries:', error);
			return [];
		}
	}, []);

	const importEntry = useCallback(async (
		entry: BibEntry,
		pluginId: string,
		projectId?: string,
		duplicateHandling: string = 'keep-local'
	): Promise<boolean> => {
		if (entry.source === 'local' || importingEntries.has(entry.key)) {
			return false;
		}

		setImportingEntries(prev => new Set(prev).add(entry.key));

		try {
			let targetFile = getTargetFile(pluginId, projectId);

			// If no target file is selected, try to use the first available file or create one
			if (!targetFile) {
				if (availableFiles.length > 0) {
					targetFile = availableFiles[0].path;
					setTargetFile(pluginId, targetFile, projectId);
					console.log(`[BibliographyContext] Auto-selected target file: ${targetFile}`);
				} else {
					// Create a new bibliography file
					const createdFile = await createBibFile();
					if (createdFile) {
						targetFile = createdFile;
						setTargetFile(pluginId, createdFile, projectId);
						console.log(`[BibliographyContext] Created and selected new target file: ${targetFile}`);
					} else {
						console.error('[BibliographyContext] Failed to create new bibliography file');
						return false;
					}
				}
			}

			if (!targetFile) {
				console.error('[BibliographyContext] No target bibliography file available and could not create one');
				return false;
			}

			// Check for duplicates
			const localEntries = await getLocalEntries();
			const existingEntry = localEntries.find(local => local.key === entry.key);
			if (existingEntry && duplicateHandling === 'keep-local') {
				console.log(`[BibliographyContext] Entry ${entry.key} already exists locally, keeping local version`);
				return true; // Consider this successful
			}

			const bibFile = await fileStorageService.getFileByPath(targetFile);
			if (!bibFile) {
				console.error(`[BibliographyContext] Target file not found: ${targetFile}`);
				return false;
			}

			let entryToImport = entry.rawEntry;
			if (duplicateHandling === 'rename' && existingEntry) {
				let counter = 1;
				let newKey = `${entry.key}_${counter}`;
				while (localEntries.some(local => local.key === newKey)) {
					counter++;
					newKey = `${entry.key}_${counter}`;
				}
				entryToImport = entryToImport.replace(entry.key, newKey);
			}

			let currentContent = '';
			if (bibFile.content) {
				currentContent = typeof bibFile.content === 'string'
					? bibFile.content
					: new TextDecoder().decode(bibFile.content);
			}

			const newContent = currentContent.trim()
				? `${currentContent.trim()}\n\n${entryToImport}\n`
				: `${entryToImport}\n`;

			await fileStorageService.updateFileContent(bibFile.id, newContent);

			console.log(`[BibliographyContext] Successfully imported ${entry.key} to ${targetFile}`);

			// Dispatch event to refresh file tree and trigger re-parsing
			document.dispatchEvent(new CustomEvent('refresh-file-tree'));

			return true;

		} catch (error) {
			console.error(`[BibliographyContext] Error importing entry ${entry.key}:`, error);
			return false;
		} finally {
			setImportingEntries(prev => {
				const newSet = new Set(prev);
				newSet.delete(entry.key);
				return newSet;
			});
		}
	}, [getTargetFile, setTargetFile, availableFiles, createBibFile, getLocalEntries, importingEntries]);

	const isImporting = useCallback((entryKey: string): boolean => {
		return importingEntries.has(entryKey);
	}, [importingEntries]);

	const registerPluginTargetFile = useCallback((pluginId: string, pluginName: string) => {
		const propertyId = getPropertyId(pluginId);

		const handleTargetFileChange = async (value: unknown) => {
			if (value === "CREATE_NEW") {
				const createdFile = await createBibFile();
				if (createdFile) {
					setProperty(propertyId, createdFile, { scope: "global" });
					document.dispatchEvent(new CustomEvent('refresh-file-tree'));
				}
			}
		};

		const options = [
			{ label: "Create new bibliography.bib", value: "CREATE_NEW" },
			...availableFiles.map(file => ({
				label: file.name,
				value: file.path
			}))
		];

		registerProperty({
			id: propertyId,
			category: "LSP",
			subcategory: pluginName,
			defaultValue: "",
			options,
			onChange: handleTargetFileChange
		});
	}, [availableFiles, createBibFile, setProperty, registerProperty]);

	const getAvailableFiles = useCallback(() => availableFiles, [availableFiles]);

	useEffect(() => {
		refreshAvailableFiles();

		const handleFileTreeChange = () => {
			refreshAvailableFiles();
		};

		document.addEventListener('refresh-file-tree', handleFileTreeChange);
		const interval = setInterval(refreshAvailableFiles, 5000);

		return () => {
			document.removeEventListener('refresh-file-tree', handleFileTreeChange);
			clearInterval(interval);
		};
	}, [refreshAvailableFiles]);

	const contextValue = {
		getTargetFile,
		setTargetFile,
		getAvailableFiles,
		createBibFile,
		refreshAvailableFiles,
		registerPluginTargetFile,
		getLocalEntries,
		importEntry,
		isImporting,
	};

	return (
		<BibliographyContext.Provider value={contextValue}>
			{children}
		</BibliographyContext.Provider>
	);
};