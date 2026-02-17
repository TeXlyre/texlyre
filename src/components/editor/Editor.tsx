// src/components/editor/Editor.tsx
import { t } from '@/i18n';
import { Trans } from 'react-i18next';
import type React from 'react';
import { useCallback, useEffect, useRef, useMemo, useState } from 'react';

import { BibliographyProvider } from '../../contexts/BibliographyContext';
import { CommentProvider } from '../../contexts/CommentContext';
import { processComments } from '../../extensions/codemirror/CommentExtension';
import { useEditorView } from '../../hooks/editor/useEditorView';
import { useCollab } from '../../hooks/useCollab';
import { useComments } from '../../hooks/useComments';
import { usePluginFileInfo } from '../../hooks/usePluginFileInfo';
import type {
  CollaborativeViewerProps,
  ViewerProps
} from
  '../../plugins/PluginInterface';
import { pluginRegistry } from '../../plugins/PluginRegistry';
import { fileStorageService } from '../../services/FileStorageService';
import { collabService } from '../../services/CollabService';
import type { DocumentList } from '../../types/documents';
import { buildUrlWithFragments, parseUrlFragments } from '../../utils/urlUtils';
import { copyCleanTextToClipboard } from '../../utils/clipboardUtils';
import { processTextSelection } from '../../utils/fileCommentUtils';
import { isBibFile } from '../../utils/fileUtils';
import { formatDate } from '../../utils/dateUtils';
import { arrayBufferToString, detectFileType, formatFileSize, isLatexFile, isTypstFile } from '../../utils/fileUtils';
import { TextDiffUtils } from '../../utils/textDiffUtils';
import CommentPanel from '../comments/CommentPanel';
import CommentToggleButton from '../comments/CommentToggleButton';
import LSPToggleButton from '../bibliography/LSPToggleButton';
import BibliographyPanel from '../bibliography/BibliographyPanel';
import CommentModal from '../comments/CommentModal';
import ContentFormatterButton from './ContentFormatterButton';
import {
  CopyIcon,
  DownloadIcon,
  FileTextIcon,
  LinkIcon,
  SaveIcon,
  ToolbarShowIcon
} from
  '../common/Icons';
import { PluginControlGroup, PluginHeader } from '../common/PluginHeader';
import UnlinkedDocumentNotice from './UnlinkedDocumentNotice';

interface EditorComponentProps {
  content: string | ArrayBuffer;
  documentId: string;
  onUpdateContent: (content: string) => void;
  isDocumentSelected: boolean;
  isBinaryFile?: boolean;
  fileName?: string;
  mimeType?: string;
  fileId?: string;
  docUrl: string;
  documentSelectionChange?: number;
  isEditingFile?: boolean;
  onSelectDocument?: (docId: string) => void;
  onSwitchToDocuments?: () => void;
  linkedDocumentId?: string | null;
  documents?: Array<{ id: string; name: string; }>;
  linkedFileInfo?: {
    fileName?: string;
    mimeType?: string;
    fileId?: string;
    filePath?: string;
  };
  toolbarVisible?: boolean;
  onToolbarToggle?: (visible: boolean) => void;
}

function getPluginToggleButtons(fileTypeOrExt: string | undefined) {
  if (!fileTypeOrExt) return { lsp: [], bib: [] };
  return {
    lsp: pluginRegistry.getLSPPluginsForFileType(fileTypeOrExt),
    bib: pluginRegistry.getBibliographyPlugins().filter(p =>
      p.getSupportedFileTypes().includes(fileTypeOrExt)
    ),
  };
}

