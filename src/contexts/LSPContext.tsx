// src/contexts/LSPContext.tsx
import type React from 'react';
import {
	type ReactNode,
	createContext,
	useCallback,
	useEffect,
	useState,
	useMemo,
} from 'react';

import { pluginRegistry } from '../plugins/PluginRegistry';
import type { LSPPlugin } from '../plugins/PluginInterface';
import { useSettings } from '../hooks/useSettings';
import { useBibliography } from '../hooks/useBibliography';
import { fileStorageService } from '../services/FileStorageService';
import { genericLSPService } from '../services/GenericLSPService';
import { bibliographyImportService } from '../services/BibliographyImportService';
import { parseUrlFragments } from '../utils/urlUtils';
import { isBibFile } from '../utils/fileUtils';
import { filePathCacheService } from '../services/FilePathCacheService';
import type { FileNode } from '../types/files';

interface BibEntry {
	key: string;
	entryType: string;
	fields: Record<string, string>;
	rawEntry: string;
	source?: 'local' | 'external';
	isImported?: boolean;
	filePath?: string;
	providerId?: string;
	providerName?: string;
}

interface BibFile {
	path: string;
	name: string;
	id: string;
}

interface LSPContextType {
	showPanel: boolean;
	setShowPanel: (show: boolean) => void;
	activeTab: 'list' | 'detail';
	setActiveTab: (tab: 'list' | 'detail') => void;
	selectedProvider: string | 'all' | 'local';
	setSelectedProvider: (provider: string | 'all' | 'local') => void;
	availableProviders: LSPPlugin[];
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
	availableBibFiles: BibFile[];
	targetBibFile: string;
	setTargetBibFile: (file: string) => void;
	isLoading: boolean;
	importingEntries: Set<string>;

	currentProvider: LSPPlugin | undefined;
	isBibliographyProvider: boolean;

	citationStyle: string;
	maxCompletions: number;
	autoImport: boolean;
	duplicateHandling: string;
	serverUrl: string;

	handleRefresh: () => Promise<void>;
	handleProviderSelect: (providerId: string | 'all' | 'local') => void;
	handleItemSelect: (item: any) => void;
	handleBackToList: () => void;
	handleEntryClick: (entry: BibEntry) => void;
	handleImportEntry: (entry: BibEntry) => Promise<void>;
	handleTargetFileChange: (newValue: string) => Promise<void>;
	createNewBibFile: (fileName?: string) => Promise<string | null>;

	getConnectionStatus: () => string;
	getStatusColor: () => string;
}

export const LSPContext = createContext<LSPContextType | null>(null);

interface LSPProviderProps {
	children: ReactNode;
}

