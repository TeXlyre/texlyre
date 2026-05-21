// src/contexts/EditorTabsContext.tsx
import type React from 'react';
import {
	type ReactNode,
	createContext,
	useCallback,
	useEffect,
	useRef,
	useState,
} from 'react';

import { useProperties } from '../hooks/useProperties';
import type { EditorTab, EditorTabsContextType } from '../types/editorTabs';
import { type EditorTarget, gotoEditor } from '../utils/editorNavigator';

export const EditorTabsContext = createContext<EditorTabsContextType | null>(
	null,
);

interface EditorTabsProviderProps {
	children: ReactNode;
}

const MAX_TABS = 20;

export const EditorTabsProvider: React.FC<EditorTabsProviderProps> = ({
	children,
}) => {
	const {
		isReady: arePropertiesReady,
		getProperty,
		setProperty,
		registerProperty,
	} = useProperties();
	const [tabs, setTabs] = useState<EditorTab[]>([]);
	const [activeTabId, setActiveTabId] = useState<string | null>(null);
	const [propertiesLoaded, setPropertiesLoaded] = useState(false);
	const propertiesRegistered = useRef(false);
	const pendingGotoRef = useRef<{ tabId: string; position: number } | null>(
		null,
	);
	const lastActiveTabIdRef = useRef<string | null>(null);

	const getCurrentProjectId = useCallback(() => {
		return sessionStorage.getItem('currentProjectId');
	}, []);

	useEffect(() => {
		if (propertiesRegistered.current) return;
		propertiesRegistered.current = true;

		registerProperty({
			id: 'editor-tabs',
			category: 'UI',
			subcategory: 'Editor',
			defaultValue: [],
		});

		registerProperty({
			id: 'editor-active-tab',
			category: 'UI',
			subcategory: 'Editor',
			defaultValue: null,
		});
	}, [registerProperty]);

	useEffect(() => {
		if (!arePropertiesReady || propertiesLoaded) return;

		const currentProjectId = getCurrentProjectId();
		if (!currentProjectId) {
			setPropertiesLoaded(true);
			return;
		}

		const savedTabs = getProperty('editor-tabs', {
			scope: 'project',
			projectId: currentProjectId,
		}) as EditorTab[] | undefined;

		const savedActiveTab = getProperty('editor-active-tab', {
			scope: 'project',
			projectId: currentProjectId,
		}) as string | undefined;

		if (savedTabs && Array.isArray(savedTabs) && savedTabs.length > 0) {
			setTabs(savedTabs);
		}
		if (savedActiveTab && typeof savedActiveTab === 'string') {
			setActiveTabId(savedActiveTab);
		}

		setPropertiesLoaded(true);
	}, [arePropertiesReady, propertiesLoaded, getProperty, getCurrentProjectId]);

	useEffect(() => {
		if (!propertiesLoaded) return;

		const currentProjectId = getCurrentProjectId();
		if (!currentProjectId) return;

		setProperty('editor-tabs', tabs, {
			scope: 'project',
			projectId: currentProjectId,
		});
	}, [tabs, setProperty, propertiesLoaded, getCurrentProjectId]);

	useEffect(() => {
		if (!propertiesLoaded) return;

		const currentProjectId = getCurrentProjectId();
		if (!currentProjectId) return;

		setProperty('editor-active-tab', activeTabId, {
			scope: 'project',
			projectId: currentProjectId,
		});
	}, [activeTabId, setProperty, propertiesLoaded, getCurrentProjectId]);

	useEffect(() => {
		const currentProjectId = getCurrentProjectId();

		const handleStorageChange = () => {
			const newProjectId = getCurrentProjectId();
			if (newProjectId === currentProjectId) return;

			setTabs([]);
			setActiveTabId(null);
			setPropertiesLoaded(false);

			const savedTabs = getProperty('editor-tabs', {
				scope: 'project',
				projectId: newProjectId || undefined,
			}) as EditorTab[] | undefined;

			const savedActiveTab = getProperty('editor-active-tab', {
				scope: 'project',
				projectId: newProjectId || undefined,
			}) as string | undefined;

			if (savedTabs && Array.isArray(savedTabs) && savedTabs.length > 0) {
				setTabs(savedTabs);
			}
			if (savedActiveTab && typeof savedActiveTab === 'string') {
				setActiveTabId(savedActiveTab);
			}

			setPropertiesLoaded(true);
		};

		window.addEventListener('storage', handleStorageChange);

		return () => {
			window.removeEventListener('storage', handleStorageChange);
		};
	}, [getCurrentProjectId, getProperty]);

	const openTab = useCallback(
		(tabData: Omit<EditorTab, 'id' | 'lastAccessed' | 'editorState'>) => {
			const existingTab = tabs.find(
				(tab) =>
					(tabData.fileId && tab.fileId === tabData.fileId) ||
					(tabData.documentId && tab.documentId === tabData.documentId),
			);

			const tabId = existingTab
				? existingTab.id
				: `${tabData.type}-${tabData.fileId || tabData.documentId}-${Date.now()}`;

			setTabs((prevTabs) => {
				const existing = prevTabs.find((tab) => tab.id === tabId);

				if (existing) {
					return prevTabs.map((tab) =>
						tab.id === tabId
							? { ...tab, lastAccessed: Date.now(), ...tabData }
							: tab,
					);
				}

				let updatedTabs = [
					...prevTabs,
					{
						...tabData,
						id: tabId,
						lastAccessed: Date.now(),
						editorState: {},
					},
				];

				if (updatedTabs.length > MAX_TABS) {
					updatedTabs = updatedTabs
						.sort((a, b) => b.lastAccessed - a.lastAccessed)
						.slice(0, MAX_TABS);
				}

				return updatedTabs;
			});

			setActiveTabId(tabId);

			return tabId;
		},
		[tabs],
	);

	const reorderTabs = useCallback(
		(sourceIndex: number, destinationIndex: number) => {
			setTabs((prevTabs) => {
				const result = [...prevTabs];
				const [removed] = result.splice(sourceIndex, 1);
				result.splice(destinationIndex, 0, removed);
				return result;
			});
		},
		[],
	);

	const closeOtherTabs = useCallback((currentTabId: string) => {
		setTabs((prevTabs) => {
			const tabToKeep = prevTabs.find((tab) => tab.id === currentTabId);
			if (!tabToKeep) return prevTabs;

			setActiveTabId(currentTabId);
			return [tabToKeep];
		});
	}, []);

	const closeTabsToLeft = useCallback((currentTabId: string) => {
		setTabs((prevTabs) => {
			const tabIndex = prevTabs.findIndex((tab) => tab.id === currentTabId);
			if (tabIndex <= 0) return prevTabs;

			return prevTabs.slice(tabIndex);
		});
	}, []);

	const closeTabsToRight = useCallback((currentTabId: string) => {
		setTabs((prevTabs) => {
			const tabIndex = prevTabs.findIndex((tab) => tab.id === currentTabId);
			if (tabIndex === -1 || tabIndex === prevTabs.length - 1) return prevTabs;

			return prevTabs.slice(0, tabIndex + 1);
		});
	}, []);

	const closeTab = useCallback(
		(tabId: string) => {
			setTabs((prevTabs) => {
				const tabIndex = prevTabs.findIndex((tab) => tab.id === tabId);
				if (tabIndex === -1) return prevTabs;

				const newTabs = prevTabs.filter((tab) => tab.id !== tabId);

				if (activeTabId === tabId) {
					if (newTabs.length === 0) {
						setActiveTabId(null);
					} else {
						const nextIndex =
							tabIndex < newTabs.length ? tabIndex : newTabs.length - 1;
						setActiveTabId(newTabs[nextIndex].id);
					}
				}

				return newTabs;
			});
		},
		[activeTabId],
	);

	const switchToTab = useCallback(
		(tabId: string) => {
			const tab = tabs.find((t) => t.id === tabId);
			if (!tab) return;

			setActiveTabId(tabId);

			if (tab.editorState.cursorPosition) {
				pendingGotoRef.current = {
					tabId: tabId,
					position: tab.editorState.cursorPosition,
				};
			}
		},
		[tabs],
	);

	useEffect(() => {
		if (!pendingGotoRef.current) return;

		const tab = tabs.find((t) => t.id === pendingGotoRef.current!.tabId);
		if (!tab) {
			pendingGotoRef.current = null;
			return;
		}

		const handleEditorReady = (event: Event) => {
			const pendingGoto = pendingGotoRef.current;
			if (!pendingGoto) return;

			const { fileId, documentId, isEditingFile } = (event as CustomEvent)
				.detail;
			const isTargetFile = isEditingFile && tab.fileId === fileId;
			const isTargetDoc = !isEditingFile && tab.documentId === documentId;

			if (isTargetFile || isTargetDoc) {
				const target: EditorTarget = tab.documentId
					? { kind: 'document', documentId: tab.documentId }
					: { kind: 'file', fileId: tab.fileId! };

				gotoEditor(target, { position: pendingGoto.position, tabId: tab.id });
				pendingGotoRef.current = null;
			}
		};

		const eventType = tab.documentId ? 'editor-ready-yjs' : 'editor-ready';

		document.addEventListener(eventType, handleEditorReady);

		return () => {
			document.removeEventListener(eventType, handleEditorReady);
		};
	}, [tabs]);

	useEffect(() => {
		if (!propertiesLoaded || !activeTabId) return;

		if (lastActiveTabIdRef.current === activeTabId) return;
		lastActiveTabIdRef.current = activeTabId;

		const activeTab = tabs.find((t) => t.id === activeTabId);
		if (!activeTab || !activeTab.editorState.cursorPosition) return;

		pendingGotoRef.current = {
			tabId: activeTabId,
			position: activeTab.editorState.cursorPosition,
		};
	}, [propertiesLoaded, activeTabId, tabs]);

	const updateTabState = useCallback(
		(tabId: string, editorState: EditorTab['editorState']) => {
			setTabs((prevTabs) =>
				prevTabs.map((tab) =>
					tab.id === tabId
						? { ...tab, editorState: { ...tab.editorState, ...editorState } }
						: tab,
				),
			);
		},
		[],
	);

	const updateTabEditorState = useCallback(
		(tabId: string, editorState: Partial<EditorTab['editorState']>) => {
			setTabs((prevTabs) =>
				prevTabs.map((tab) =>
					tab.id === tabId
						? { ...tab, editorState: { ...tab.editorState, ...editorState } }
						: tab,
				),
			);
		},
		[],
	);

	const markTabDirty = useCallback((tabId: string, isDirty: boolean) => {
		setTabs((prevTabs) =>
			prevTabs.map((tab) => (tab.id === tabId ? { ...tab, isDirty } : tab)),
		);
	}, []);

	const getActiveTab = useCallback(() => {
		return tabs.find((tab) => tab.id === activeTabId) || null;
	}, [tabs, activeTabId]);

	const getTabByFileId = useCallback(
		(fileId: string) => {
			return tabs.find((tab) => tab.fileId === fileId);
		},
		[tabs],
	);

	const getTabByDocumentId = useCallback(
		(documentId: string) => {
			return tabs.find((tab) => tab.documentId === documentId);
		},
		[tabs],
	);

	const contextValue: EditorTabsContextType = {
		tabs,
		activeTabId,
		openTab,
		reorderTabs,
		closeOtherTabs,
		closeTabsToLeft,
		closeTabsToRight,
		closeTab,
		switchToTab,
		updateTabState,
		updateTabEditorState,
		markTabDirty,
		getActiveTab,
		getTabByFileId,
		getTabByDocumentId,
	};

	return (
		<EditorTabsContext.Provider value={contextValue}>
			{children}
		</EditorTabsContext.Provider>
	);
};