const EditorContent: React.FC<{
  editorRef: React.RefObject<HTMLDivElement>;
  textContent: string;
  onUpdateContent: (content: string) => void;
  documentId: string;
  docUrl: string;
  isDocumentSelected: boolean;
  isEditingFile?: boolean;
  isViewOnly?: boolean;
  linkedDocumentId?: string | null;
  onDocumentNavigation?: () => void;
  fileName?: string;
  fileId?: string;
  filePath?: string;
  onSave?: () => void;
  onExport?: (getCurrentContent?: () => string) => void;
  linkedFileInfo?: {
    fileName?: string;
    filePath?: string;
    fileId?: string;
  } | null;
  onNavigateToLinkedFile?: () => void;
  documents?: Array<{ id: string; name: string; }>;
  shouldShowLatexOutput?: boolean;
  onSaveDocument?: () => void;
  onSelectDocument?: (docId: string) => void;
  toolbarVisible?: boolean;
  onToolbarToggle?: (visible: boolean) => void;
}> = ({
  editorRef,
  textContent,
  onUpdateContent,
  documentId,
  docUrl,
  isDocumentSelected,
  isEditingFile,
  isViewOnly,
  linkedDocumentId,
  onDocumentNavigation,
  fileName,
  fileId,
  filePath,
  onSave,
  onExport,
  linkedFileInfo,
  onNavigateToLinkedFile,
  documents,
  shouldShowLatexOutput,
  onSaveDocument,
  onSelectDocument,
  toolbarVisible = true,
  onToolbarToggle,
}) => {
    const [showUnlinkedNotice, setShowUnlinkedNotice] = useState(false);
    const { parseComments, getCommentAtPosition, addComment, updateComments } =
      useComments();
    const fileInfo = usePluginFileInfo(fileId, fileName);
    const { data: doc, changeData: changeDoc } = useCollab<DocumentList>();
    const { viewRef, isUpdatingRef, showSaveIndicator } = useEditorView(
      editorRef,
      docUrl,
      documentId,
      isDocumentSelected,
      textContent,
      onUpdateContent,
      parseComments,
      addComment,
      updateComments,
      isEditingFile,
      isViewOnly,
      fileName,
      fileId,
      true,
      toolbarVisible
    );

    const projectId = useMemo(() => {
      const hash = docUrl.split(':').pop() || '';
      return hash;
    }, [docUrl]);

    const editorCollectionName = useMemo(() => `yjs_${documentId}`, [documentId]);

    const awareness = useMemo(() => {
      if (!isDocumentSelected || isEditingFile) return null;
      return collabService.getAwareness(projectId, editorCollectionName);
    }, [isDocumentSelected, isEditingFile, projectId, editorCollectionName]);

    useEffect(() => {
      if (isDocumentSelected && textContent) {
        updateComments(textContent);
      }
    }, [textContent, isDocumentSelected, updateComments]);

    useEffect(() => {
      if (shouldShowLatexOutput) {
        document.dispatchEvent(new CustomEvent('show-latex-output'));
      }
    }, [shouldShowLatexOutput]);

    const handleContentChanged = useCallback(
      (event: Event) => {
        const customEvent = event as CustomEvent;
        if (customEvent.detail && customEvent.detail.view === viewRef.current) {
          const editorContent = customEvent.detail.content;
          updateComments(editorContent);
          const comments = parseComments(editorContent);
          processComments(viewRef.current!, comments);
        }
      },
      [parseComments, updateComments, viewRef]
    );

    useEffect(() => {
      let timeoutId: NodeJS.Timeout;

      if (
        !isEditingFile &&
        documentId &&
        !linkedFileInfo?.fileName &&
        documents) {
        timeoutId = setTimeout(() => {
          setShowUnlinkedNotice(true);
        }, 250);
      } else {
        setShowUnlinkedNotice(false);
      }

      return () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      };
    }, [isEditingFile, documentId, linkedFileInfo?.fileName, documents]);

    useEffect(() => {
      document.addEventListener(
        'codemirror-content-changed',
        handleContentChanged
      );

      return () => {
        document.removeEventListener(
          'codemirror-content-changed',
          handleContentChanged
        );
      };
    }, [handleContentChanged]);

    useEffect(() => {
      const handleAddCommentToEditor = (event: Event) => {
        const customEvent = event as CustomEvent;
        if (!viewRef.current || isViewOnly) return;

        const { content, selection } = customEvent.detail;
        if (content && selection && selection.from !== selection.to) {
          try {
            const rawComment = addComment(content) as any;
            if (rawComment?.openTag && rawComment.closeTag) {
              viewRef.current.dispatch({
                changes: [
                  { from: selection.to, insert: rawComment.closeTag },
                  { from: selection.from, insert: rawComment.openTag }]

              });
              updateComments(viewRef.current.state.doc.toString());
            }
          } catch (error) {
            console.error('Error adding comment:', error);
          }
        }
      };

      document.addEventListener('add-comment-to-editor', handleAddCommentToEditor);

      return () => {
        document.removeEventListener('add-comment-to-editor', handleAddCommentToEditor);
      };
    }, [viewRef, isViewOnly, addComment, updateComments]);

    useEffect(() => {
      const handleTriggerFormat = async (event: Event) => {
        const customEvent = event as CustomEvent;
        const { contentType, fileId: eventFileId, documentId: eventDocId } = customEvent.detail;

        const isTarget = isEditingFile && eventFileId === fileId ||
          !isEditingFile && eventDocId === documentId;

        if (isTarget && viewRef.current) {
          const currentContent = viewRef.current.state.doc.toString();

          document.dispatchEvent(
            new CustomEvent('request-format', {
              detail: { content: currentContent, contentType }
            })
          );
        }
      };

      document.addEventListener('trigger-format', handleTriggerFormat);

      return () => {
        document.removeEventListener('trigger-format', handleTriggerFormat);
      };
    }, [isEditingFile, fileId, documentId, viewRef]);

    const handleFormattedContent = (formatted: string) => {
      if (!viewRef.current) return;

      const currentContent = viewRef.current.state.doc.toString();

      if (currentContent === formatted) {
        return;
      }

      if (isEditingFile) {
        const changes = TextDiffUtils.computeChanges(currentContent, formatted);
        if (changes.length > 0) {
          viewRef.current.dispatch({
            changes: changes
          });
        }
      } else if (!isEditingFile && documentId && changeDoc) {
        const changes = TextDiffUtils.computeChanges(currentContent, formatted);
        if (changes.length > 0) {
          viewRef.current.dispatch({
            changes: changes
          });
        }
      }
    };

    const tooltipInfo =
      isEditingFile && fileName ?
        [
          t(`File: {fileName}`, { fileName }),
          t(`Path: {path}`, { path: filePath || fileInfo.filePath }),
          t(`Mode: {mode}`, { mode: isViewOnly ? t('Read-only') : t('Editing') }),
          linkedDocumentId ? t(`Linked to document: {documentId}`, { documentId: linkedDocumentId }) : '',
          t(`MIME Type: {mimeType}`, { mimeType: fileInfo.mimeType || 'text/plain' }),
          t(`Size: {size}`, { size: formatFileSize(fileInfo.fileSize) }),
          t(`Last Modified: {lastModified}`, { lastModified: fileInfo.lastModified ? formatDate(fileInfo.lastModified) : t('Unknown') })
        ] :

        !isEditingFile && documentId && documents ?
          [
            t(`Document: {documentName}`, { documentName: documents.find((d) => d.id === documentId)?.name || t('Untitled') }),
            linkedFileInfo ? t(`Linked File: {fileName}`, { fileName: linkedFileInfo.fileName }) : '',
            linkedFileInfo ?
              t(`Path: {path}`, { path: linkedFileInfo.filePath }) :
              t('No linked file'),
            t(`Mode: Collaborative editing`),
            t(`Type: Text document`)
          ] :

          '';

    const handleCopyLinkedFile = async () => {
      if (!linkedFileInfo?.fileId) return;
      try {
        const file = await fileStorageService.getFile(linkedFileInfo.fileId);
        if (file?.content) {
          const content =
            typeof file.content === 'string' ?
              file.content :
              new TextDecoder().decode(file.content);
          await copyCleanTextToClipboard(content);
        }
      } catch (error) {
        console.error('Error copying linked file:', error);
      }
    };

    const handleDownloadLinkedFile = async () => {
      if (!linkedFileInfo?.fileId || !linkedFileInfo.fileName) return;
      try {
        const file = await fileStorageService.getFile(linkedFileInfo.fileId);
        if (file?.content) {
          const content =
            typeof file.content === 'string' ?
              file.content :
              new TextDecoder().decode(file.content);
          const cleanedContent = processTextSelection(content);
          const blob = new Blob([cleanedContent], {
            type: 'text/plain;charset=utf-8'
          });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = linkedFileInfo.fileName;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }
      } catch (error) {
        console.error('Error downloading linked file:', error);
      }
    };

    const fileType = detectFileType(filePath || '');
    const { lsp: availableLSPPlugins, bib: availableBibPlugins } = getPluginToggleButtons(fileType);
    const hasPluginToggles = availableLSPPlugins.length > 0 || availableBibPlugins.length > 0;

    const headerControls =
      isEditingFile && fileName ?
        <>
          {(isLatexFile(filePath) || isTypstFile(filePath)) && !isViewOnly &&
            <PluginControlGroup>
              <button
                onClick={() => onToolbarToggle?.(!toolbarVisible)}
                title={toolbarVisible ? t('Hide Toolbar') : t('Show Toolbar')}
                className={`control-button ${toolbarVisible ? 'active' : ''}`}>
                <ToolbarShowIcon />
              </button>

              <ContentFormatterButton
                getCurrentContent={() => viewRef.current?.state.doc.toString() || ''}
                contentType={fileType}
                onFormat={handleFormattedContent} />

            </PluginControlGroup>
          }

          <PluginControlGroup>
            {!isViewOnly && onSave &&
              <button
                onClick={onSave}
                title={t('Save File (Ctrl+S)')}
                className="control-button">

                <SaveIcon />
              </button>
            }
            <button
              onClick={() => {
                const content = viewRef.current?.state.doc.toString() || textContent;
                copyCleanTextToClipboard(content);
              }}
              title={t('Copy Text')}
              className="control-button">

              <CopyIcon />
            </button>
            {onExport &&
              <button
                onClick={() => onExport?.(() => viewRef.current?.state.doc.toString() || '')}
                title={t('Download File')}
                className="control-button">

                <DownloadIcon />
              </button>
            }
          </PluginControlGroup>

          <PluginControlGroup>
            {!isViewOnly &&
              <CommentToggleButton className="header-comment-button" />
            }
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
        </> :
        !isEditingFile && linkedFileInfo && !showUnlinkedNotice ?
          <>
            {(isLatexFile(linkedFileInfo.filePath) || isTypstFile(linkedFileInfo.filePath)) && !isViewOnly &&
              <PluginControlGroup>
                <button
                  onClick={() => onToolbarToggle?.(!toolbarVisible)}
                  title={toolbarVisible ? t('Hide Toolbar') : t('Show Toolbar')}
                  className={`control-button ${toolbarVisible ? 'active' : ''}`}>
                  <ToolbarShowIcon />
                </button>

                <ContentFormatterButton
                  getCurrentContent={() => viewRef.current?.state.doc.toString() || ''}
                  contentType={detectFileType(linkedFileInfo.filePath)}
                  onFormat={handleFormattedContent} />

              </PluginControlGroup>
            }
            <PluginControlGroup>
              {onSaveDocument &&
                <button
                  onClick={onSaveDocument}
                  title={t('Save document to linked file (Ctrl+S)')}
                  className="control-button">

                  <SaveIcon />
                </button>
              }
              <button
                onClick={handleCopyLinkedFile}
                title={t(`Copy text from linked file: {fileName}`, { fileName: linkedFileInfo.fileName })}
                className="control-button">

                <CopyIcon />
              </button>
              <button
                onClick={handleDownloadLinkedFile}
                title={t(`Download linked file: {fileName}`, { fileName: linkedFileInfo.fileName })}
                className="control-button">

                <DownloadIcon />
              </button>
            </PluginControlGroup>

            <PluginControlGroup>
              {!isViewOnly &&
                <CommentToggleButton className="header-comment-button" />
              }
            </PluginControlGroup>
            {linkedFileInfo?.fileName && (() => {
              const linkedFileExtension = linkedFileInfo.fileName.split('.').pop()?.toLowerCase();
              const { lsp: linkedLSPPlugins, bib: linkedBibPlugins } = getPluginToggleButtons(linkedFileExtension);
              const hasLinkedPlugins = linkedLSPPlugins.length > 0 || linkedBibPlugins.length > 0;

              return hasLinkedPlugins &&
                <PluginControlGroup>
                  {linkedLSPPlugins.map((plugin) =>
                    <LSPToggleButton
                      key={plugin.id}
                      pluginId={plugin.id}
                      className="header-lsp-button" />
                  )}
                  {linkedBibPlugins.map((plugin) =>
                    <LSPToggleButton
                      key={plugin.id}
                      pluginId={plugin.id}
                      className="header-lsp-button" />
                  )}
                </PluginControlGroup>;

            })()}
          </> :
          !isEditingFile && documentId && documents ?
            <>
              <PluginControlGroup>
                <button
                  onClick={() => {
                    const content = viewRef.current?.state.doc.toString() || textContent;
                    copyCleanTextToClipboard(content);
                  }}
                  title={t('Copy Text')}
                  className="control-button">

                  <CopyIcon />
                </button>
              </PluginControlGroup>

              <PluginControlGroup>
                {!isViewOnly &&
                  <CommentToggleButton className="header-comment-button" />
                }
              </PluginControlGroup>

              {textContent?.includes('\\') && (() => {
                const { lsp: texLSPPlugins, bib: texBibPlugins } = getPluginToggleButtons('tex');
                const hasTexPlugins = texLSPPlugins.length > 0 || texBibPlugins.length > 0;

                return hasTexPlugins &&
                  <PluginControlGroup>
                    {texLSPPlugins.map((plugin) =>
                      <LSPToggleButton
                        key={plugin.id}
                        pluginId={plugin.id}
                        className="header-lsp-button" />
                    )}
                    {texBibPlugins.map((plugin) =>
                      <LSPToggleButton
                        key={plugin.id}
                        pluginId={plugin.id}
                        className="header-lsp-button" />
                    )}
                  </PluginControlGroup>;

              })()}
            </> :
            null;

    return (
      <>
        {(isEditingFile && fileName ||
          !isEditingFile && documentId && documents) &&
          <PluginHeader
            fileName={
              isEditingFile ?
                fileInfo.fileName :
                documents?.find((d) => d.id === documentId)?.name || 'Document'
            }
            filePath={
              isEditingFile ?
                filePath || fileInfo.filePath :
                linkedFileInfo?.filePath
            }
            pluginName={isEditingFile ? 'Text Editor' : 'Document Editor'}
            pluginVersion="1.0.0"
            tooltipInfo={tooltipInfo}
            controls={headerControls}
            onNavigateToLinkedFile={
              !isEditingFile && linkedFileInfo ?
                onNavigateToLinkedFile :
                undefined
            }
            linkedFileInfo={!isEditingFile ? linkedFileInfo : null}
            awareness={awareness}
          />

        }

        <div className="editor-toolbar">
          {isViewOnly && linkedDocumentId &&
            <div className="linked-file-notice">
              <span>{t('Read-only: This file is linked to a collaborative document')}
                {' '}
              </span>
              <div className="linked-file-actions">
                <button
                  className="link-button"
                  onClick={onDocumentNavigation}
                  title={t('Navigate to linked document')}>

                  <FileTextIcon />{t('View linked doc')}

                </button>
              </div>
            </div>
          }

          {showUnlinkedNotice &&
            <UnlinkedDocumentNotice
              documentId={documentId}
              documentName={
                documents.find((d) => d.id === documentId)?.name || 'Untitled'
              }
              projectType={doc?.projectMetadata?.type || 'latex'}
              onDeleteDocument={(docId) => {
                if (!changeDoc) {
                  console.error(
                    'Cannot delete document: changeData not available'
                  );
                  return;
                }

                changeDoc((data) => {
                  if (!data.documents) return;

                  const docIndex = data.documents.findIndex(
                    (d) => d.id === docId
                  );
                  if (docIndex >= 0) {
                    data.documents.splice(docIndex, 1);
                  }

                  if (data.currentDocId === docId) {
                    data.currentDocId =
                      data.documents.length > 0 ? data.documents[0].id : '';
                  }
                });

                const remainingDocs = documents.filter((d) => d.id !== docId);
                if (remainingDocs.length > 0 && onSelectDocument) {
                  const newSelectedId = remainingDocs[0].id;
                  onSelectDocument(newSelectedId);
                  const currentFragment = parseUrlFragments(
                    window.location.hash.substring(1)
                  );
                  const newUrl = buildUrlWithFragments(
                    currentFragment.yjsUrl,
                    newSelectedId
                  );
                  window.location.hash = newUrl;
                } else if (onSelectDocument) {
                  onSelectDocument('');
                  const currentFragment = parseUrlFragments(
                    window.location.hash.substring(1)
                  );
                  const newUrl = buildUrlWithFragments(currentFragment.yjsUrl);
                  window.location.hash = newUrl;
                }
              }}
              onDocumentLinked={() => {
                window.location.reload();
              }} />

          }
        </div>

        <div className="editor-main-container">
          <div
            className="editor-wrapper"
            style={{ flex: 1, position: 'relative' }}>

            <div ref={editorRef} className="codemirror-editor-container" />

            {showSaveIndicator &&
              <div className={`save-indicator ${isViewOnly ? 'read-only' : ''}`}>
                <span>{isViewOnly ? t('Cannot Save Read-Only') : t('Saved')}</span>
              </div>
            }
          </div>

          {!isViewOnly && <CommentPanel className="editor-comment-panel" />}
          {!isViewOnly && <BibliographyPanel className="editor-lsp-panel" />}
        </div>
      </>);

  };

