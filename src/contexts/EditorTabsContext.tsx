// src/contexts/EditorTabsContext.tsx
import type React from "react";
import {
  type ReactNode,
  createContext,
  useCallback,
  useEffect,
  useRef,
  useState,
  useContext,
} from "react";

import { useProperties } from "../hooks/useProperties";
import type { EditorTab, EditorTabsContextType } from "../types/editorTabs";

export const EditorTabsContext = createContext<EditorTabsContextType | null>(null);

interface EditorTabsProviderProps {
  children: ReactNode;
}

const MAX_TABS = 20;

export const EditorTabsProvider: React.FC<EditorTabsProviderProps> = ({
  children,
}) => {
  const { getProperty, setProperty, registerProperty } = useProperties();
  const [tabs, setTabs] = useState<EditorTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [propertiesLoaded, setPropertiesLoaded] = useState(false);
  const propertiesRegistered = useRef(false);

  const getCurrentProjectId = useCallback(() => {
    return sessionStorage.getItem("currentProjectId");
  }, []);

  useEffect(() => {
    if (propertiesRegistered.current) return;
    propertiesRegistered.current = true;

    registerProperty({
      id: "editor-tabs",
      category: "UI",
      subcategory: "Editor",
      defaultValue: [],
    });

    registerProperty({
      id: "editor-active-tab",
      category: "UI", 
      subcategory: "Editor",
      defaultValue: null,
    });

    // Load saved properties after registration
    const loadSavedProperties = () => {
      const currentProjectId = getCurrentProjectId();
      if (!currentProjectId) {
        setPropertiesLoaded(true);
        return;
      }

      const savedTabs = getProperty("editor-tabs", {
        scope: "project",
        projectId: currentProjectId
      }) as EditorTab[] | undefined;
      
      const savedActiveTab = getProperty("editor-active-tab", {
        scope: "project",
        projectId: currentProjectId
      }) as string | undefined;

      console.log("Loading saved tabs for project:", currentProjectId, savedTabs);
      console.log("Loading saved active tab for project:", currentProjectId, savedActiveTab);

      if (savedTabs && Array.isArray(savedTabs) && savedTabs.length > 0) {
        setTabs(savedTabs);
      }
      if (savedActiveTab && typeof savedActiveTab === 'string') {
        setActiveTabId(savedActiveTab);
      }
      
      setPropertiesLoaded(true);
    };

    // Add a small delay to ensure properties system is fully initialized
    setTimeout(loadSavedProperties, 100);
  }, [getProperty, registerProperty, getCurrentProjectId]);

  // Only save to properties after initial load is complete
  useEffect(() => {
    if (!propertiesLoaded) return;
    
    const currentProjectId = getCurrentProjectId();
    if (!currentProjectId) return;

    setProperty("editor-tabs", tabs, {
      scope: "project",
      projectId: currentProjectId
    });
  }, [tabs, setProperty, propertiesLoaded, getCurrentProjectId]);

  useEffect(() => {
    if (!propertiesLoaded) return;
    
    const currentProjectId = getCurrentProjectId();
    if (!currentProjectId) return;

    setProperty("editor-active-tab", activeTabId, {
      scope: "project",
      projectId: currentProjectId
    });
  }, [activeTabId, setProperty, propertiesLoaded, getCurrentProjectId]);

  // Reset tabs when project changes
  useEffect(() => {
    const currentProjectId = getCurrentProjectId();
    
    const handleStorageChange = () => {
      const newProjectId = getCurrentProjectId();
      if (newProjectId !== currentProjectId) {
        // Project changed, reset tabs and reload
        setTabs([]);
        setActiveTabId(null);
        setPropertiesLoaded(false);
        
        // Reload properties for new project
        setTimeout(() => {
          const savedTabs = getProperty("editor-tabs", {
            scope: "project",
            projectId: newProjectId || undefined
          }) as EditorTab[] | undefined;
          
          const savedActiveTab = getProperty("editor-active-tab", {
            scope: "project",
            projectId: newProjectId || undefined
          }) as string | undefined;

          if (savedTabs && Array.isArray(savedTabs) && savedTabs.length > 0) {
            setTabs(savedTabs);
          }
          if (savedActiveTab && typeof savedActiveTab === 'string') {
            setActiveTabId(savedActiveTab);
          }
          
          setPropertiesLoaded(true);
        }, 100);
      }
    };

    window.addEventListener('storage', handleStorageChange);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [getCurrentProjectId, getProperty]);

  const openTab = useCallback((tabData: Omit<EditorTab, 'id' | 'lastAccessed' | 'editorState'>) => {
    setTabs(prevTabs => {
        // Check for existing tab by fileId or documentId
        const existingTab = prevTabs.find(tab => 
        (tabData.fileId && tab.fileId === tabData.fileId) ||
        (tabData.documentId && tab.documentId === tabData.documentId)
        );

        if (existingTab) {
        // Update existing tab's last accessed time and switch to it
        const updatedTabs = prevTabs.map(tab => 
            tab.id === existingTab.id 
            ? { ...tab, lastAccessed: Date.now(), ...tabData }
            : tab
        );
        
        setActiveTabId(existingTab.id);
        return updatedTabs;
        }

        // Create new tab
        const newTabId = `${tabData.type}-${tabData.fileId || tabData.documentId}-${Date.now()}`;
        
        let updatedTabs = [...prevTabs, {
        ...tabData,
        id: newTabId,
        lastAccessed: Date.now(),
        editorState: {},
        }];

        // Enforce max tabs limit
        if (updatedTabs.length > MAX_TABS) {
        updatedTabs = updatedTabs
            .sort((a, b) => b.lastAccessed - a.lastAccessed)
            .slice(0, MAX_TABS);
        }

        setActiveTabId(newTabId);
        return updatedTabs;
    });

    // Return the tab ID (either existing or new)
    const existingTab = tabs.find(tab => 
        (tabData.fileId && tab.fileId === tabData.fileId) ||
        (tabData.documentId && tab.documentId === tabData.documentId)
    );
    
    return existingTab?.id || `${tabData.type}-${tabData.fileId || tabData.documentId}-${Date.now()}`;
    }, [tabs]);

  const closeTab = useCallback((tabId: string) => {
    setTabs(prevTabs => {
      const tabIndex = prevTabs.findIndex(tab => tab.id === tabId);
      if (tabIndex === -1) return prevTabs;

      const newTabs = prevTabs.filter(tab => tab.id !== tabId);
      
      if (activeTabId === tabId) {
        if (newTabs.length === 0) {
          setActiveTabId(null);
        } else {
          const nextIndex = tabIndex < newTabs.length ? tabIndex : newTabs.length - 1;
          setActiveTabId(newTabs[nextIndex].id);
        }
      }

      return newTabs;
    });
  }, [activeTabId]);

  const switchToTab = useCallback((tabId: string) => {
    const tab = tabs.find(t => t.id === tabId);
    if (!tab) return;
    
    setActiveTabId(tabId);
    
    // Use existing goto line mechanism to restore cursor position
    if (tab.editorState.currentLine) {
      setTimeout(() => {
        document.dispatchEvent(new CustomEvent('codemirror-goto-line', {
          detail: { 
            line: tab.editorState.currentLine,
            tabId: tabId,
            fileId: tab.fileId,
            documentId: tab.documentId
          }
        }));
      }, 150); // Delay to ensure editor is loaded
    }
  }, [tabs]);

  const updateTabState = useCallback((tabId: string, editorState: EditorTab['editorState']) => {
    setTabs(prevTabs =>
      prevTabs.map(tab =>
        tab.id === tabId
          ? { ...tab, editorState: { ...tab.editorState, ...editorState } }
          : tab
      )
    );
  }, []);

  const updateTabEditorState = useCallback((tabId: string, editorState: Partial<EditorTab['editorState']>) => {
    setTabs(prevTabs =>
      prevTabs.map(tab =>
        tab.id === tabId
          ? { ...tab, editorState: { ...tab.editorState, ...editorState } }
          : tab
      )
    );
  }, []);

  const markTabDirty = useCallback((tabId: string, isDirty: boolean) => {
    setTabs(prevTabs =>
      prevTabs.map(tab =>
        tab.id === tabId
          ? { ...tab, isDirty }
          : tab
      )
    );
  }, []);

  const getActiveTab = useCallback(() => {
    return tabs.find(tab => tab.id === activeTabId) || null;
  }, [tabs, activeTabId]);

  const getTabByFileId = useCallback((fileId: string) => {
    return tabs.find(tab => tab.fileId === fileId);
    }, [tabs]);

  const getTabByDocumentId = useCallback((documentId: string) => {
    return tabs.find(tab => tab.documentId === documentId);
    }, [tabs]);

  const gotoLineInTab = useCallback((tabId: string, line: number) => {
    const tab = tabs.find(t => t.id === tabId);
    if (!tab) return;

    setActiveTabId(tabId);
    
    setTimeout(() => {
      document.dispatchEvent(new CustomEvent('codemirror-goto-line', {
        detail: { 
          line, 
          tabId,
          fileId: tab.fileId,
          documentId: tab.documentId 
        }
      }));
    }, 100);
  }, [tabs]);

  const contextValue: EditorTabsContextType = {
    tabs,
    activeTabId,
    openTab,
    closeTab,
    switchToTab,
    updateTabState,
    updateTabEditorState,
    markTabDirty,
    getActiveTab,
    getTabByFileId,
    getTabByDocumentId,
    gotoLineInTab,
  };

  return (
    <EditorTabsContext.Provider value={contextValue}>
      {children}
    </EditorTabsContext.Provider>
  );
};