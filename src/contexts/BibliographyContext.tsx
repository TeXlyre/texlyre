// src/contexts/BibliographyContext.tsx
import { t } from '@/i18n';
import type React from 'react';
import {
	type ReactNode,
	createContext,
	useCallback,
	useEffect,
	useState,
	useMemo,
	useRef,
} from 'react';

import { pluginRegistry } from '../plugins/PluginRegistry';
import type { BibliographyPlugin } from '../plugins/PluginInterface';
import { useSettings } from '../hooks/useSettings';
import { useProperties } from '../hooks/useProperties';
import { fileStorageService } from '../services/FileStorageService';
import { genericLSPService } from '../services/GenericLSPService';
import { bibliographyImportService } from '../services/BibliographyImportService';
import { filePathCacheService } from '../services/FilePathCacheService';
import { parseUrlFragments } from '../utils/urlUtils';
import { isBibFile } from '../utils/fileUtils';
import type { FileNode } from '../types/files';
import type { BibEntry, BibliographyFile } from '../types/bibliography';


export interface BibliographyContextType {
	showPanel: boolean;
	setShowPanel: (show: boolean) => void;
	activeTab: 'list' | 'detail';
	setActiveTab: (tab: 'list' | 'detail') => void;
	selectedProvider: string | 'all' | 'local';
	setSelectedProvider: (provider: string | 'all' | 'local') => void;
	availableProviders: BibliographyPlugin[];
	selectedItem: any;
	setSelectedItem: (item: any) => void;
	showDropdown: boolean;
	setShowDropdown: (show: boolean) => void;
	isRefreshing: boolean;
	searchQuery: string;
	setSearchQuery: (query: string) => void;

	entries: BibEntry[];
	localEntries: BibEntry[];
	externalEntries: BibEntry[];
	filteredEntries: BibEntry[];
	availableBibFiles: BibliographyFile[];
	targetBibFile: string;
	setTargetBibFile: (file: string) => void;
	isLoading: boolean;
	importingEntries: Set<string>;

	currentProvider: BibliographyPlugin | undefined;

	citationStyle: string;
	maxCompletions: number;
	autoImport: boolean;
	duplicateHandling: string;

	handleRefresh: () => Promise<void>;
	handleProviderSelect: (providerId: string | 'all' | 'local') => void;
	handleItemSelect: (item: any) => void;
	handleBackToList: () => void;
	handleEntryClick: (entry: BibEntry) => void;
	handleImportEntry: (entry: BibEntry) => Promise<void>;
	handleTargetFileChange: (newValue: string) => Promise<void>;
	createNewBibFile: (fileName?: string) => Promise<string | null>;
	setSelectedBibFileFromEditor: (filePath: string) => void;
	handleDeleteEntry: (entry: BibEntry) => Promise<void>;
	handleUpdateEntry: (entry: BibEntry, remoteEntry: BibEntry) => Promise<void>;

	getConnectionStatus: () => string;
	getStatusColor: () => string;

	getTargetFile: (pluginId: string, projectId?: string) => string | null;
	setTargetFile: (pluginId: string, filePath: string, projectId?: string) => void;
	getAvailableFiles: () => BibliographyFile[];
	refreshAvailableFiles: () => Promise<void>;
	getLocalEntries: () => Promise<BibEntry[]>;
	isImporting: (entryKey: string) => boolean;
}

export const BibliographyContext = createContext<BibliographyContextType | null>(null);

interface BibliographyProviderProps {
	children: ReactNode;
}

