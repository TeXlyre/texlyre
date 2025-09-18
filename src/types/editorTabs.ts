// src/types/editorTabs.ts
export interface EditorTab {
  id: string;
  title: string;
  type: 'file' | 'document';
  fileId?: string;
  documentId?: string;
  filePath?: string;
  isDirty?: boolean;
  lastAccessed: number;
  editorState: {
    cursorPosition?: number;
    scrollTop?: number;
    selection?: { from: number; to: number };
    currentLine?: number;
  };
}

export interface EditorTabsContextType {
  tabs: EditorTab[];
  activeTabId: string | null;
  openTab: (tab: Omit<EditorTab, 'id' | 'lastAccessed' | 'editorState'>) => string;
  reorderTabs: (sourceIndex: number, destinationIndex: number) => void;
  closeOtherTabs: (currentTabId: string) => void;
  closeTabsToLeft: (currentTabId: string) => void;
  closeTabsToRight: (currentTabId: string) => void;
  closeTab: (tabId: string) => void;
  switchToTab: (tabId: string) => void;
  updateTabState: (tabId: string, editorState: EditorTab['editorState']) => void;
  updateTabEditorState: (tabId: string, editorState: Partial<EditorTab['editorState']>) => void;
  markTabDirty: (tabId: string, isDirty: boolean) => void;
  getActiveTab: () => EditorTab | null;
  getTabByFileId: (fileId: string) => EditorTab | undefined;
  getTabByDocumentId: (documentId: string) => EditorTab | undefined;
}