// src/hooks/useEditorTabs.ts
import { useContext } from 'react';

import { EditorTabsContext } from '../contexts/EditorTabsContext';
import type { EditorTabsContextType } from '../types/editorTabs';

export const useEditorTabs = (): EditorTabsContextType => {
  const context = useContext(EditorTabsContext);
  if (!context) {
    throw new Error('useEditorTabs must be used within EditorTabsProvider');
  }
  return context;
};