export const BibliographyProvider: React.FC<BibliographyProviderProps> = ({ children }) => {
	const { getSetting } = useSettings();
	const { getProperty, setProperty } = useProperties();

	const [showPanel, setShowPanel] = useState(false);
	const [activeTab, setActiveTab] = useState<'list' | 'detail'>('list');
	const [selectedProvider, setSelectedProvider] = useState<string | 'all' | 'local'>('local');
	const [availableProviders, setAvailableProviders] = useState<BibliographyPlugin[]>([]);
	const [selectedItem, setSelectedItem] = useState<any>(null);
	const [showDropdown, setShowDropdown] = useState(false);
	const [isRefreshing, setIsRefreshing] = useState(false);
	const [searchQuery, setSearchQuery] = useState('');

	const [entries, setEntries] = useState<BibEntry[]>([]);
	const [localEntries, setLocalEntries] = useState<BibEntry[]>([]);
	const [externalEntries, setExternalEntries] = useState<BibEntry[]>([]);
	const [filteredEntries, setFilteredEntries] = useState<BibEntry[]>([]);
	const [availableBibFiles, setAvailableBibFiles] = useState<BibliographyFile[]>([]);
	const [targetBibFile, setTargetBibFile] = useState<string>('');
	const [isLoading, setIsLoading] = useState(false);
	const [importingEntries, setImportingEntries] = useState<Set<string>>(new Set());
	const [selectedBibFile, setSelectedBibFile] = useState<string>('');

	const currentProvider = availableProviders.find(p => p.id === selectedProvider);

	const getProviderSetting = (settingName: string) => {
		if (!currentProvider) return undefined;
		return getSetting(`${currentProvider.id}-${settingName}`)?.value;
	};

	const citationStyle = (getProviderSetting('citation-style') as string) ?? 'numeric';
	const maxCompletions = (getProviderSetting('max-completions') as number) ?? 20;
	const autoImport = (getProviderSetting('auto-import') as boolean) ?? true;
	const duplicateHandling = (getProviderSetting('merge-duplicates') as string) ?? 'keep-local';

	const parser = bibliographyImportService.getParser();

	const getProjectId = (): string | undefined => {
		const currentFragment = parseUrlFragments(window.location.hash.substring(1));
		return currentFragment.yjsUrl ? currentFragment.yjsUrl.slice(4) : undefined;
	};

	const getPropertyId = (pluginId: string) => `${pluginId}-target-bib-file`;

	const getTargetFile = useCallback((pluginId: string, projectId?: string): string | null => {
		console.log('[BibliographyContext] getTargetFile called', {
			pluginId,
			projectId,
			selectedBibFile,
			availableBibFilesCount: availableBibFiles.length
		});

		if (selectedBibFile) {
			console.log('[BibliographyContext] Using selected bib file:', selectedBibFile);
			return selectedBibFile;
		}

		const propertyId = getPropertyId(pluginId);
		const scopeOptions = projectId ? { scope: 'project' as const, projectId } : { scope: 'global' as const };
		const val = getProperty(propertyId, scopeOptions) as string | null;

		console.log('[BibliographyContext] Property value:', val);

		if (!val) {
			if (availableBibFiles.length > 0) {
				console.log('[BibliographyContext] No saved target, but files available:', availableBibFiles.map(f => f.path));
			}
			return null;
		}

		if (availableBibFiles.length > 0 && !availableBibFiles.some(f => f.path === val)) {
			console.log('[BibliographyContext] Saved target not found in available files, clearing');
			setProperty(propertyId, '', scopeOptions);
			return null;
		}

		console.log('[BibliographyContext] Returning saved target:', val);
		return val;
	}, [getProperty, setProperty, availableBibFiles, selectedBibFile]);

	const setTargetFileProperty = useCallback((pluginId: string, filePath: string, projectId?: string) => {
		const propertyId = getPropertyId(pluginId);
		const scopeOptions = projectId ? { scope: 'project' as const, projectId } : { scope: 'global' as const };
		setProperty(propertyId, filePath, scopeOptions);
	}, [setProperty]);

	const getAvailableFiles = useCallback(() => availableBibFiles, [availableBibFiles]);

	const refreshAvailableFiles = useCallback(async () => {
		try {
			const allFiles = await fileStorageService.getAllFiles();
			const bibFiles = allFiles.filter(file => isBibFile(file.name) && !file.isDeleted);
			setAvailableBibFiles(bibFiles.map(file => ({ path: file.path, name: file.name, id: file.id })));
		} catch (error) {
			console.error('[BibliographyContext] Error refreshing available files:', error);
			setAvailableBibFiles([]);
		}
	}, []);

	const createNewBibFile = useCallback(async (fileName: string = 'bibliography.bib'): Promise<string | null> => {
		try {
			const filePath = `/${fileName}`;
			const existingFile = await fileStorageService.getFileByPath(filePath);
			if (existingFile && !existingFile.isDeleted) return filePath;

			const fileNode = {
				id: crypto.randomUUID(),
				name: fileName,
				path: filePath,
				type: 'file' as const,
				content: '% Bibliography file created by TeXlyre\n\n',
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
			console.error('[BibliographyContext] Error creating bib file:', error);
			return null;
		}
	}, [refreshAvailableFiles]);

	const getLocalEntriesAsync = useCallback(async (): Promise<BibEntry[]> => {
		try {
			const allFiles = await fileStorageService.getAllFiles();
			const bibFiles = allFiles.filter(file => isBibFile(file.name) && !file.isDeleted && file.content);
			const result: BibEntry[] = [];

			for (const bibFile of bibFiles) {
				try {
					const content = typeof bibFile.content === 'string'
						? bibFile.content
						: new TextDecoder().decode(bibFile.content);
					const parsed = parser.parse(content);
					result.push(...parsed.map(entry => ({
						key: entry.key,
						entryType: entry.entryType,
						fields: entry.fields,
						rawEntry: entry.rawEntry,
						source: 'local' as const,
						filePath: bibFile.path
					})));
				} catch (parseError) {
					console.error(`[BibliographyContext] Error parsing ${bibFile.path}:`, parseError);
				}
			}
			return result;
		} catch (error) {
			console.error('[BibliographyContext] Error getting local entries:', error);
			return [];
		}
	}, [parser]);

	const isImportingEntry = useCallback((entryKey: string): boolean => {
		return importingEntries.has(entryKey);
	}, [importingEntries]);

	const setSelectedBibFileFromEditor = useCallback((filePath: string) => {
		setSelectedBibFile(filePath);
	}, []);

	const handleDeleteEntry = useCallback(async (entry: BibEntry) => {
		if (entry.source !== 'local' || !entry.filePath) return;

		try {
			const targetFile = await fileStorageService.getFileByPath(entry.filePath);
			if (!targetFile) return;

			let currentContent = '';
			if (targetFile.content) {
				currentContent = typeof targetFile.content === 'string'
					? targetFile.content
					: new TextDecoder().decode(targetFile.content);
			}

			const position = parser.findEntryPosition(currentContent, entry);
			if (!position) return;

			const newContent = currentContent.substring(0, position.start) +
				currentContent.substring(position.end);

			await fileStorageService.updateFileContent(targetFile.id, newContent);
			await fetchLocalEntries();
			document.dispatchEvent(new CustomEvent('refresh-file-tree'));
		} catch (error) {
			console.error('[BibliographyContext] Error deleting entry:', error);
		}
	}, [parser]);

	const handleUpdateEntry = useCallback(async (entry: BibEntry, remoteEntry: BibEntry) => {
		if (!entry.filePath) return;

		try {
			const targetFile = await fileStorageService.getFileByPath(entry.filePath);
			if (!targetFile) return;

			let currentContent = '';
			if (targetFile.content) {
				currentContent = typeof targetFile.content === 'string'
					? targetFile.content
					: new TextDecoder().decode(targetFile.content);
			}

			const newContent = parser.updateEntryInContent(currentContent, {
				...entry,
				fields: remoteEntry.fields,
				rawEntry: remoteEntry.rawEntry,
				remoteId: remoteEntry.remoteId
			});

			await fileStorageService.updateFileContent(targetFile.id, newContent);
			await fetchLocalEntries();
			document.dispatchEvent(new CustomEvent('refresh-file-tree'));
		} catch (error) {
			console.error('[BibliographyContext] Error updating entry:', error);
		}
	}, [parser]);

	useEffect(() => {
		const providers = pluginRegistry.getAllBibliographyPlugins();
		setAvailableProviders(providers);
	}, []);

	useEffect(() => {
		const handleTogglePanel = (event: Event) => {
			const { show, pluginId } = (event as CustomEvent).detail;
			setShowPanel(show);
			if (show && pluginId) setSelectedProvider(pluginId);
		};
		document.addEventListener('toggle-bibliography-panel', handleTogglePanel);
		document.addEventListener('toggle-lsp-panel', handleTogglePanel);
		return () => {
			document.removeEventListener('toggle-bibliography-panel', handleTogglePanel);
			document.removeEventListener('toggle-lsp-panel', handleTogglePanel);
		};
	}, []);

	useEffect(() => {
		const handleBibFileOpened = (event: Event) => {
			const { filePath } = (event as CustomEvent).detail;
			setSelectedBibFileFromEditor(filePath);
		};

		document.addEventListener('bib-file-opened', handleBibFileOpened);
		return () => {
			document.removeEventListener('bib-file-opened', handleBibFileOpened);
		};
	}, [setSelectedBibFileFromEditor]);

	useEffect(() => {
		if (availableProviders.length === 0) return;
		availableProviders.forEach(provider => {
			const enabledSetting = getSetting(`${provider.id}-enabled`);
			const isEnabled = (enabledSetting?.value as boolean) ?? true;
			const serverUrlSetting = getSetting(`${provider.id}-server-url`);
			const url = (serverUrlSetting?.value as string) || '';

			if (!isEnabled) {
				genericLSPService.updateConfig(provider.id, { enabled: false });
			}
			if (url && provider.updateServerUrl) {
				provider.updateServerUrl(url);
			}

			const currentStatus = genericLSPService.getConnectionStatus(provider.id);
			if (isEnabled && currentStatus === 'disconnected') {
				genericLSPService.updateConfig(provider.id, { enabled: true });
			} else if (!isEnabled && currentStatus !== 'disconnected') {
				genericLSPService.updateConfig(provider.id, { enabled: false });
			}
		});
	}, [availableProviders, getSetting]);

	useEffect(() => {
		const unsubscribe = genericLSPService.onStatusChange((configId, _status) => {
			if (configId === selectedProvider || selectedProvider === 'all') {
				setAvailableProviders([...pluginRegistry.getAllBibliographyPlugins()]);
			}
		});
		return unsubscribe;
	}, [selectedProvider]);

	const fetchLocalEntries = useCallback(async () => {
		const result = await getLocalEntriesAsync();
		setLocalEntries(result);
	}, [getLocalEntriesAsync]);

	const fetchExternalEntries = useCallback(async () => {
		if (!currentProvider || selectedProvider === 'local') {
			setExternalEntries([]);
			return;
		}
		if (currentProvider.getConnectionStatus() !== 'connected') {
			setExternalEntries([]);
			return;
		}
		setIsLoading(true);
		try {
			const bibEntries = await currentProvider.getBibliographyEntries();
			setExternalEntries(bibEntries.map((entry: any) => ({
				...entry,
				source: 'external' as const,
				isImported: false
			})));
		} catch (error) {
			console.error(`[BibliographyContext] Error fetching external entries:`, error);
			setExternalEntries([]);
		} finally {
			setIsLoading(false);
		}
	}, [currentProvider, selectedProvider]);

	const fetchAllEntries = useCallback(async () => {
		if (selectedProvider !== 'all') return;
		const providers = availableProviders.filter(p =>
			p.getConnectionStatus() === 'connected'
		);
		if (providers.length === 0) { setExternalEntries([]); return; }

		setIsLoading(true);
		try {
			const allExternal: BibEntry[] = [];
			for (const provider of providers) {
				try {
					const bibEntries = await provider.getBibliographyEntries();
					allExternal.push(...bibEntries.map((entry: any) => ({
						...entry,
						source: 'external' as const,
						isImported: false,
						providerId: provider.id,
						providerName: provider.name
					})));
				} catch (error) {
					console.error(`[BibliographyContext] Error from ${provider.name}:`, error);
				}
			}
			setExternalEntries(allExternal);
		} finally {
			setIsLoading(false);
		}
	}, [availableProviders, selectedProvider]);

	const mergeEntries = useCallback(() => {
		if (selectedProvider === 'local') {
			setEntries(localEntries);
		} else {
			const localKeys = new Set(localEntries.map(e => e.key));
			const updated = externalEntries.map(e => ({ ...e, isImported: localKeys.has(e.key) }));
			if (selectedProvider === 'all') {
				setEntries([...localEntries, ...updated]);
			} else {
				setEntries([...localEntries, ...updated.filter(e => !e.isImported)]);
			}
		}
	}, [selectedProvider, localEntries, externalEntries]);

	useEffect(() => { mergeEntries(); }, [mergeEntries]);

	useEffect(() => {
		if (searchQuery.trim() === '') {
			setFilteredEntries(entries.slice(0, maxCompletions));
		} else {
			const q = searchQuery.toLowerCase();
			setFilteredEntries(entries.filter(entry =>
				entry.key.toLowerCase().includes(q) ||
				entry.entryType.toLowerCase().includes(q) ||
				Object.values(entry.fields).some(v => v.toLowerCase().includes(q))
			).slice(0, maxCompletions));
		}
	}, [searchQuery, entries, maxCompletions]);

	useEffect(() => {
		const handleBibFilesUpdate = (bibFiles: FileNode[]) => {
			setAvailableBibFiles(bibFiles.map(f => ({ path: f.path, name: f.name, id: f.id })));
		};
		filePathCacheService.onBibliographyFilesUpdate(handleBibFilesUpdate);
		return () => { filePathCacheService.offBibliographyFilesUpdate(handleBibFilesUpdate); };
	}, []);

	useEffect(() => {
		console.log('[BibliographyContext] Target file effect', {
			currentProvider: currentProvider?.id,
			availableBibFilesCount: availableBibFiles.length,
			selectedProvider
		});

		if (!currentProvider || availableBibFiles.length === 0) return;

		const projectId = getProjectId();
		const saved = getTargetFile(currentProvider.id, projectId);

		console.log('[BibliographyContext] Target file effect - saved:', saved);

		if (saved && availableBibFiles.some(f => f.path === saved)) {
			setTargetBibFile(saved);
			console.log('[BibliographyContext] Set target bib file to:', saved);
		} else if (availableBibFiles.length > 0) {
			console.log('[BibliographyContext] No saved target, available files:', availableBibFiles.map(f => f.path));
		}
	}, [currentProvider, availableBibFiles, getTargetFile]);

	useEffect(() => {
		if (selectedProvider === 'local') {
			fetchLocalEntries();
			setExternalEntries([]);
			return;
		}
		if (selectedProvider === 'all') {
			fetchLocalEntries();
			fetchAllEntries();
			return;
		}

		fetchLocalEntries();

		if (!currentProvider) return;

		if (currentProvider.getConnectionStatus() === 'connected') {
			fetchExternalEntries();
			return;
		}

		let retryCount = 0;
		const retryInterval = setInterval(() => {
			if (!currentProvider) return;
			if (currentProvider.getConnectionStatus() === 'connected') {
				fetchExternalEntries();
				clearInterval(retryInterval);
			} else if (retryCount >= 30) {
				clearInterval(retryInterval);
			}
			retryCount++;
		}, 1000);
		return () => clearInterval(retryInterval);
	}, [currentProvider, selectedProvider, availableProviders, fetchLocalEntries, fetchExternalEntries, fetchAllEntries]);

	useEffect(() => {
		const initializeFiles = async () => {
			console.log('[BibliographyContext] Initializing - forcing file refresh');
			await refreshAvailableFiles();

			console.log('[BibliographyContext] Triggering cache update');
			await filePathCacheService.updateCache();
		};

		initializeFiles();
	}, [refreshAvailableFiles]);

	const handleRefresh = async () => {
		setIsRefreshing(true);
		try {
			if (selectedProvider === 'local') {
				await fetchLocalEntries();
			} else if (selectedProvider === 'all') {
				availableProviders.forEach(p => genericLSPService.reconnect(p.id));
				await fetchLocalEntries();
				await fetchAllEntries();
			} else if (currentProvider) {
				genericLSPService.reconnect(currentProvider.id);
				await fetchLocalEntries();
				await fetchExternalEntries();
			}
		} finally {
			setIsRefreshing(false);
		}
	};

	const handleProviderSelect = (providerId: string | 'all' | 'local') => {
		setSelectedProvider(providerId);
		setShowDropdown(false);
		setActiveTab('list');
		setSelectedItem(null);
		setSearchQuery('');
		setEntries([]);
		setLocalEntries([]);
		setExternalEntries([]);
		setFilteredEntries([]);
		if (providerId !== 'local') setTargetBibFile('');
	};

	const handleItemSelect = (item: any) => {
		setSelectedItem(item);
		setActiveTab('detail');
	};

	const handleBackToList = () => {
		setActiveTab('list');
		setSelectedItem(null);
	};

	const handleEntryClick = (entry: BibEntry) => {
		if (entry.source === 'external' && !entry.isImported) {
			if (autoImport) { handleImportEntry(entry); }
			return;
		}
		handleItemSelect({
			key: entry.key,
			entryType: entry.entryType,
			fields: entry.fields,
			rawEntry: entry.rawEntry,
			title: entry.fields.title || '',
			authors: entry.fields.author ? [entry.fields.author] : [],
			year: entry.fields.year || '',
			journal: entry.fields.journal || entry.fields.booktitle || '',
		});
		if (currentProvider) {
			document.dispatchEvent(new CustomEvent(`${currentProvider.id}-citation-selected`, {
				detail: { citationKey: entry.key }
			}));
		}
	};

	const handleImportEntry = async (entry: BibEntry) => {
		if (!targetBibFile || !currentProvider || importingEntries.has(entry.key)) return;
		setImportingEntries(prev => new Set(prev).add(entry.key));
		try {
			const targetFile = await fileStorageService.getFileByPath(targetBibFile);
			if (!targetFile) return;
			if (duplicateHandling === 'keep-local' && localEntries.some(l => l.key === entry.key && l.filePath === targetBibFile)) return;

			let currentContent = '';
			if (targetFile.content) {
				currentContent = typeof targetFile.content === 'string' ? targetFile.content : new TextDecoder().decode(targetFile.content);
			}
			const newContent = currentContent.trim() ? `${currentContent.trim()}\n\n${entry.rawEntry}\n` : `${entry.rawEntry}\n`;
			await fileStorageService.updateFileContent(targetFile.id, newContent);
			await fetchLocalEntries();
			document.dispatchEvent(new CustomEvent('refresh-file-tree'));
		} catch (error) {
			console.error('[BibliographyContext] Error importing entry:', error);
		} finally {
			setImportingEntries(prev => { const s = new Set(prev); s.delete(entry.key); return s; });
		}
	};

	const handleTargetFileChange = async (newValue: string) => {
		if (newValue === 'CREATE_NEW') {
			const created = await createNewBibFile();
			if (created) {
				setTargetBibFile(created);
				if (currentProvider) setTargetFileProperty(currentProvider.id, created, getProjectId());
				document.dispatchEvent(new CustomEvent('refresh-file-tree'));
			}
		} else {
			setTargetBibFile(newValue);
			if (currentProvider) setTargetFileProperty(currentProvider.id, newValue, getProjectId());
		}
	};

	const getConnectionStatus = () => {
		if (selectedProvider === 'local') return 'connected';
		if (selectedProvider === 'all') {
			const connected = availableProviders.filter(p => p.getConnectionStatus() === 'connected').length;
			if (availableProviders.length === 0) return 'disconnected';
			if (connected === availableProviders.length) return 'connected';
			if (connected > 0) return 'connecting';
			return 'disconnected';
		}
		return currentProvider?.getConnectionStatus() || 'disconnected';
	};

	const getStatusColor = () => {
		const status = getConnectionStatus();
		switch (status) {
			case 'connected': return '#28a745';
			case 'connecting': return '#ffc107';
			case 'error': return '#dc3545';
			default: return '#666';
		}
	};

	const contextValue: BibliographyContextType = {
		showPanel, setShowPanel, activeTab, setActiveTab,
		selectedProvider, setSelectedProvider, availableProviders,
		selectedItem, setSelectedItem, showDropdown, setShowDropdown,
		isRefreshing, searchQuery, setSearchQuery,
		entries, localEntries, externalEntries, filteredEntries,
		availableBibFiles, targetBibFile, setTargetBibFile,
		isLoading, importingEntries, currentProvider,
		citationStyle, maxCompletions, autoImport, duplicateHandling,
		handleRefresh, handleProviderSelect, handleItemSelect,
		handleBackToList, handleEntryClick, handleImportEntry,
		handleTargetFileChange, createNewBibFile,
		getConnectionStatus, getStatusColor,
		getTargetFile, setTargetFile: setTargetFileProperty,
		getAvailableFiles, refreshAvailableFiles,
		getLocalEntries: getLocalEntriesAsync,
		isImporting: isImportingEntry,
		setSelectedBibFileFromEditor,
		handleDeleteEntry,
		handleUpdateEntry,
	};

	return (
		<BibliographyContext.Provider value={contextValue}>
			{children}
		</BibliographyContext.Provider>
	);
};