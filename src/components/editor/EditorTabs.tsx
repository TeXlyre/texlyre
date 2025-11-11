// src/components/editor/EditorTabs.tsx
import { t } from '@/i18n';
import type React from 'react';
import { useCallback, useEffect, useState, useRef } from 'react';

import { useEditorTabs } from '../../hooks/useEditorTabs';
import { CloseIcon, FileTextIcon, FileIcon, ChevronLeftIcon, ChevronRightIcon } from '../common/Icons';

interface EditorTabsProps {
  onTabSwitch?: (tabId: string) => void;
}

interface ContextMenuState {
  isVisible: boolean;
  x: number;
  y: number;
  tabId: string | null;
}

const EditorTabs: React.FC<EditorTabsProps> = ({ onTabSwitch }) => {
  const {
    tabs,
    activeTabId,
    closeTab,
    switchToTab,
    updateTabEditorState,
    reorderTabs,
    closeOtherTabs,
    closeTabsToLeft,
    closeTabsToRight
  } = useEditorTabs();

  const [isDragging, setIsDragging] = useState(false);
  const [dragOverIndex, setDragOverIndex] = useState<number>(-1);
  const [draggedTabIndex, setDraggedTabIndex] = useState<number>(-1);

  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    isVisible: false,
    x: 0,
    y: 0,
    tabId: null
  });

  const contextMenuRef = useRef<HTMLDivElement>(null);
  const tabsContainerRef = useRef<HTMLDivElement>(null);
  const tabsRef = useRef<HTMLDivElement>(null);

  const updateScrollState = useCallback(() => {
    const container = tabsContainerRef.current;
    const tabs = tabsRef.current;

    if (!container || !tabs) return;

    const hasOverflow = tabs.scrollWidth > tabs.clientWidth;
    const isAtStart = tabs.scrollLeft <= 0;
    const isAtEnd = tabs.scrollLeft >= tabs.scrollWidth - tabs.clientWidth;

    container.classList.toggle('has-overflow', hasOverflow);
    container.classList.toggle('at-start', isAtStart);
    container.classList.toggle('at-end', isAtEnd);
  }, []);

  const scrollLeft = useCallback(() => {
    const tabs = tabsRef.current;
    if (!tabs) return;

    tabs.scrollBy({ left: -120, behavior: 'smooth' });
  }, []);

  const scrollRight = useCallback(() => {
    const tabs = tabsRef.current;
    if (!tabs) return;

    tabs.scrollBy({ left: 120, behavior: 'smooth' });
  }, []);

  useEffect(() => {
    const tabs = tabsRef.current;
    if (!tabs) return;

    const handleScroll = () => updateScrollState();
    const handleResize = () => updateScrollState();

    tabs.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleResize);

    // Initial check
    updateScrollState();

    return () => {
      tabs.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleResize);
    };
  }, [updateScrollState]);

  useEffect(() => {
    // Update scroll state when tabs change
    updateScrollState();
  }, [tabs, updateScrollState]);

  useEffect(() => {
    const tabs = tabsRef.current;
    if (!tabs) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.deltaY !== 0) {
        e.preventDefault();
        tabs.scrollLeft += e.deltaY;
      }
    };

    tabs.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      tabs.removeEventListener('wheel', handleWheel);
    };
  }, []);

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
    if (e.button === 1) {
      e.preventDefault();
      e.stopPropagation();
      closeTab(tabId);
    }
  }, [closeTab]);

  const handleRightClick = useCallback((e: React.MouseEvent, tabId: string) => {
    e.preventDefault();
    e.stopPropagation();

    setContextMenu({
      isVisible: true,
      x: e.clientX,
      y: e.clientY,
      tabId
    });
  }, []);

  const handleContextMenuAction = useCallback((action: 'closeOthers' | 'closeLeft' | 'closeRight') => {
    if (!contextMenu.tabId) return;

    switch (action) {
      case 'closeOthers':
        closeOtherTabs(contextMenu.tabId);
        break;
      case 'closeLeft':
        closeTabsToLeft(contextMenu.tabId);
        break;
      case 'closeRight':
        closeTabsToRight(contextMenu.tabId);
        break;
    }

    setContextMenu({ isVisible: false, x: 0, y: 0, tabId: null });
  }, [contextMenu.tabId, closeOtherTabs, closeTabsToLeft, closeTabsToRight]);

  const handleDragStart = useCallback((e: React.DragEvent, index: number, tabId: string) => {
    e.dataTransfer.setData('text/plain', JSON.stringify({
      tabIndex: index,
      tabId: tabId
    }));
    e.dataTransfer.effectAllowed = 'move';

    setIsDragging(true);
    setDraggedTabIndex(index);
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';

    if (draggedTabIndex !== index) {
      setDragOverIndex(index);
    }
  }, [draggedTabIndex]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;

    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
      setDragOverIndex(-1);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    e.stopPropagation();

    try {
      const dragData = e.dataTransfer.getData('text/plain');
      if (!dragData) return;

      const { tabIndex: sourceIndex } = JSON.parse(dragData);

      if (sourceIndex !== dropIndex && sourceIndex >= 0 && dropIndex >= 0) {
        reorderTabs(sourceIndex, dropIndex);
      }
    } catch (error) {
      console.error('Error handling tab drop:', error);
    } finally {
      setIsDragging(false);
      setDragOverIndex(-1);
      setDraggedTabIndex(-1);
    }
  }, [reorderTabs]);

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
    setDragOverIndex(-1);
    setDraggedTabIndex(-1);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu({ isVisible: false, x: 0, y: 0, tabId: null });
      }
    };

    if (contextMenu.isVisible) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('contextmenu', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
        document.removeEventListener('contextmenu', handleClickOutside);
      };
    }
  }, [contextMenu.isVisible]);

  useEffect(() => {
    const handleCursorUpdate = (event: Event) => {
      const customEvent = event as CustomEvent;
      const { line, position, fileId, documentId, isEditingFile } = customEvent.detail;

      if (typeof line !== 'number' || typeof position !== 'number') return;

      const targetTab = tabs.find((tab) =>
        isEditingFile && tab.fileId === fileId ||
        !isEditingFile && tab.documentId === documentId
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

  const getTabClasses = (index: number, tabId: string) => {
    let classes = `editor-tab ${tabId === activeTabId ? 'active' : ''}`;

    const tab = tabs[index];
    if (tab?.isDirty) {
      classes += ' dirty';
    }

    if (draggedTabIndex === index) {
      classes += ' dragging';
    }

    if (dragOverIndex === index && draggedTabIndex !== index && draggedTabIndex !== -1) {
      classes += ' drag-over';
    }

    return classes;
  };

  const currentTabIndex = contextMenu.tabId ? tabs.findIndex((tab) => tab.id === contextMenu.tabId) : -1;
  const hasTabsToLeft = currentTabIndex > 0;
  const hasTabsToRight = currentTabIndex < tabs.length - 1 && currentTabIndex !== -1;
  const hasOtherTabs = tabs.length > 1;

  return (
    <>
      <div ref={tabsContainerRef} className="editor-tabs-container">
        <button
          className="scroll-button scroll-left"
          onClick={scrollLeft}
          title={t('Scroll left')}
          aria-label={t('Scroll tabs left')}>

          <ChevronLeftIcon />
        </button>

        <div ref={tabsRef} className="editor-tabs">
          {tabs.map((tab, index) =>
            <div
              key={tab.id}
              className={getTabClasses(index, tab.id)}
              onClick={(e) => handleTabClick(e, tab.id)}
              onMouseDown={(e) => handleMiddleClick(e, tab.id)}
              onContextMenu={(e) => handleRightClick(e, tab.id)}
              draggable={!isDragging || draggedTabIndex === index}
              onDragStart={(e) => handleDragStart(e, index, tab.id)}
              onDragEnter={handleDragEnter}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, index)}
              onDragEnd={handleDragEnd}
              title={`${tab.filePath || tab.title}${tab.editorState.currentLine ? ` (Line ${tab.editorState.currentLine})` : ''}`}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleTabClick(e as any, tab.id);
                }
              }}>

              <span className="tab-icon">
                {tab.type === 'document' ? <FileTextIcon /> : <FileIcon />}
              </span>
              <span className="tab-title">
                {tab.title}
                {tab.isDirty && <span className="dirty-indicator">•</span>}
                {tab.editorState.currentLine &&
                  <span className="line-indicator">:{tab.editorState.currentLine}</span>
                }
              </span>
              <button
                className="tab-close"
                onClick={(e) => handleCloseClick(e, tab.id)}
                title={t('Close tab')}
                aria-label={`Close ${tab.title}`}>

                <CloseIcon />
              </button>
            </div>
          )}
        </div>

        <button
          className="scroll-button scroll-right"
          onClick={scrollRight}
          title={t('Scroll right')}
          aria-label={t('Scroll tabs right')}>

          <ChevronRightIcon />
        </button>
      </div>

      {contextMenu.isVisible &&
        <div
          ref={contextMenuRef}
          className="editor-tab-context-menu"
          style={{
            left: contextMenu.x,
            top: contextMenu.y
          }}>

          <button
            className="context-menu-item"
            onClick={() => handleContextMenuAction('closeOthers')}
            disabled={!hasOtherTabs}>{t('Close Others')}


          </button>
          <button
            className="context-menu-item"
            onClick={() => handleContextMenuAction('closeLeft')}
            disabled={!hasTabsToLeft}>{t('Close Tabs to the Left')}


          </button>
          <button
            className="context-menu-item"
            onClick={() => handleContextMenuAction('closeRight')}
            disabled={!hasTabsToRight}>{t('Close Tabs to the Right')}


          </button>
        </div>
      }
    </>);

};

export default EditorTabs;