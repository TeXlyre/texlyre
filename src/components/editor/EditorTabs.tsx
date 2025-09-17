// src/components/editor/EditorTabs.tsx
import type React from "react";
import { useCallback, useEffect } from "react";

import { useEditorTabs } from "../../hooks/useEditorTabs";
import { CloseIcon, FileTextIcon, FileIcon } from "../common/Icons";

interface EditorTabsProps {
  onTabSwitch?: (tabId: string) => void;
}

const EditorTabs: React.FC<EditorTabsProps> = ({ onTabSwitch }) => {
  const { tabs, activeTabId, closeTab, switchToTab, updateTabEditorState } = useEditorTabs();

  const handleTabClick = useCallback((e: React.MouseEvent, tabId: string) => {
    e.preventDefault();
    e.stopPropagation();
    switchToTab(tabId);
    onTabSwitch?.(tabId);
  }, [switchToTab, onTabSwitch]);

  const handleCloseClick = useCallback((e: React.MouseEvent, tabId: string) => {
    e.preventDefault();
    e.stopPropagation();
    closeTab(tabId);
  }, [closeTab]);

  const handleMiddleClick = useCallback((e: React.MouseEvent, tabId: string) => {
    if (e.button === 1) { // Middle mouse button
      e.preventDefault();
      e.stopPropagation();
      closeTab(tabId);
    }
  }, [closeTab]);

  useEffect(() => {
    const handleCursorUpdate = (event: Event) => {
      const customEvent = event as CustomEvent;
      const { line, position, fileId, documentId, isEditingFile } = customEvent.detail;
      
      if (typeof line !== 'number' || typeof position !== 'number') return;
      
      const targetTab = tabs.find(tab => 
        (isEditingFile && tab.fileId === fileId) ||
        (!isEditingFile && tab.documentId === documentId)
      );
      
      if (targetTab && targetTab.id === activeTabId) {
        updateTabEditorState(targetTab.id, {
          currentLine: line,
          cursorPosition: position
        });
      }
    };

    document.addEventListener('editor-cursor-update', handleCursorUpdate);
    return () => document.removeEventListener('editor-cursor-update', handleCursorUpdate);
  }, [tabs, activeTabId, updateTabEditorState]);

  if (tabs.length === 0) return null;

  return (
    <div className="editor-tabs-container">
      <div className="editor-tabs">
        {tabs.map(tab => (
          <div
            key={tab.id}
            className={`editor-tab ${tab.id === activeTabId ? 'active' : ''} ${tab.isDirty ? 'dirty' : ''}`}
            onClick={(e) => handleTabClick(e, tab.id)}
            onMouseDown={(e) => handleMiddleClick(e, tab.id)}
            title={`${tab.filePath || tab.title}${tab.editorState.currentLine ? ` (Line ${tab.editorState.currentLine})` : ''}`}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleTabClick(e as any, tab.id);
              }
            }}
          >
            <span className="tab-icon">
              {tab.type === 'document' ? <FileTextIcon /> : <FileIcon />}
            </span>
            <span className="tab-title">
              {tab.title}
              {tab.isDirty && <span className="dirty-indicator">•</span>}
              {tab.editorState.currentLine && (
                <span className="line-indicator">:{tab.editorState.currentLine}</span>
              )}
            </span>
            <button
              className="tab-close"
              onClick={(e) => handleCloseClick(e, tab.id)}
              title="Close tab"
              aria-label={`Close ${tab.title}`}
            >
              <CloseIcon />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default EditorTabs;