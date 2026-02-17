// extras/collaborative_viewers/bibtex/BibtexCollaborativeViewer.tsx
import { t } from '@/i18n';
import { Trans } from 'react-i18next';
import { tidy } from 'bib-editor';
import type React from 'react';
import { useEffect, useRef, useState, useMemo } from 'react';

import {
  DownloadIcon,
  OptionsIcon,
  SaveIcon,
  ViewIcon
} from
  '@/components/common/Icons';
import {
  PluginControlGroup,
  PluginHeader
} from
  '@/components/common/PluginHeader';
import { usePluginFileInfo } from '@/hooks/usePluginFileInfo';
import { useSettings } from '@/hooks/useSettings';
import { BibliographyProvider } from '@/contexts/BibliographyContext';
import { useEditorView } from '@/hooks/editor/useEditorView';
import LSPToggleButton from '@/components/bibliography/LSPToggleButton';
import BibliographyPanel from '@/components/bibliography/BibliographyPanel';
import type { CollaborativeViewerProps } from '@/plugins/PluginInterface';
import { pluginRegistry } from '@/plugins/PluginRegistry';
import { fileStorageService } from '@/services/FileStorageService';
import { bibliographyImportService } from '@/services/BibliographyImportService';
import { collabService } from '@/services/CollabService';
import { formatFileSize } from '@/utils/fileUtils';
import { detectFileType } from '@/utils/fileUtils';
import { TextDiffUtils } from '@/utils/textDiffUtils';
import { TidyOptionsPanel } from '../../viewers/bibtex/TidyOptionsPanel';
import {
  type TidyOptions,
  getPresetOptions
} from
  '../../viewers/bibtex/tidyOptions';
import { BibtexTableView } from '../../viewers/bibtex/BibtexTableView';
import { BibtexParser } from '../../viewers/bibtex/BibtexParser';
import type { BibtexEntry } from '../../viewers/bibtex/BibtexParser';
import '../../viewers/bibtex/styles.css';
import { PLUGIN_NAME, PLUGIN_VERSION } from './BibtexCollaborativeViewerPlugin';

