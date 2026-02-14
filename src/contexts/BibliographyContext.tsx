// src/contexts/BibliographyContext.tsx
import { t } from '@/i18n';
import type React from 'react';
import {
	type ReactNode,
	createContext,
	useCallback,
	useEffect,
	useState,
} from 'react';

import { useProperties } from '../hooks/useProperties';
import { fileStorageService } from '../services/FileStorageService';
import { BibtexParser } from '../../extras/viewers/bibtex/BibtexParser';
import { filePathCacheService } from '../services/FilePathCacheService';
import { isBibFile } from '../utils/fileUtils';
import type { FileNode } from '../types/files';

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
	registerPluginTargetFile: (pluginId: string, pluginName: string) => () => void;
	getLocalEntries: () => Promise<BibEntry[]>;
	importEntry: (entry: BibEntry, pluginId: string, projectId?: string, duplicateHandling?: string) => Promise<boolean>;
	isImporting: (entryKey: string) => boolean;
}

export const BibliographyContext = createContext<BibliographyContextType>({
	getTargetFile: () => null,
	setTargetFile: () => { },
	getAvailableFiles: () => [],
	createBibFile: async () => null,
	refreshAvailableFiles: async () => { },
	registerPluginTargetFile: () => () => { },
	getLocalEntries: async () => [],
	importEntry: async () => false,
	isImporting: () => false,
});

interface BibliographyProviderProps {
	children: ReactNode;
}

export const BibliographyProvider: React.FC<BibliographyProviderProps> = ({ children }) => {
	const { getProperty, setProperty, registerProperty } = useProperties();
	const [availableFiles, setAvailableFiles] = useState<BibliographyFile[]>([]);
	const [importingEntries, setImportingEntries] = useState<Set<string>>(new Set());

	const getPropertyId = (pluginId: string) => `${pluginId}-target-bib-file`;

	const getTargetFile = useCallback((pluginId: string, projectId?: string): string | null => {
		const propertyId = getPropertyId(pluginId);
		const scopeOptions = projectId ? { scope: 'project' as const, projectId } : { scope: 'global' as const };
		const targetFile = getProperty(propertyId, scopeOptions) as string | null;

		if (!targetFile) {
			return null;
		}

		if (availableFiles.length === 0) {
			return targetFile;
		}

		if (availableFiles.some(file => file.path === targetFile)) {
			return targetFile;
		}

		setProperty(propertyId, '', scopeOptions);
		return null;
	}, [getProperty, setProperty, availableFiles]);

	const setTargetFile = useCallback((pluginId: string, filePath: string, projectId?: string) => {
		const propertyId = getPropertyId(pluginId);
		const scopeOptions = projectId ? { scope: 'project' as const, projectId } : { scope: 'global' as const };
		setProperty(propertyId, filePath, scopeOptions);
	}, [setProperty]);

	const refreshAvailableFiles = useCallback(async () => {
		try {
			const allFiles = await fileStorageService.getAllFiles();
			const bibFiles = allFiles.filter(file =>
				isBibFile(file.name) &&
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
				isBibFile(file.name) &&
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

			if (!targetFile) {
				if (availableFiles.length > 0) {
					targetFile = availableFiles[0].path;
					setTargetFile(pluginId, targetFile, projectId);
				} else {
					const createdFile = await createBibFile();
					if (createdFile) {
						targetFile = createdFile;
						setTargetFile(pluginId, createdFile, projectId);
					} else {
						return false;
					}
				}
			}

			if (!targetFile) {
				return false;
			}

			const localEntries = await getLocalEntries();
			const existingEntry = localEntries.find(local => local.key === entry.key && local.filePath === targetFile);
			if (existingEntry && duplicateHandling === 'keep-local') {
				return true;
			}

			const bibFile = await fileStorageService.getFileByPath(targetFile);
			if (!bibFile) {
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

			document.dispatchEvent(new CustomEvent('refresh-file-tree'));
			document.dispatchEvent(new CustomEvent('bib-entry-imported', {
				detail: { entryKey: entry.key, targetFile }
			}));

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
			if (value === 'CREATE_NEW') {
				const createdFile = await createBibFile();
				if (createdFile) {
					document.dispatchEvent(new CustomEvent('refresh-file-tree'));
					return createdFile;
				}
			}
			return value;
		};

		const updateOptions = () => {
			const options = [
				{ label: t('Create new bibliography.bib'), value: 'CREATE_NEW' },
				...availableFiles.map(file => ({
					label: file.name,
					value: file.path
				}))
			];

			registerProperty({
				id: propertyId,
				category: 'LSP',
				subcategory: pluginName,
				defaultValue: '',
				options,
				onChange: handleTargetFileChange
			});
		};

		updateOptions();

		const interval = setInterval(updateOptions, 2000);
		return () => clearInterval(interval);
	}, [availableFiles, createBibFile, registerProperty]);

	const getAvailableFiles = useCallback(() => availableFiles, [availableFiles]);

	useEffect(() => {
		const handleBibFilesUpdate = (bibFiles: FileNode[]) => {
			setAvailableFiles(bibFiles.map(file => ({
				path: file.path,
				name: file.name,
				id: file.id
			})));
		};

		filePathCacheService.onBibliographyFilesUpdate(handleBibFilesUpdate);

		return () => {
			filePathCacheService.offBibliographyFilesUpdate(handleBibFilesUpdate);
		};
	}, []);

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