const Editor: React.FC<EditorComponentProps> = ({
  content,
  documentId,
  onUpdateContent,
  isDocumentSelected,
  isBinaryFile = false,
  fileName = '',
  mimeType,
  fileId = '',
  docUrl,
  documentSelectionChange = 0,
  isEditingFile = false,
  onSelectDocument,
  onSwitchToDocuments,
  linkedDocumentId,
  documents,
  linkedFileInfo,
  toolbarVisible = true,
  onToolbarToggle,
}) => {
  const [textContent, setTextContent] = useState<string>('');
  const [filePath, setFilePath] = useState<string>('');
  const [showCommentModal, setShowCommentModal] = useState(false);
  const [pendingSelection, setPendingSelection] = useState<{ from: number; to: number; } | null>(null);

  const editorRef = useRef<HTMLDivElement>(null);
  const isUpdatingRef = useRef<boolean>(false);

  useEffect(() => {
    const handleShowCommentModal = (event: Event) => {
      const customEvent = event as CustomEvent;
      const { selection } = customEvent.detail;
      if (selection && selection.from !== selection.to) {
        setPendingSelection(selection);
        setShowCommentModal(true);
      }
    };

    document.addEventListener('show-comment-modal', handleShowCommentModal);

    return () => {
      document.removeEventListener('show-comment-modal', handleShowCommentModal);
    };
  }, []);

  const handleCommentSubmit = (content: string) => {
    if (!pendingSelection) return;

    document.dispatchEvent(
      new CustomEvent('add-comment-to-editor', {
        detail: { content, selection: pendingSelection }
      })
    );

    setPendingSelection(null);
  };

  const handleCommentModalClose = () => {
    setShowCommentModal(false);
    setPendingSelection(null);

    document.dispatchEvent(new CustomEvent('comment-modal-closed'));
  };


  const handleNavigateToLinkedFile = () => {
    if (linkedFileInfo?.filePath) {
      document.dispatchEvent(
        new CustomEvent('navigate-to-linked-file', {
          detail: {
            filePath: linkedFileInfo.filePath,
            fileId: linkedFileInfo.fileId
          }
        })
      );
    }
  };

  useEffect(() => {
    if (content instanceof ArrayBuffer) {
      setTextContent(arrayBufferToString(content));
    } else if (typeof content === 'string') {
      setTextContent(content);
    } else {
      setTextContent('');
    }
  }, [content]);

  useEffect(() => {
    const loadFilePath = async () => {
      if (isEditingFile && fileId) {
        try {
          const file = await fileStorageService.getFile(fileId);
          if (file) {
            setFilePath(file.path);

            if (isBibFile(file.path)) {
              document.dispatchEvent(new CustomEvent('bib-file-opened', {
                detail: { filePath: file.path }
              }));
            }
          }
        } catch (error) {
          console.error('Error loading file path:', error);
        }
      }
    };

    loadFilePath();
  }, [isEditingFile, fileId]);

  const handleDocumentNavigation = useCallback(() => {
    if (linkedDocumentId && onSelectDocument && onSwitchToDocuments) {
      onSwitchToDocuments();
      onSelectDocument(linkedDocumentId);
    }
  }, [linkedDocumentId, onSelectDocument, onSwitchToDocuments]);

  const handleSave = async () => {
    if (!fileId || !isEditingFile) return;

    if (editorRef.current) {
      document.dispatchEvent(
        new CustomEvent('trigger-save', {
          detail: { fileId, isFile: true }
        })
      );
    }
  };

  const handleSaveDocument = () => {
    if (!isEditingFile && documentId) {
      if (editorRef.current) {
        document.dispatchEvent(
          new CustomEvent('trigger-save', {
            detail: { documentId, isFile: false }
          })
        );
      }
    }
  };

  const handleExport = (getCurrentContent?: () => string) => {
    if (!fileName) return;

    try {
      const currentContent = getCurrentContent ? getCurrentContent() : textContent;
      const cleanedText = processTextSelection(currentContent);
      const blob = new Blob([cleanedText], {
        type: 'text/plain;charset=utf-8'
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error exporting file:', error);
    }
  };

  const shouldUseCollaborativeViewer =
    !isEditingFile && fileName && linkedDocumentId;

  const collaborativeViewerPlugin = useMemo(() => {
    if (!shouldUseCollaborativeViewer) return null;
    return pluginRegistry.getCollaborativeViewerForFile(fileName, mimeType);
  }, [shouldUseCollaborativeViewer, fileName, mimeType]);

  const viewerPlugin =
    isEditingFile && fileName && !linkedDocumentId ?
      pluginRegistry.getViewerForFile(fileName, mimeType) :
      null;

  if (
    collaborativeViewerPlugin &&
    !isEditingFile &&
    shouldUseCollaborativeViewer) {
    const CollaborativeViewerComponent = collaborativeViewerPlugin.renderViewer;

    return (
      <BibliographyProvider>
        <CommentProvider
          editorContent={textContent}
          onUpdateContent={onUpdateContent}>

          <div className="editor-container viewer-container collaborative-viewer">
            <div className="viewer-plugin-info">
              <span>{t('Collaborative viewing with')}
                {collaborativeViewerPlugin.name} v
                {collaborativeViewerPlugin.version}
              </span>
            </div>
            <CollaborativeViewerComponent
              fileId={fileId}
              content={content as ArrayBuffer}
              mimeType={mimeType}
              fileName={fileName}
              docUrl={docUrl}
              documentId={documentId}
              isDocumentSelected={isDocumentSelected}
              onUpdateContent={onUpdateContent}
              parseComments={(text: string) => {
                const { parseComments } = useComments();
                return parseComments(text);
              }}
              addComment={(content: string) => {
                const { addComment } = useComments();
                return addComment(content);
              }}
              updateComments={(content: string) => {
                const { updateComments } = useComments();
                updateComments(content);
              }} />

          </div>
          <CommentModal
            isOpen={showCommentModal}
            onClose={handleCommentModalClose}
            onCommentSubmit={handleCommentSubmit} />

        </CommentProvider>
      </BibliographyProvider>);

  }

  if (viewerPlugin && isEditingFile) {
    const ViewerComponent = viewerPlugin.renderViewer;
    const viewerProps: ViewerProps = {
      fileId,
      content: content as ArrayBuffer,
      mimeType,
      fileName
    };

    return (
      <div className="editor-container viewer-container">
        <div className="viewer-plugin-info">
          <span>{t('Viewing with')}&nbsp;
            {viewerPlugin.name} v{viewerPlugin.version}
          </span>
        </div>
        <ViewerComponent {...viewerProps} />
      </div>);

  }

  if (isBinaryFile) {
    return (
      <div className="editor-container binary-file">
        <div className="binary-file-message">
          <h3>{t('Binary File')}</h3>
          <p>{t('This file cannot be edited in the text editor.')}</p>
          <p>{t('Please download the file to view or edit its contents.')}</p>
        </div>
      </div>);

  }

  if (!isDocumentSelected) {
    return (
      <div className="editor-container empty-state">
        <p>{t('Select a file or create a new one to start editing.')}</p>

        <br />
        <br />
        <br />
        <br />

        <p style={{ fontStyle: 'italic' }}>
          <Trans
            i18nKey="Linking files allows you to view the cursor positions and text changes by your collaborators in real-time. To link a text file to a document, select or hover over the file and click the <icon /> <strong>Link</strong> button that appears next to it."
            components={{
              strong: <strong />,
              icon: <> <LinkIcon /> {' '}</>
            }}
          />
        </p>
      </div>);

  }

  const isViewOnly =
    isEditingFile && linkedDocumentId && !collaborativeViewerPlugin;

  const handleContentUpdate = (newContent: string) => {
    if (!isUpdatingRef.current && !isViewOnly) {
      onUpdateContent(newContent);
    }
  };

  const shouldShowLatexOutput =
    !isEditingFile && isLatexFile(linkedFileInfo?.filePath);

  return (
    <BibliographyProvider>
      <CommentProvider
        editorContent={textContent}
        onUpdateContent={handleContentUpdate}>

        <div className="editor-container">
          <EditorContent
            editorRef={editorRef}
            textContent={textContent}
            onUpdateContent={onUpdateContent}
            documentId={documentId}
            docUrl={docUrl}
            isDocumentSelected={isDocumentSelected}
            isEditingFile={isEditingFile}
            isViewOnly={isViewOnly}
            linkedDocumentId={linkedDocumentId}
            onDocumentNavigation={handleDocumentNavigation}
            fileName={fileName}
            fileId={fileId}
            filePath={filePath}
            onSave={handleSave}
            onExport={handleExport}
            onSaveDocument={handleSaveDocument}
            linkedFileInfo={linkedFileInfo}
            onNavigateToLinkedFile={handleNavigateToLinkedFile}
            documents={documents}
            shouldShowLatexOutput={shouldShowLatexOutput}
            onSelectDocument={onSelectDocument}
            toolbarVisible={toolbarVisible && !isViewOnly}
            onToolbarToggle={onToolbarToggle} />

        </div>
        <CommentModal
          isOpen={showCommentModal}
          onClose={handleCommentModalClose}
          onCommentSubmit={handleCommentSubmit} />

      </CommentProvider>
    </BibliographyProvider>);

};

export default Editor