const BibtexCollaborativeViewer: React.FC<CollaborativeViewerProps> = ({
  content,
  fileName,
  fileId,
  docUrl,
  documentId,
  isDocumentSelected,
  onUpdateContent,
  parseComments,
  addComment,
  updateComments
}) => {
  const { getSetting } = useSettings();
  const fileInfo = usePluginFileInfo(fileId, fileName);

  const autoTidy =
    getSetting('bibtex-viewer-auto-tidy')?.value as boolean ?? true;
  const tidyPreset =
    getSetting('bibtex-viewer-tidy-options')?.value as
    'minimal' |
    'standard' |
    'strict' ?? 'standard';

  const [bibtexContent, setBibtexContent] = useState<string>('');
  const [processedContent, setProcessedContent] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [_hasChanges, setHasChanges] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<unknown[]>([]);
  const [showSidebar, setShowSidebar] = useState(true);
  const [currentView, setCurrentView] = useState<'original' | 'processed'>(
    'original'
  );
  const [viewMode, setViewMode] = useState<'editor' | 'table'>('editor');

  const [processedParsedEntries, setProcessedParsedEntries] = useState<BibtexEntry[]>([]);
  const [updateCounter, setUpdateCounter] = useState(0);

  const editorRef = useRef<HTMLDivElement>(null);
  const [options, setOptions] = useState<TidyOptions>(() =>
    getPresetOptions(tidyPreset)
  );
  const _activeContent =
    currentView === 'original' ? bibtexContent : processedContent;

  const initialContentRef = useRef<string>(
    typeof content === 'string' ?
      content :
      content instanceof ArrayBuffer ?
        new TextDecoder('utf-8').decode(content) :
        ''
  );
  const projectId = useMemo(() => {
    const hash = docUrl.split(':').pop() || '';
    return hash;
  }, [docUrl]);

  const collectionName = useMemo(() => `yjs_${documentId}`, [documentId]);

  const awareness = useMemo(() => {
    return collabService.getAwareness(projectId, collectionName);
  }, [projectId, collectionName]);

  const fileType = detectFileType(fileName);
  const { lsp: availableLSPPlugins, bib: availableBibPlugins } = getPluginToggleButtons([fileType]);
  const hasPluginToggles = availableLSPPlugins.length > 0 || availableBibPlugins.length > 0;

  function getPluginToggleButtons(fileTypes: string[] | undefined) {
    if (!fileTypes?.length) return { lsp: [], bib: [] };

    const types = new Set(fileTypes);
    const lsp = [...new Set([...types].flatMap(t => pluginRegistry.getLSPPluginsForFileType(t)))];
    const bib = pluginRegistry.getBibliographyPlugins().filter(p =>
      p.getSupportedFileTypes().some(t => types.has(t))
    );

    return { lsp, bib };
  }

  useEffect(() => {
    if (fileId && fileInfo.filePath) {
      document.dispatchEvent(new CustomEvent('bib-file-opened', {
        detail: { filePath: fileInfo.filePath }
      }));
      bibliographyImportService.registerOpenFile(fileInfo.filePath);
    }

    return () => {
      if (fileInfo.filePath) {
        bibliographyImportService.unregisterOpenFile(fileInfo.filePath);
      }
    };
  }, [fileId, fileInfo.filePath]);

  const parseContent = (content: string) => {
    try {
      return BibtexParser.parse(content);
    } catch (error) {
      console.warn('Failed to parse BibTeX content:', error);
      return [];
    }
  };

  const handleContentUpdate = (newContent: string) => {
    if (currentView === 'original') {
      setBibtexContent(newContent);
      setHasChanges(true);
      onUpdateContent(newContent);
    } else {
      setProcessedContent(newContent);
      setProcessedParsedEntries(parseContent(newContent));
      setUpdateCounter((prev) => prev + 1);
      setHasChanges(true);
    }
  };

  const handleSingleTableEntryUpdate = (updatedEntry: BibtexEntry) => {
    const newContent = BibtexParser.updateEntryInContent(processedContent, updatedEntry);
    setProcessedContent(newContent);

    const updatedParsedEntries = processedParsedEntries.map((entry) =>
      entry.originalIndex === updatedEntry.originalIndex ? updatedEntry : entry
    );
    setProcessedParsedEntries(updatedParsedEntries);

    if (viewRef.current) {
      const position = BibtexParser.findEntryPosition(processedContent, updatedEntry);
      if (position) {
        const newEntryContent = BibtexParser.serializeEntry(updatedEntry);
        viewRef.current.dispatch({
          changes: {
            from: position.start,
            to: position.end,
            insert: newEntryContent
          }
        });
      }
    }

    setUpdateCounter((prev) => prev + 1);
    setHasChanges(true);
  };

  const handleTableEntryUpdate = (updatedEntries: BibtexEntry[]) => {
    const newContent = BibtexParser.serialize(updatedEntries);
    setProcessedContent(newContent);
    setProcessedParsedEntries(updatedEntries);

    if (viewRef.current) {
      viewRef.current.dispatch({
        changes: { from: 0, to: viewRef.current.state.doc.length, insert: newContent }
      });
    }

    setUpdateCounter((prev) => prev + 1);
    setHasChanges(true);
  };

  const { viewRef, showSaveIndicator } =
    currentView === 'original' ?
      useEditorView(
        editorRef,
        docUrl,
        documentId,
        isDocumentSelected,
        initialContentRef.current,
        handleContentUpdate,
        parseComments || (() => []),
        addComment || (() => ({ openTag: '', closeTag: '', commentId: '' })),
        updateComments || (() => { }),
        false,
        false,
        fileName,
        undefined,
        false
      ) :
      useEditorView(
        editorRef,
        'bibtex-viewer',
        `${documentId}-processed`,
        true,
        processedContent,
        handleContentUpdate,
        () => [],
        () => ({ openTag: '', closeTag: '', commentId: '' }),
        () => { },
        true,
        false,
        fileName,
        undefined,
        false
      );

  useEffect(() => {
    let text = '';
    if (content instanceof ArrayBuffer) {
      try {
        text = new TextDecoder('utf-8').decode(content);
      } catch (e) {
        console.error('BibtexCollaborativeViewer: Error decoding content:', e);
        setError(t('Failed to decode file content'));
        return;
      }
    } else if (typeof content === 'string') {
      text = content;
    }
    setBibtexContent(text);
    setProcessedContent(text);
    setProcessedParsedEntries(parseContent(text));
    setHasChanges(false);
    setError(null);

    if (autoTidy && text.trim()) {
      setTimeout(() => {
        processBibtexWithOptions(text, getPresetOptions(tidyPreset));
      }, 500);
    }
  }, [content, autoTidy, tidyPreset]);

  useEffect(() => {
    if (viewMode === 'table' && currentView === 'processed') {
      console.log('Switching to table view - syncing with processed editor content');

      if (viewRef.current) {
        const currentEditorContent = viewRef.current.state?.doc?.toString();
        if (currentEditorContent && currentEditorContent !== processedContent) {
          console.log('Processed editor content differs from state, updating...');
          setProcessedContent(currentEditorContent);
          const newParsed = parseContent(currentEditorContent);
          setProcessedParsedEntries(newParsed);
          setUpdateCounter((prev) => prev + 1);
        }
      }
    }
  }, [viewMode, currentView, processedContent]);

  useEffect(() => {
    const handleBibEntryImport = (event: Event) => {
      const customEvent = event as CustomEvent;
      const { entry, filePath } = customEvent.detail;

      if (filePath !== fileInfo.filePath) return;

      const sourceContent = currentView === 'processed' && processedContent.trim()
        ? processedContent
        : bibtexContent;

      let newContent: string;

      if (entry.action === 'delete') {
        const escapedKey = entry.key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`@\\w+\\s*\\{\\s*${escapedKey}\\s*,[^]*?\\n\\s*\\}\\s*`, 'm');
        newContent = sourceContent.replace(regex, '').replace(/\n{3,}/g, '\n\n').trim();
      } else if (entry.action === 'update') {
        const oldKey = (entry.oldKey || entry.key).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const newKey = entry.key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regexOld = new RegExp(`@\\w+\\s*\\{\\s*${oldKey}\\s*,[^]*?\\n\\s*\\}`, 'm');
        const regexNew = new RegExp(`@\\w+\\s*\\{\\s*${newKey}\\s*,[^]*?\\n\\s*\\}`, 'm');
        const regex = regexOld.test(sourceContent) ? regexOld : regexNew;
        if (!regex.test(sourceContent)) return;
        newContent = sourceContent.replace(regex, entry.rawEntry.trim());
      } else {
        newContent = sourceContent.trim()
          ? `${sourceContent.trim()}\n\n${entry.rawEntry.trim()}\n`
          : `${entry.rawEntry.trim()}\n`;
      }

      // If result is empty (e.g. deleted last entry), apply directly to original
      if (!newContent.trim()) {
        setBibtexContent('');
        setProcessedContent('');
        setProcessedParsedEntries([]);
        setCurrentView('original');
        onUpdateContent('');
        if (viewRef.current) {
          viewRef.current.dispatch({
            changes: { from: 0, to: viewRef.current.state.doc.length, insert: '' }
          });
        }
        setHasChanges(true);
        return;
      }

      setProcessedContent(newContent);
      setProcessedParsedEntries(parseContent(newContent));
      setCurrentView('processed');

      if (currentView === 'processed' && viewRef.current) {
        const changes = TextDiffUtils.computeChanges(sourceContent, newContent);
        if (changes.length > 0) {
          viewRef.current.dispatch({
            changes: changes
          });
        }
      }

      setUpdateCounter((prev) => prev + 1);
      setHasChanges(true);
    };

    document.addEventListener('bib-entry-imported', handleBibEntryImport);

    return () => {
      document.removeEventListener('bib-entry-imported', handleBibEntryImport);
    };
  }, [currentView, bibtexContent, processedContent, fileInfo.filePath]);

  const processBibtexWithOptions = async (
    input: string,
    tidyOptions: TidyOptions) => {
    if (!input) return;
    setIsProcessing(true);
    setError(null);
    setWarnings([]);
    try {
      const result = await tidy(input, tidyOptions);
      setProcessedContent(result.bibtex);
      setProcessedParsedEntries(parseContent(result.bibtex));
      setWarnings(result.warnings || []);
      setHasChanges(true);
      if (autoTidy) setCurrentView('processed');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t('Failed to process BibTeX file')
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const processBibtex = async () => {
    await processBibtexWithOptions(bibtexContent, options);
    setCurrentView('processed');
  };

  const handleSaveProcessed = async () => {
    if (!fileId || currentView !== 'processed') return;

    const currentEditorContent = viewRef.current?.state?.doc?.toString() || '';
    const contentToSave = currentEditorContent.trim() ?
      currentEditorContent :
      processedContent;
    if (!contentToSave.trim()) return;

    setIsSaving(true);
    setError(null);

    try {
      await fileStorageService.updateFileContent(fileId, contentToSave);

      const changes = TextDiffUtils.computeChanges(bibtexContent, contentToSave);

      if (viewRef.current && changes.length > 0) {
        setCurrentView('original');

        await new Promise(resolve => setTimeout(resolve, 100));

        const originalView = viewRef.current;

        if (originalView && originalView.state) {
          try {
            originalView.dispatch({
              changes: changes
            });
          } catch (e) {
            console.warn('Range error during diff dispatch, replacing full content:', e);
            const docLength = originalView.state.doc.length;
            if (docLength > 0) {
              originalView.dispatch({
                changes: { from: 0, to: docLength, insert: contentToSave }
              });
            } else {
              // Doc is empty after view switch — wait for Yjs to sync, then replace
              await new Promise(resolve => setTimeout(resolve, 200));
              const syncedLength = originalView.state.doc.length;
              originalView.dispatch({
                changes: { from: 0, to: syncedLength, insert: contentToSave }
              });
            }
          }
        }
      } else {
        setCurrentView('original');
      }

      initialContentRef.current = contentToSave;
      setBibtexContent(contentToSave);
      setProcessedContent('');
      setProcessedParsedEntries([]);
      setHasChanges(false);

      onUpdateContent(contentToSave);

    } catch (e) {
      console.error('Error saving processed BibTeX file:', e);
      setError(
        `Failed to save file: ${e instanceof Error ? e.message : 'Unknown error'}`
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleExport = (text: string, suffix = '') => {
    try {
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${fileName.replace(/\.bib$/i, '') + suffix}.bib`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Error exporting file:', e);
      setError(
        `Failed to export file: ${e instanceof Error ? e.message : 'Unknown error'}`
      );
    }
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.key === 's' && currentView === 'processed') {
        event.preventDefault();
        handleSaveProcessed();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [currentView, handleSaveProcessed]);

  const displayContent =
    currentView === 'original' ? bibtexContent : processedContent;

  const tooltipInfo = [
    t('Auto-tidy: {status}', { status: autoTidy ? t('enabled') : t('disabled') }),
    t('Preset: {preset}', { preset: tidyPreset }),
    t('Entries: {count}', { count: bibtexContent.split('@').length - 1 }),
    t('Collaborative Mode: Active'),
    t('MIME Type: {mimeType}', { mimeType: fileInfo.mimeType || 'text/x-bibtex' }),
    t('Size: {size}', { size: formatFileSize(fileInfo.fileSize) })
  ];

  const headerControls =
    <>
      <PluginControlGroup>
        <button
          className={`${showSidebar ? 'active' : ''}`}
          onClick={() => setShowSidebar(!showSidebar)}
          title={t('Toggle Options Panel')}>

          <OptionsIcon />
        </button>
        {currentView === 'processed' &&
          <button
            className={`${viewMode === 'table' ? 'active' : ''}`}
            onClick={() => setViewMode(viewMode === 'editor' ? 'table' : 'editor')}
            title={t(`Switch to {viewMode}`, {
              viewMode: viewMode === 'editor' ? t('Table View') : t('Editor View')
            })}>

            <ViewIcon />
          </button>
        }
      </PluginControlGroup>

      <PluginControlGroup>
        {currentView === 'original' &&
          <button
            onClick={() => {
              document.dispatchEvent(
                new CustomEvent('trigger-save', {
                  detail: { documentId, isFile: false }
                })
              );
            }}
            title={t('Save Document (Ctrl+S)')}
            className="control-button">

            <SaveIcon />
          </button>
        }
        {fileId && currentView === 'processed' &&
          <button
            onClick={handleSaveProcessed}
            title={t('Save Processed to Original')}
            disabled={isSaving || !processedContent.trim()}>

            <SaveIcon />
          </button>
        }
        <button
          onClick={() =>
            handleExport(
              displayContent,
              currentView === 'original' ? '_original' : '_tidied'
            )
          }
          title={t('Download Current View')}>

          <DownloadIcon />
        </button>
      </PluginControlGroup>

      {hasPluginToggles &&
        <PluginControlGroup>
          {availableLSPPlugins.map((plugin) =>
            <LSPToggleButton
              key={plugin.id}
              pluginId={plugin.id}
              className="header-lsp-button" />
          )}
          {availableBibPlugins.map((plugin) =>
            <LSPToggleButton
              key={plugin.id}
              pluginId={plugin.id}
              className="header-lsp-button" />
          )}
        </PluginControlGroup>
      }
    </>;


  return (
    <BibliographyProvider>
      <div className="bibtex-viewer-container">
        <PluginHeader
          fileName={fileInfo.fileName}
          filePath={fileInfo.filePath}
          pluginName={PLUGIN_NAME}
          pluginVersion={PLUGIN_VERSION}
          tooltipInfo={tooltipInfo}
          controls={headerControls}
          onNavigateToLinkedFile={() => {
            if (fileId && fileInfo.filePath) {
              document.dispatchEvent(
                new CustomEvent('navigate-to-linked-file', {
                  detail: {
                    filePath: fileInfo.filePath,
                    fileId: fileId
                  }
                })
              );
            }
          }}
          linkedFileInfo={{
            fileName: fileInfo.fileName,
            filePath: fileInfo.filePath,
            fileId: fileId
          }}
          awareness={awareness}
        />


        <div className="bibtex-viewer-main">
          {showSidebar &&
            <TidyOptionsPanel
              options={options}
              onOptionsChange={setOptions}
              onResetToDefaults={() => setOptions(getPresetOptions('standard'))}
              onProcessBibtex={processBibtex}
              isProcessing={isProcessing} />

          }

          <div className="bibtex-content-area">
            {error && <div className="bib-error-message">{error}</div>}

            {warnings.length > 0 &&
              <div className="warnings-container">
                <h5>{t('Warnings: ')}</h5>
                {warnings.map((w, i) =>
                  <div key={i} className="warning-item">
                    {(w as { message: string; }).message}
                  </div>
                )}
              </div>
            }

            <div className="editor-containers">
              <div className="editor-container" style={{ position: 'relative' }}>
                <div className="editor-header">
                  <div className="view-tabs">
                    <button
                      className={`tab-button ${currentView === 'original' ? 'active' : ''}`}
                      onClick={() => setCurrentView('original')}>{t('Original')}


                    </button>
                    <button
                      className={`tab-button ${currentView === 'processed' ? 'active' : ''}`}
                      onClick={() => setCurrentView('processed')}
                      disabled={!processedContent.trim()}>{t('Processed')}


                    </button>
                  </div>
                  {currentView === 'processed' && processedContent.trim() &&
                    <div className="processed-save-notice">
                      <Trans
                        i18nKey="Not saved automatically. Click the <icon /> <strong>Save</strong> button or <strong>Ctrl+S</strong>"
                        components={{
                          strong: <strong />,
                          icon: <> <SaveIcon /> {' '} </>
                        }}
                      />
                    </div>
                  }
                  {isProcessing &&
                    <span className="processing-indicator">{t('(Processing...)')}</span>
                  }
                  {isSaving && currentView === 'processed' &&
                    <span className="processing-indicator">{t('(Saving...)')}</span>
                  }
                </div>

                <div
                  ref={editorRef}
                  className="codemirror-editor-container"
                  style={{
                    display: currentView === 'processed' && viewMode === 'table' ? 'none' : 'block'
                  }} />


                {currentView === 'processed' && viewMode === 'table' &&
                  <BibtexTableView
                    key={`processed-${updateCounter}`}
                    entries={processedParsedEntries}
                    onEntriesChange={handleTableEntryUpdate}
                    onSingleEntryChange={handleSingleTableEntryUpdate} />

                }

                {showSaveIndicator && currentView === 'original' &&
                  <div className="save-indicator">
                    <span>{t('Saved')}</span>
                  </div>
                }
              </div>
            </div>
          </div>

          <BibliographyPanel className="editor-lsp-panel" />

        </div>
      </div>
    </BibliographyProvider>);

};

export default BibtexCollaborativeViewer;
