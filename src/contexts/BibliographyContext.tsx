// src/contexts/BibliographyContext.tsx
import type React from 'react';
import {
	type ReactNode,
	createContext,
	useCallback,
	useEffect,
	useRef,
	useState,
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

export type SortField = 'key' | 'title' | 'author' | 'year';
export type SortOrder = 'asc' | 'desc';
export type EntryTypeFilter = 'all' | 'article' | 'book' | 'inproceedings' | 'phdthesis' | 'techreport' | 'misc' | 'online';
export type SourceFilter = 'all' | 'local' | 'external' | 'synced' | 'synced-external';

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

	showToolbar: boolean;
	setShowToolbar: (show: boolean) => void;
	sortField: SortField;
	setSortField: (field: SortField) => void;
	sortOrder: SortOrder;
	setSortOrder: (order: SortOrder) => void;
	entryTypeFilter: EntryTypeFilter;
	setEntryTypeFilter: (filter: EntryTypeFilter) => void;
	sourceFilter: SourceFilter;
	setSourceFilter: (filter: SourceFilter) => void;
	selectedCollection: string;
	setSelectedCollection: (collection: string) => void;
	availableCollections: string[];

	isMultiSelectMode: boolean;
	setIsMultiSelectMode: (active: boolean) => void;
	selectedEntryKeys: Set<string>;
	toggleEntrySelection: (key: string) => void;
	selectAllVisible: () => void;
	clearSelection: () => void;

	importSelectedEntries: () => Promise<void>;
	updateSelectedEntries: () => Promise<void>;
	deleteSelectedEntries: () => Promise<void>;
	isBulkOperating: boolean;

	triggerSearch: () => void;

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

	importAllExternal: () => Promise<void>;
	updateAllLocal: () => Promise<void>;
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

	const [showToolbar, setShowToolbar] = useState(false);
	const [sortField, setSortField] = useState<SortField>('key');
	const [sortOrder, setSortOrder] = useState<SortOrder>('asc');
	const [entryTypeFilter, setEntryTypeFilter] = useState<EntryTypeFilter>('all');
	const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
	const [selectedCollection, setSelectedCollection] = useState<string>('all');
	const [availableCollections, setAvailableCollections] = useState<string[]>([]);

	const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
	const [selectedEntryKeys, setSelectedEntryKeys] = useState<Set<string>>(new Set());
	const [isBulkOperating, setIsBulkOperating] = useState(false);

	const currentProvider = availableProviders.find(p => p.id === selectedProvider);

	// Refs allow fetchExternalEntries to read current values without being
	// listed as dependencies, preventing the connection/retry effect from
	// re-firing on every keystroke.
	const searchQueryRef = useRef(searchQuery);
	const currentProviderRef = useRef(currentProvider);
	searchQueryRef.current = searchQuery;
	currentProviderRef.current = currentProvider;

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
	const getFilterPropertyId = (pluginId: string, key: string) => `${pluginId}-filter-${key}`;

	const getScopeOptions = (projectId?: string) =>
		projectId ? { scope: 'project' as const, projectId } : { scope: 'global' as const };

	const getTargetFile = useCallback((pluginId: string, projectId?: string): string | null => {
		if (selectedBibFile) return selectedBibFile;

		const propertyId = getPropertyId(pluginId);
		const scopeOptions = getScopeOptions(projectId);
		const val = getProperty(propertyId, scopeOptions) as string | null;

		if (!val) return null;

		if (availableBibFiles.length > 0 && !availableBibFiles.some(f => f.path === val)) {
			setProperty(propertyId, '', scopeOptions);
			return null;
		}

		return val;
	}, [getProperty, setProperty, availableBibFiles, selectedBibFile]);

	const setTargetFileProperty = useCallback((pluginId: string, filePath: string, projectId?: string) => {
		const propertyId = getPropertyId(pluginId);
		setProperty(propertyId, filePath, getScopeOptions(projectId));
	}, [setProperty]);

	const loadFilterState = useCallback((pluginId: string) => {
		const scopeOptions = getScopeOptions(getProjectId());
		const get = (key: string) => getProperty(getFilterPropertyId(pluginId, key), scopeOptions) as string | null;

		setSortField((get('sortField') as SortField) || 'key');
		setSortOrder((get('sortOrder') as SortOrder) || 'asc');
		setEntryTypeFilter((get('entryTypeFilter') as EntryTypeFilter) || 'all');
		setSourceFilter((get('sourceFilter') as SourceFilter) || 'all');
		setSelectedCollection(get('selectedCollection') || 'all');
		setShowToolbar(get('showToolbar') === 'true');
	}, [getProperty]);

	const saveFilterProperty = useCallback((pluginId: string, key: string, value: string) => {
		setProperty(getFilterPropertyId(pluginId, key), value, getScopeOptions(getProjectId()));
	}, [setProperty]);

	const handleSetSortField = useCallback((field: SortField) => {
		setSortField(field);
		saveFilterProperty(selectedProvider, 'sortField', field);
	}, [selectedProvider, saveFilterProperty]);

	const handleSetSortOrder = useCallback((order: SortOrder) => {
		setSortOrder(order);
		saveFilterProperty(selectedProvider, 'sortOrder', order);
	}, [selectedProvider, saveFilterProperty]);

	const handleSetEntryTypeFilter = useCallback((filter: EntryTypeFilter) => {
		setEntryTypeFilter(filter);
		saveFilterProperty(selectedProvider, 'entryTypeFilter', filter);
	}, [selectedProvider, saveFilterProperty]);

	const handleSetSourceFilter = useCallback((filter: SourceFilter) => {
		setSourceFilter(filter);
		saveFilterProperty(selectedProvider, 'sourceFilter', filter);
	}, [selectedProvider, saveFilterProperty]);

	const handleSetSelectedCollection = useCallback((collection: string) => {
		setSelectedCollection(collection);
		saveFilterProperty(selectedProvider, 'selectedCollection', collection);
	}, [selectedProvider, saveFilterProperty]);

	const handleSetShowToolbar = useCallback((show: boolean) => {
		setShowToolbar(show);
		saveFilterProperty(selectedProvider, 'showToolbar', String(show));
	}, [selectedProvider, saveFilterProperty]);

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
						remoteId: entry.remoteId ?? entry.fields['remote-id'] ?? entry.fields['external-id'],
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

	useEffect(() => {
		const collections = new Set<string>();
		externalEntries.forEach(entry => {
			if (entry.fields?.collection) collections.add(entry.fields.collection);
			if (entry.fields?.groups) entry.fields.groups.split(',').forEach(g => collections.add(g.trim()));
		});
		setAvailableCollections(Array.from(collections).filter(Boolean));
	}, [externalEntries]);

	useEffect(() => {
		const providers = pluginRegistry.getAllBibliographyPlugins();
		setAvailableProviders(
			providers.filter(p => {
				const enabled = getSetting(`${p.id}-enabled`)?.value as boolean;
				return enabled ?? true;
			})
		);
	}, []);

	useEffect(() => {
		loadFilterState(selectedProvider);
	}, [selectedProvider, loadFilterState]);

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

			const searchModeSetting = getSetting(`${provider.id}-search-mode`);
			if (searchModeSetting?.value) {
				(provider as any).searchMode = searchModeSetting.value as 'instant' | 'on-demand';
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

	// searchQuery is intentionally excluded from deps. Callers that need the
	// current query pass it explicitly (triggerSearch, instant debounce).
	// The connection/retry effect and refresh handler pass nothing, causing
	// on-demand providers to receive an empty string and fall through to
	// their linked-entry sync path rather than firing a search fetch.
	const fetchExternalEntries = useCallback(async (query?: string) => {
		const provider = currentProviderRef.current;
		if (!provider || selectedProvider === 'local') {
			setExternalEntries([]);
			return;
		}
		if (provider.getConnectionStatus() !== 'connected') {
			setExternalEntries([]);
			return;
		}

		setIsLoading(true);
		try {
			const local = await getLocalEntriesAsync();
			const bibEntries = await provider.getBibliographyEntries(query ?? '', local);
			setExternalEntries(bibEntries.map((entry: any) => ({
				...entry,
				source: 'external' as const,
				isImported: false,
			})));
		} catch (error) {
			console.error('[BibliographyContext] Error fetching external entries:', error);
			setExternalEntries([]);
		} finally {
			setIsLoading(false);
		}
	}, [selectedProvider, getLocalEntriesAsync]);

	const triggerSearch = useCallback(() => {
		fetchExternalEntries(searchQueryRef.current);
	}, [fetchExternalEntries]);

	// Only fires for providers that explicitly declare searchMode: 'instant'.
	// On-demand providers are excluded, so typing never triggers a fetch for them.
	useEffect(() => {
		const provider = currentProviderRef.current;
		if (!provider || provider.searchMode !== 'instant') return;
		if (!searchQuery.trim()) return;

		const timer = setTimeout(() => {
			fetchExternalEntries(searchQuery);
		}, 400);

		return () => clearTimeout(timer);
	}, [searchQuery, fetchExternalEntries]);

	const fetchAllEntries = useCallback(async () => {
		if (selectedProvider !== 'all') return;
		const providers = availableProviders.filter(p => p.getConnectionStatus() === 'connected');
		if (providers.length === 0) { setExternalEntries([]); return; }

		setIsLoading(true);
		try {
			const local = await getLocalEntriesAsync();
			const allExternal: BibEntry[] = [];
			for (const provider of providers) {
				try {
					const bibEntries = await provider.getBibliographyEntries('', local);
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
	}, [availableProviders, selectedProvider, getLocalEntriesAsync]);

	const importAllExternal = useCallback(async () => {
		if (!targetBibFile || isBulkOperating) return;
		setIsBulkOperating(true);
		try {
			const toImport = entries.filter(e => e.source === 'external' && !e.isImported);
			await bibliographyImportService.batchImport(
				targetBibFile,
				toImport.map(e => ({ entryKey: e.key, rawEntry: e.rawEntry, remoteId: e.remoteId })),
				duplicateHandling as any
			);
			await fetchLocalEntries();
		} finally {
			setIsBulkOperating(false);
		}
	}, [entries, targetBibFile, duplicateHandling, isBulkOperating, fetchLocalEntries]);

	const updateAllLocal = useCallback(async () => {
		if (isBulkOperating) return;
		setIsBulkOperating(true);
		try {
			const byFile = new Map<string, Array<{ entryKey: string; rawEntry: string; remoteId?: string }>>();
			for (const entry of localEntries) {
				const remoteEntry = externalEntries.find(ext =>
					(ext.remoteId && ext.remoteId === entry.remoteId) || ext.key === entry.key
				);
				if (remoteEntry && entry.filePath) {
					if (!byFile.has(entry.filePath)) byFile.set(entry.filePath, []);
					byFile.get(entry.filePath)!.push({
						entryKey: remoteEntry.key,
						rawEntry: remoteEntry.rawEntry,
						remoteId: remoteEntry.remoteId || entry.remoteId
					});
				}
			}
			await Promise.all(
				Array.from(byFile.entries()).map(([filePath, updates]) =>
					bibliographyImportService.batchUpdate(filePath, updates)
				)
			);
			await fetchLocalEntries();
		} finally {
			setIsBulkOperating(false);
		}
	}, [localEntries, externalEntries, isBulkOperating, fetchLocalEntries]);

	const toggleEntrySelection = useCallback((key: string) => {
		setSelectedEntryKeys(prev => {
			const next = new Set(prev);
			if (next.has(key)) next.delete(key);
			else next.add(key);
			return next;
		});
	}, []);

	const selectAllVisible = useCallback(() => {
		setSelectedEntryKeys(new Set(filteredEntries.map(e => e.key)));
	}, [filteredEntries]);

	const clearSelection = useCallback(() => {
		setSelectedEntryKeys(new Set());
	}, []);

	const mergeEntries = useCallback(() => {
		if (selectedProvider === 'local') {
			setEntries(localEntries);
		} else {
			const localKeys = new Set(localEntries.map(e => e.key));
			const localRemoteIds = new Set(localEntries.map(e => e.remoteId).filter(Boolean));

			const updated = externalEntries.map(e => ({
				...e,
				isImported: localKeys.has(e.key) || !!(e.remoteId && localRemoteIds.has(e.remoteId))
			}));

			if (selectedProvider === 'all' || sourceFilter === 'synced-external') {
				setEntries([...localEntries, ...updated]);
			} else {
				setEntries([...localEntries, ...updated.filter(e => !e.isImported)]);
			}
		}
	}, [selectedProvider, localEntries, externalEntries, sourceFilter]);

	useEffect(() => { mergeEntries(); }, [mergeEntries]);

	useEffect(() => {
		let result = [...entries];

		if (selectedCollection !== 'all') {
			result = result.filter(e =>
				e.fields?.collection === selectedCollection ||
				e.fields?.groups?.split(',').map((g: string) => g.trim()).includes(selectedCollection)
			);
		}

		if (entryTypeFilter !== 'all') {
			result = result.filter(e => e.entryType.toLowerCase() === entryTypeFilter);
		}

		if (sourceFilter === 'synced') {
			const externalKeys = new Set(externalEntries.map(e => e.key));
			const externalRemoteIds = new Set(externalEntries.map(e => e.remoteId).filter(Boolean));
			result = result.filter(e =>
				e.source === 'local' &&
				(externalKeys.has(e.key) || (e.remoteId && externalRemoteIds.has(e.remoteId)))
			);
		} else if (sourceFilter === 'synced-external') {
			const externalKeys = new Set(externalEntries.map(e => e.key));
			const externalRemoteIds = new Set(externalEntries.map(e => e.remoteId).filter(Boolean));
			result = result.filter(e =>
				(e.source === 'local' && (externalKeys.has(e.key) || (e.remoteId && externalRemoteIds.has(e.remoteId)))) ||
				(e.source === 'external' && !e.isImported)
			);
		} else if (sourceFilter !== 'all') {
			result = result.filter(e => e.source === sourceFilter);
		}

		if (searchQuery.trim() && currentProvider?.searchMode !== 'on-demand') {
			const q = searchQuery.toLowerCase();
			result = result.filter(entry =>
				entry.key.toLowerCase().includes(q) ||
				entry.entryType.toLowerCase().includes(q) ||
				Object.values(entry.fields).some(v => v.toLowerCase().includes(q))
			);
		}

		result.sort((a, b) => {
			let aVal = '';
			let bVal = '';
			switch (sortField) {
				case 'title': aVal = a.fields.title || ''; bVal = b.fields.title || ''; break;
				case 'author': aVal = a.fields.author || ''; bVal = b.fields.author || ''; break;
				case 'year': aVal = a.fields.year || '0'; bVal = b.fields.year || '0'; break;
				default: aVal = a.key; bVal = b.key;
			}
			const cmp = aVal.localeCompare(bVal);
			return sortOrder === 'asc' ? cmp : -cmp;
		});

		setFilteredEntries(result);
	}, [searchQuery, entries, maxCompletions, entryTypeFilter, sourceFilter, selectedCollection, sortField, sortOrder, currentProvider, externalEntries]);

	useEffect(() => {
		const handleBibFilesUpdate = (bibFiles: FileNode[]) => {
			setAvailableBibFiles(bibFiles.map(f => ({ path: f.path, name: f.name, id: f.id })));
		};
		filePathCacheService.onBibliographyFilesUpdate(handleBibFilesUpdate);
		return () => { filePathCacheService.offBibliographyFilesUpdate(handleBibFilesUpdate); };
	}, []);

	useEffect(() => {
		if (!currentProvider || availableBibFiles.length === 0) return;

		const projectId = getProjectId();
		const saved = getTargetFile(currentProvider.id, projectId);

		if (saved && availableBibFiles.some(f => f.path === saved)) {
			setTargetBibFile(saved);
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
			if (!currentProviderRef.current) return;
			if (currentProviderRef.current.getConnectionStatus() === 'connected') {
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
			await refreshAvailableFiles();
			await filePathCacheService.updateCache();
		};
		initializeFiles();
	}, [refreshAvailableFiles]);

	useEffect(() => {
		setIsMultiSelectMode(false);
		clearSelection();
	}, [selectedProvider]);

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
		loadFilterState(providerId);
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
		if (isMultiSelectMode) {
			toggleEntrySelection(entry.key);
			return;
		}
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
			await bibliographyImportService.batchImport(
				targetBibFile,
				[{ entryKey: entry.key, rawEntry: entry.rawEntry, remoteId: entry.remoteId }],
				duplicateHandling as 'keep-local' | 'replace' | 'rename' | 'ask'
			);
			await fetchLocalEntries();
			document.dispatchEvent(new CustomEvent('refresh-file-tree'));
		} catch (error) {
			console.error('[BibliographyContext] Error importing entry:', error);
		} finally {
			setImportingEntries(prev => { const s = new Set(prev); s.delete(entry.key); return s; });
		}
	};

	const handleDeleteEntry = useCallback(async (entry: BibEntry) => {
		if (entry.source !== 'local' || !entry.filePath) return;

		try {
			await bibliographyImportService.batchDelete(
				entry.filePath,
				[{ entryKey: entry.key, remoteId: entry.remoteId }]
			);
			await fetchLocalEntries();
			document.dispatchEvent(new CustomEvent('refresh-file-tree'));
		} catch (error) {
			console.error('[BibliographyContext] Error deleting entry:', error);
		}
	}, [fetchLocalEntries]);

	const handleUpdateEntry = useCallback(async (entry: BibEntry, remoteEntry: BibEntry) => {
		if (!entry.filePath) return;

		try {
			await bibliographyImportService.batchUpdate(
				entry.filePath,
				[{ entryKey: remoteEntry.key, rawEntry: remoteEntry.rawEntry, remoteId: remoteEntry.remoteId || entry.remoteId }]
			);
			await fetchLocalEntries();
			document.dispatchEvent(new CustomEvent('refresh-file-tree'));
		} catch (error) {
			console.error('[BibliographyContext] Error updating entry:', error);
		}
	}, [fetchLocalEntries]);

	const deleteSelectedEntries = useCallback(async () => {
		if (isBulkOperating) return;
		setIsBulkOperating(true);
		try {
			const byFile = new Map<string, Array<{ entryKey: string; remoteId?: string }>>();
			for (const entry of filteredEntries) {
				if (!selectedEntryKeys.has(entry.key) || entry.source !== 'local' || !entry.filePath) continue;
				if (!byFile.has(entry.filePath)) byFile.set(entry.filePath, []);
				byFile.get(entry.filePath)!.push({ entryKey: entry.key, remoteId: entry.remoteId });
			}
			await Promise.all(
				Array.from(byFile.entries()).map(([filePath, entries]) =>
					bibliographyImportService.batchDelete(filePath, entries)
				)
			);
			await fetchLocalEntries();
		} finally {
			setIsBulkOperating(false);
			clearSelection();
		}
	}, [filteredEntries, selectedEntryKeys, isBulkOperating, fetchLocalEntries, clearSelection]);

	const importSelectedEntries = useCallback(async () => {
		if (!targetBibFile || isBulkOperating) return;
		setIsBulkOperating(true);
		try {
			const toImport = filteredEntries.filter(
				e => selectedEntryKeys.has(e.key) && e.source === 'external' && !e.isImported
			);
			await bibliographyImportService.batchImport(
				targetBibFile,
				toImport.map(e => ({ entryKey: e.key, rawEntry: e.rawEntry, remoteId: e.remoteId })),
				duplicateHandling as any
			);
			await fetchLocalEntries();
		} finally {
			setIsBulkOperating(false);
			clearSelection();
		}
	}, [filteredEntries, selectedEntryKeys, targetBibFile, duplicateHandling, isBulkOperating, fetchLocalEntries, clearSelection]);

	const updateSelectedEntries = useCallback(async () => {
		if (isBulkOperating) return;
		setIsBulkOperating(true);
		try {
			const byFile = new Map<string, Array<{ entryKey: string; rawEntry: string; remoteId?: string }>>();
			for (const entry of filteredEntries) {
				if (!selectedEntryKeys.has(entry.key) || entry.source !== 'local' || !entry.filePath) continue;
				const remoteEntry = externalEntries.find(ext =>
					(ext.remoteId && ext.remoteId === entry.remoteId) || ext.key === entry.key
				);
				if (!remoteEntry) continue;
				if (!byFile.has(entry.filePath)) byFile.set(entry.filePath, []);
				byFile.get(entry.filePath)!.push({
					entryKey: remoteEntry.key,
					rawEntry: remoteEntry.rawEntry,
					remoteId: remoteEntry.remoteId || entry.remoteId
				});
			}
			await Promise.all(
				Array.from(byFile.entries()).map(([filePath, updates]) =>
					bibliographyImportService.batchUpdate(filePath, updates)
				)
			);
			await fetchLocalEntries();
		} finally {
			setIsBulkOperating(false);
			clearSelection();
		}
	}, [filteredEntries, selectedEntryKeys, externalEntries, isBulkOperating, fetchLocalEntries, clearSelection]);

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
		showToolbar, setShowToolbar: handleSetShowToolbar,
		sortField, setSortField: handleSetSortField,
		sortOrder, setSortOrder: handleSetSortOrder,
		entryTypeFilter, setEntryTypeFilter: handleSetEntryTypeFilter,
		sourceFilter, setSourceFilter: handleSetSourceFilter,
		selectedCollection, setSelectedCollection: handleSetSelectedCollection,
		availableCollections,
		isMultiSelectMode, setIsMultiSelectMode,
		selectedEntryKeys, toggleEntrySelection,
		selectAllVisible, clearSelection,
		importSelectedEntries, updateSelectedEntries, deleteSelectedEntries,
		isBulkOperating,
		triggerSearch,
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
		importAllExternal,
		updateAllLocal,
	};

	return (
		<BibliographyContext.Provider value={contextValue}>
			{children}
		</BibliographyContext.Provider>
	);
};