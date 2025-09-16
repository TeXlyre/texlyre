// src/components/editor/EditorTabs.tsx
import type React from "react";
import { useCallback } from "react";

import { useEditorTabs } from "../../hooks/useEditorTabs";
import { CloseIcon, FileTextIcon, FileIcon } from "../common/Icons";

interface EditorTabsProps {
  onTabSwitch?: (tabId: string) => void;
}

const EditorTabs: React.FC<EditorTabsProps> = ({ onTabSwitch }) => {
  const { tabs, activeTabId, closeTab, switchToTab } = useEditorTabs();

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
            title={tab.filePath || tab.title}
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