export const LSPProvider: React.FC<LSPProviderProps> = ({ children }) => {
	const { getSetting } = useSettings();
	const { getTargetFile, setTargetFile, getAvailableFiles, createBibFile } = useBibliography();

	const [showPanel, setShowPanel] = useState(false);
	const [activeTab, setActiveTab] = useState<'list' | 'detail'>('list');
	const [selectedProvider, setSelectedProvider] = useState<string | 'all' | 'local'>('local');
	const [availableProviders, setAvailableProviders] = useState<LSPPlugin[]>([]);
	const [selectedItem, setSelectedItem] = useState<any>(null);
	const [showDropdown, setShowDropdown] = useState(false);
	const [isRefreshing, setIsRefreshing] = useState(false);
	const [searchQuery, setSearchQuery] = useState('');

	const [entries, setEntries] = useState<BibEntry[]>([]);
	const [localEntries, setLocalEntries] = useState<BibEntry[]>([]);
	const [externalEntries, setExternalEntries] = useState<BibEntry[]>([]);
	const [filteredEntries, setFilteredEntries] = useState<BibEntry[]>([]);
	const [availableBibFiles, setAvailableBibFiles] = useState<BibFile[]>([]);
	const [targetBibFile, setTargetBibFile] = useState<string>('');
	const [isLoading, setIsLoading] = useState(false);
	const [importingEntries, setImportingEntries] = useState<Set<string>>(new Set());

	const currentProvider = availableProviders.find(p => p.id === selectedProvider);

	const isBibliographyProvider = useMemo(() => {
		if (selectedProvider === 'all') {
			return availableProviders.some(provider => provider.getBibliographyEntries !== undefined);
		}
		if (selectedProvider === 'local') {
			return true;
		}
		return currentProvider?.getBibliographyEntries !== undefined;
	}, [selectedProvider, currentProvider, availableProviders]);

	const getProviderSetting = (settingName: string) => {
		if (!currentProvider) return undefined;
		return getSetting(`${currentProvider.id}-${settingName}`)?.value;
	};

	const citationStyle = (getProviderSetting('citation-style') as string) ?? 'numeric';
	const maxCompletions = (getProviderSetting('max-completions') as number) ?? 20;
	const autoImport = (getProviderSetting('auto-import') as boolean) ?? true;
	const duplicateHandling = (getProviderSetting('merge-duplicates') as string) ?? 'keep-local';
	const serverUrl = (getProviderSetting('server-url') as string) ?? 'ws://localhost:2087/';

	const parser = bibliographyImportService.getParser();

	const getProjectId = (): string | undefined => {
		const currentFragment = parseUrlFragments(window.location.hash.substring(1));
		return currentFragment.yjsUrl ? currentFragment.yjsUrl.slice(4) : undefined;
	};

	useEffect(() => {
		const providers = pluginRegistry.getAllLSPPlugins();
		setAvailableProviders(providers);
	}, []);

	useEffect(() => {
		const handleToggleLSPPanel = (event: Event) => {
			const customEvent = event as CustomEvent;
			const { show, pluginId } = customEvent.detail;

			setShowPanel(show);
			if (show && pluginId) {
				setSelectedProvider(pluginId);
			}
		};

		document.addEventListener('toggle-lsp-panel', handleToggleLSPPanel);
		return () => {
			document.removeEventListener('toggle-lsp-panel', handleToggleLSPPanel);
		};
	}, []);

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
	}, [availableProviders]);

	useEffect(() => {
		const unsubscribe = genericLSPService.onStatusChange((configId, status) => {
			if (configId === selectedProvider || selectedProvider === 'all') {
				setAvailableProviders([...pluginRegistry.getAllLSPPlugins()]);
			}
		});
		return unsubscribe;
	}, [selectedProvider]);

	const fetchLocalEntries = useCallback(async () => {
		try {
			const allFiles = await fileStorageService.getAllFiles();
			const bibFiles = allFiles.filter(file =>
				isBibFile(file.name) &&
				!file.isDeleted &&
				file.content
			);

			const allLocalEntries: BibEntry[] = [];

			for (const bibFile of bibFiles) {
				try {
					const content = typeof bibFile.content === 'string'
						? bibFile.content
						: new TextDecoder().decode(bibFile.content);

					const parsedEntries = parser.parse(content);
					const bibEntries: BibEntry[] = parsedEntries.map(entry => ({
						key: entry.key,
						entryType: entry.type,
						fields: entry.fields,
						rawEntry: entry.rawEntry,
						source: 'local' as const,
						filePath: bibFile.path
					}));

					allLocalEntries.push(...bibEntries);
				} catch (parseError) {
					console.error(`[LSPContext] Error parsing ${bibFile.path}:`, parseError);
				}
			}

			setLocalEntries(allLocalEntries);
		} catch (error) {
			console.error('[LSPContext] Error fetching local entries:', error);
			setLocalEntries([]);
		}
	}, [parser]);

	const fetchExternalEntries = useCallback(async () => {
		if (!currentProvider?.getBibliographyEntries || selectedProvider === 'local') {
			setExternalEntries([]);
			return;
		}

		const connectionStatus = currentProvider.getConnectionStatus();
		if (connectionStatus !== 'connected') {
			setExternalEntries([]);
			return;
		}

		setIsLoading(true);
		try {
			const bibEntries = await currentProvider.getBibliographyEntries();
			const externalBibEntries: BibEntry[] = bibEntries.map((entry: any) => ({
				...entry,
				source: 'external' as const,
				isImported: false
			}));
			setExternalEntries(externalBibEntries);
		} catch (error) {
			console.error(`[LSPContext] Error fetching external entries from ${currentProvider.name}:`, error);
			setExternalEntries([]);
		} finally {
			setIsLoading(false);
		}
	}, [currentProvider, selectedProvider]);

	const fetchAllBibliographyEntries = useCallback(async () => {
		if (selectedProvider !== 'all') return;

		const bibliographyProviders = availableProviders.filter(provider =>
			provider.getBibliographyEntries !== undefined && provider.getConnectionStatus() === 'connected'
		);

		if (bibliographyProviders.length === 0) {
			setExternalEntries([]);
			return;
		}

		setIsLoading(true);
		try {
			const allExternalEntries: BibEntry[] = [];

			for (const provider of bibliographyProviders) {
				try {
					const bibEntries = await provider.getBibliographyEntries!();
					const providerEntries: BibEntry[] = bibEntries.map((entry: any) => ({
						...entry,
						source: 'external' as const,
						isImported: false,
						providerId: provider.id,
						providerName: provider.name
					}));
					allExternalEntries.push(...providerEntries);
				} catch (error) {
					console.error(`[LSPContext] Error fetching entries from ${provider.name}:`, error);
				}
			}

			setExternalEntries(allExternalEntries);
		} catch (error) {
			console.error('[LSPContext] Error fetching entries from all bibliography providers:', error);
			setExternalEntries([]);
		} finally {
			setIsLoading(false);
		}
	}, [availableProviders, selectedProvider]);

	const createNewBibFile = useCallback(async (fileName: string = 'bibliography.bib'): Promise<string | null> => {
		return await createBibFile(fileName);
	}, [createBibFile]);

	const mergeEntries = useCallback(() => {
		if (selectedProvider === 'local') {
			setEntries(localEntries);
		} else if (selectedProvider === 'all') {
			const localKeys = new Set(localEntries.map(entry => entry.key));

			const updatedExternalEntries = externalEntries.map(entry => ({
				...entry,
				isImported: localKeys.has(entry.key)
			}));

			const combined = [
				...localEntries,
				...updatedExternalEntries
			];

			setEntries(combined);
		} else {
			const localKeys = new Set(localEntries.map(entry => entry.key));

			const updatedExternalEntries = externalEntries.map(entry => ({
				...entry,
				isImported: localKeys.has(entry.key)
			}));

			const combined = [
				...localEntries,
				...updatedExternalEntries.filter(entry => !entry.isImported)
			];

			setEntries(combined);
		}
	}, [selectedProvider, localEntries, externalEntries]);

	useEffect(() => {
		if (searchQuery.trim() === '') {
			setFilteredEntries(entries.slice(0, maxCompletions));
		} else {
			const query = searchQuery.toLowerCase();
			const filtered = entries.filter(entry => {
				if (entry.key.toLowerCase().includes(query)) return true;
				if (entry.entryType.toLowerCase().includes(query)) return true;
				return Object.values(entry.fields).some(value =>
					value.toLowerCase().includes(query)
				);
			}).slice(0, maxCompletions);
			setFilteredEntries(filtered);
		}
	}, [searchQuery, entries, maxCompletions]);

	useEffect(() => {
		mergeEntries();
	}, [mergeEntries]);

	useEffect(() => {
		const handleBibFilesUpdate = (bibFiles: FileNode[]) => {
			setAvailableBibFiles(bibFiles.map(file => ({
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

	useEffect(() => {
		if (!currentProvider || availableBibFiles.length === 0) {
			return;
		}

		const projectId = getProjectId();
		const savedTargetFile = getTargetFile(currentProvider.id, projectId);
		if (savedTargetFile && availableBibFiles.some(file => file.path === savedTargetFile)) {
			setTargetBibFile(savedTargetFile);
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
			fetchAllBibliographyEntries();
			return;
		}

		if (!currentProvider?.getBibliographyEntries) {
			return;
		}

		fetchLocalEntries();
		fetchExternalEntries();

		let retryCount = 0;
		const maxRetries = 30;

		const retryInterval = setInterval(() => {
			if (!currentProvider) return;

			const connectionStatus = currentProvider.getConnectionStatus();

			if (connectionStatus === 'connected') {
				fetchExternalEntries();
				clearInterval(retryInterval);
			} else if (retryCount >= maxRetries) {
				clearInterval(retryInterval);
			}
			retryCount++;
		}, 1000);

		return () => clearInterval(retryInterval);
	}, [currentProvider, selectedProvider, availableProviders, fetchLocalEntries, fetchExternalEntries, fetchAllBibliographyEntries]);

	const handleRefresh = async () => {
		setIsRefreshing(true);

		try {
			if (selectedProvider === 'local') {
				await fetchLocalEntries();
			} else if (selectedProvider === 'all') {
				availableProviders.forEach(provider => {
					genericLSPService.reconnect(provider.id);
				});
				await fetchLocalEntries();
				await fetchAllBibliographyEntries();
			} else if (currentProvider) {
				genericLSPService.reconnect(currentProvider.id);
				await fetchLocalEntries();
				await fetchExternalEntries();
			}
		} catch (error) {
			console.error('Error refreshing LSP provider:', error);
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

		if (providerId !== 'local') {
			setTargetBibFile('');
		}
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
			if (autoImport) {
				handleImportEntry(entry);
			}
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
			document.dispatchEvent(
				new CustomEvent(`${currentProvider.id}-citation-selected`, {
					detail: { citationKey: entry.key }
				})
			);
		}
	};

	const handleImportEntry = async (entry: BibEntry) => {
		if (!targetBibFile || !currentProvider) {
			console.error('[LSPContext] No target file or provider selected');
			return;
		}

		if (importingEntries.has(entry.key)) {
			return;
		}

		setImportingEntries(prev => new Set(prev).add(entry.key));

		try {
			const targetFile = await fileStorageService.getFileByPath(targetBibFile);
			if (!targetFile) {
				console.error('[LSPContext] Target file not found:', targetBibFile);
				return;
			}

			if (duplicateHandling === 'keep-local') {
				const isDuplicate = localEntries.some(local =>
					local.key === entry.key && local.filePath === targetBibFile
				);
				if (isDuplicate) {
					return;
				}
			}

			let currentContent = '';
			if (targetFile.content) {
				currentContent = typeof targetFile.content === 'string'
					? targetFile.content
					: new TextDecoder().decode(targetFile.content);
			}

			const newContent = currentContent.trim()
				? `${currentContent.trim()}\n\n${entry.rawEntry}\n`
				: `${entry.rawEntry}\n`;

			await fileStorageService.updateFileContent(targetFile.id, newContent);
			await fetchLocalEntries();
			document.dispatchEvent(new CustomEvent('refresh-file-tree'));
		} catch (error) {
			console.error('[LSPContext] Error importing entry:', error);
		} finally {
			setImportingEntries(prev => {
				const newSet = new Set(prev);
				newSet.delete(entry.key);
				return newSet;
			});
		}
	};

	const handleTargetFileChange = async (newValue: string) => {
		if (newValue === 'CREATE_NEW') {
			const createdFile = await createNewBibFile();
			if (createdFile) {
				setTargetBibFile(createdFile);
				if (currentProvider) {
					const projectId = getProjectId();
					setTargetFile(currentProvider.id, createdFile, projectId);
				}
				document.dispatchEvent(new CustomEvent('refresh-file-tree'));
			}
		} else {
			setTargetBibFile(newValue);
			if (currentProvider) {
				const projectId = getProjectId();
				setTargetFile(currentProvider.id, newValue, projectId);
			}
		}
	};

	const getConnectionStatus = () => {
		if (selectedProvider === 'local') {
			return 'connected';
		}
		if (selectedProvider === 'all') {
			const connectedCount = availableProviders.filter(p =>
				p.getConnectionStatus() === 'connected'
			).length;

			if (availableProviders.length === 0) return 'disconnected';
			if (connectedCount === availableProviders.length) return 'connected';
			if (connectedCount > 0) return 'connecting';
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

	const contextValue: LSPContextType = {
		showPanel,
		setShowPanel,
		activeTab,
		setActiveTab,
		selectedProvider,
		setSelectedProvider,
		availableProviders,
		selectedItem,
		setSelectedItem,
		showDropdown,
		setShowDropdown,
		isRefreshing,
		searchQuery,
		setSearchQuery,

		entries,
		localEntries,
		externalEntries,
		filteredEntries,
		availableBibFiles,
		targetBibFile,
		setTargetBibFile,
		isLoading,
		importingEntries,

		currentProvider,
		isBibliographyProvider,

		citationStyle,
		maxCompletions,
		autoImport,
		duplicateHandling,
		serverUrl,

		handleRefresh,
		handleProviderSelect,
		handleItemSelect,
		handleBackToList,
		handleEntryClick,
		handleImportEntry,
		handleTargetFileChange,
		createNewBibFile,

		getConnectionStatus,
		getStatusColor,
	};

	return (
		<LSPContext.Provider value={contextValue}>
			{children}
		</LSPContext.Provider>
	);
};