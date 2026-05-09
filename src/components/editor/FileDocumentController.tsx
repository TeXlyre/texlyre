// src/components/editor/FileDocumentController.tsx
import { t } from '@/i18n';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { IndexeddbPersistence } from 'y-indexeddb';
import * as Y from 'yjs';

import { useAuth } from '../../hooks/useAuth';
import { useFileTree } from '../../hooks/useFileTree';
import { useProperties } from '../../hooks/useProperties';
import { useTheme } from '../../hooks/useTheme';
import { useEditorTabs } from '../../hooks/useEditorTabs';
import { pluginRegistry } from '../../plugins/PluginRegistry';
import { fileStorageService } from '../../services/FileStorageService';
import { popoutViewerService } from '../../services/PopoutViewerService';
import type { Document } from '../../types/documents';
import type { FileNode } from '../../types/files';
import type { Project } from '../../types/projects';
import {
  isLatexFile,
  isTypstFile,
  isLatexContent,
  isTypstContent
} from '../../utils/fileUtils';
import {
  buildUrlWithFragments,
  parseUrlFragments
} from '../../utils/urlUtils';
import { gotoEditor } from '../../utils/editorNavigator';
import type { YjsDocUrl } from '../../types/yjs';
import { EditorTabsProvider } from '../../contexts/EditorTabsContext';
import { SearchProvider } from '../../contexts/SearchContext';
import ResizablePanel from '../common/ResizablePanel';
import EditorTabs from './EditorTabs';
import LaTeXOutline from './LaTeXOutline';
import TypstOutline from './TypstOutline';
import LaTeXOutput from '../output/LaTeXOutput';
import TypstOutput from '../output/TypstOutput';
import ProjectExportModal from '../project/ProjectExportModal';
import DocumentExplorer from './DocumentExplorer';
import Editor from './Editor';
import FileExplorer from './FileExplorer';
import SearchPanel from './SearchPanel';

type LinkedFileInfo = {
  fileName: string;
  filePath: string;
  fileId: string;
  mimeType?: string;
};

type LinkedFileInfoState = Partial<LinkedFileInfo>;

interface FileDocumentControllerProps {
  documents: Document[];
  selectedDocId: string | null;
  onSelectDocument: (id: string) => void;
  onCreateDocument: () => void;
  onRenameDocument: (id: string, newName: string) => void;
  onUpdateContent: (content: string) => void;
  content: string;
  docUrl: YjsDocUrl;
  targetDocId?: string | null;
  targetFilePath?: string | null;
}

const getDocumentContent = async (
  projectUrl: string,
  docId: string
): Promise<string> => {
  const projectId = projectUrl.startsWith('yjs:')
    ? projectUrl.slice(4)
    : projectUrl;

  const dbName = `texlyre-project-${projectId}`;
  const docCollection = `${dbName}-yjs_${docId}`;

  try {
    const docYDoc = new Y.Doc();
    const docPersistence = new IndexeddbPersistence(docCollection, docYDoc);

    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        resolve();
      }, 2000);

      docPersistence.once('synced', () => {
        clearTimeout(timeout);
        resolve();
      });
    });

    const textContent = docYDoc.getText('codemirror').toString();

    docPersistence.destroy();
    docYDoc.destroy();

    return textContent;
  } catch (error) {
    console.error('Error getting document content:', error);
    return '';
  }
};

const findFileByPath = (
  nodes: FileNode[],
  path: string
): FileNode | null => {
  for (const node of nodes) {
    if (node.path === path && node.type === 'file') {
      return node;
    }

    if (node.children) {
      const found = findFileByPath(node.children, path);
      if (found) return found;
    }
  }

  return null;
};

const getExpandPaths = (filePath: string): string[] => {
  const expandPaths: string[] = [];
  const pathSegments = filePath.split('/').filter(Boolean);
  let currentPath = '';

  for (let i = 0; i < pathSegments.length - 1; i++) {
    currentPath =
      currentPath === ''
        ? `/${pathSegments[i]}`
        : `${currentPath}/${pathSegments[i]}`;

    expandPaths.push(currentPath);
  }

  return expandPaths;
};

const FileDocumentControllerContent: React.FC<FileDocumentControllerProps> = ({
  documents,
  selectedDocId,
  onSelectDocument,
  onCreateDocument,
  onRenameDocument,
  onUpdateContent,
  content,
  docUrl,
  targetDocId,
  targetFilePath
}) => {
  const { selectedFileId, getFile, fileTree, selectFile, getFileContent } =
    useFileTree();

  const { currentLayout } = useTheme();
  const { getProjectById, updateProject } = useAuth();
  const { getProperty, setProperty, registerProperty } = useProperties();
  const { openTab, tabs } = useEditorTabs();

  const [projectType, setProjectType] = useState<'latex' | 'typst'>('latex');
  const propertiesRegistered = useRef(false);
  const [propertiesLoaded, setPropertiesLoaded] = useState(false);
  const [activeView, setActiveView] = useState<'documents' | 'files' | 'search'>(
    'files'
  );
  const lastOpenedFilePathRef = useRef<string | null>(null);
  const lastOpenedDocIdRef = useRef<string | null>(null);
  const [fileContent, setFileContent] = useState<string | ArrayBuffer>('');
  const [currentEditorContent, setCurrentEditorContent] = useState<string>('');
  const [isEditingFile, setIsEditingFile] = useState(false);
  const [isBinaryFile, setIsBinaryFile] = useState(false);
  const isViewerHandledRef = useRef(false);
  const [bootstrapResolved, setBootstrapResolved] = useState(false);
  const [currentFilePath, setCurrentFilePath] = useState<string | undefined>();
  const [fileName, setFileName] = useState('');
  const [isFileLoading, setIsFileLoading] = useState(false);
  const [mimeType, setMimeType] = useState<string | undefined>();
  const [linkedDocumentId, setLinkedDocumentId] = useState<string | null>(null);
  const [linkedFileInfo, setLinkedFileInfo] = useState<LinkedFileInfoState>({});
  const [currentLine, setCurrentLine] = useState(1);

  const [sidebarWidth, setSidebarWidth] = useState(
    currentLayout?.defaultFileExplorerWidth || 250
  );
  const [showOutline, setShowOutline] = useState(false);
  const [explorerHeight, setOutlineHeight] = useState(600);
  const [latexOutputWidth, setLatexOutputWidth] = useState(550);
  const [typstOutputWidth, setTypstOutputWidth] = useState(550);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [latexOutputCollapsed, setLatexOutputCollapsed] = useState(false);
  const [typstOutputCollapsed, setTypstOutputCollapsed] = useState(false);
  const [showLatexOutput, setShowLatexOutput] = useState(false);
  const [showTypstOutput, setShowTypstOutput] = useState(false);
  const [temporaryLatexExpand, setTemporaryLatexExpand] = useState(false);
  const [temporaryTypstExpand, setTemporaryTypstExpand] = useState(false);
  const [toolbarVisible, setToolbarVisible] = useState(true);
  const [documentSelectionChange, setDocumentSelectionChange] = useState(0);
  const [fileSelectionChange, setFileSelectionChange] = useState(0);
  const [initialSelectedFile, setInitialSelectedFile] = useState<
    string | undefined
  >();
  const [initialExpandedPaths, setInitialExpandedPaths] = useState<
    string[] | undefined
  >();

  const docToFileMapRef = useRef<Map<string, LinkedFileInfo>>(new Map());
  const [docToFileMapReady, setDocToFileMapReady] = useState(false);
  const [showCurrentProjectExportModal, setShowCurrentProjectExportModal] =
    useState(false);
  const [currentProjectForExport, setCurrentProjectForExport] =
    useState<Project | null>(null);

  const selectFileInExplorer = (file: FileNode | LinkedFileInfo) => {
    const fileId = 'fileId' in file ? file.fileId : file.id;
    const filePath = 'filePath' in file ? file.filePath : file.path;

    setInitialSelectedFile(fileId);
    setInitialExpandedPaths(getExpandPaths(filePath));
  };

  const setOutputForFileName = (name?: string) => {
    if (name && isLatexFile(name)) {
      setShowLatexOutput(true);
      setShowTypstOutput(false);
    } else if (name && isTypstFile(name)) {
      setShowTypstOutput(true);
      setShowLatexOutput(false);
    } else {
      setShowLatexOutput(false);
      setShowTypstOutput(false);
    }
  };

  const createTabForFile = (file: FileNode) => {
    openTab({
      title: file.name,
      type: 'file',
      fileId: file.id,
      filePath: file.path
    });
  };

  const createTabForDocument = (documentId: string, document: Document) => {
    openTab({
      title: document.name,
      type: 'document',
      documentId
    });
  };

  const openDocumentById = (docId: string, view: 'documents' | 'files', preserveView = false) => {
    const document = documents.find((doc) => doc.id === docId);
    if (!document) return;

    lastOpenedDocIdRef.current = docId;
    lastOpenedFilePathRef.current = docToFileMapRef.current.get(docId)?.filePath ?? null;

    if (!preserveView) {
      setActiveView(view);
    }

    setIsEditingFile(false);
    onSelectDocument(docId);
    setDocumentSelectionChange((prev) => prev + 1);
    createTabForDocument(docId, document);

    const linkedFile = docToFileMapRef.current.get(docId);

    if (linkedFile) {
      setLinkedFileInfo(linkedFile);
      setLinkedDocumentId(docId);
      setOutputForFileName(linkedFile.fileName);

      if (view === 'files' && !preserveView) {
        selectFileInExplorer(linkedFile);
      }
    } else {
      setLinkedFileInfo({});
      setLinkedDocumentId(null);
      setOutputForFileName(undefined);
    }
  };

  const handleFileSelect = async (
    file: FileNode,
    loadedContent: string | ArrayBuffer,
    isBinary = false
  ) => {
    flushSync(() => {
      setIsFileLoading(true);
    });

    selectFile(file.id);

    isViewerHandledRef.current = !!pluginRegistry.getViewerForFile(
      file.name,
      file.mimeType
    );

    flushSync(() => {
      setFileContent(loadedContent);
      setFileName(file.name);
      setMimeType(file.mimeType);
      setIsBinaryFile(isBinary || isViewerHandledRef.current);
      setLinkedDocumentId(file.documentId || null);
      setCurrentFilePath(file.path);
      setCurrentEditorContent(
        typeof loadedContent === 'string' ? loadedContent : ''
      );
      setIsEditingFile(true);
      setFileSelectionChange((prev) => prev + 1);
    });

    setIsFileLoading(false);

    if (selectedDocId !== null) {
      onSelectDocument('');
    }

    setOutputForFileName(file.name);
    createTabForFile(file);
  };

  const openFileByNode = async (file: FileNode, preserveView = false) => {
    const loadedContent = await getFileContent(file.id);
    if (!loadedContent) return;

    lastOpenedFilePathRef.current = file.path;
    lastOpenedDocIdRef.current = null;

    if (!preserveView) {
      setActiveView('files');
      selectFileInExplorer(file);
    }

    await handleFileSelect(file, loadedContent, file.isBinary || false);
  };

  const updateProjectLastOpened = async (docId?: string, filePath?: string) => {
    const projectId = sessionStorage.getItem('currentProjectId');
    if (!projectId) return;

    try {
      const project = await getProjectById(projectId);
      if (!project) return;

      const nextDocId = docId ?? null;
      const nextFilePath = filePath ?? null;

      if (
        nextDocId === (project.lastOpenedDocId ?? null) &&
        nextFilePath === (project.lastOpenedFilePath ?? null)
      ) {
        return;
      }

      updateProject({
        ...project,
        lastOpenedDocId: nextDocId,
        lastOpenedFilePath: nextFilePath,
      }).catch((error) => {
        console.warn('Failed to update project last opened state:', error);
      });
    } catch (error) {
      console.warn('Error updating project last opened state:', error);
    }
  };

  const pushEditorRoute = (docId?: string, filePath?: string) => {
    const currentFragment = parseUrlFragments(window.location.hash.substring(1));
    const newUrl = buildUrlWithFragments(
      currentFragment.yjsUrl,
      docId,
      filePath
    );

    window.location.hash = newUrl.startsWith('#') ? newUrl.slice(1) : newUrl;
    updateProjectLastOpened(docId, filePath);
  };

  const handleExportCurrentProject = async (projectId: string) => {
    try {
      const project = await getProjectById(projectId);
      if (project) {
        setCurrentProjectForExport(project);
        setShowCurrentProjectExportModal(true);
      }
    } catch (error) {
      console.error('Error loading project for export:', error);
    }
  };

  useEffect(() => {
    if (propertiesRegistered.current) return;
    propertiesRegistered.current = true;

    registerProperty({
      id: 'sidebar-width',
      category: 'UI',
      subcategory: 'Layout',
      defaultValue: currentLayout?.defaultFileExplorerWidth || 250
    });

    registerProperty({
      id: 'latex-output-width',
      category: 'UI',
      subcategory: 'Layout',
      defaultValue: latexOutputWidth
    });

    registerProperty({
      id: 'typst-output-width',
      category: 'UI',
      subcategory: 'Layout',
      defaultValue: typstOutputWidth
    });

    registerProperty({
      id: 'sidebar-collapsed',
      category: 'UI',
      subcategory: 'Layout',
      defaultValue: false
    });

    registerProperty({
      id: 'latex-output-collapsed',
      category: 'UI',
      subcategory: 'Layout',
      defaultValue: false
    });

    registerProperty({
      id: 'typst-output-collapsed',
      category: 'UI',
      subcategory: 'Layout',
      defaultValue: false
    });

    registerProperty({
      id: 'explorer-height',
      category: 'UI',
      subcategory: 'Layout',
      defaultValue: explorerHeight
    });

    registerProperty({
      id: 'toolbar-visible',
      category: 'UI',
      subcategory: 'Editor',
      defaultValue: true
    });
  }, [registerProperty]);

  useEffect(() => {
    if (propertiesLoaded) return;

    const storedSidebarWidth = getProperty('sidebar-width');
    const storedLatexWidth = getProperty('latex-output-width');
    const storedTypstWidth = getProperty('typst-output-width');
    const storedSidebarCollapsed = getProperty('sidebar-collapsed');
    const storedLatexCollapsed = getProperty('latex-output-collapsed');
    const storedTypstCollapsed = getProperty('typst-output-collapsed');
    const storedOutlineHeight = getProperty('explorer-height');
    const storedToolbarVisible = getProperty('toolbar-visible');

    if (storedSidebarWidth !== undefined) {
      setSidebarWidth(Number(storedSidebarWidth));
    }

    if (storedLatexWidth !== undefined) {
      setLatexOutputWidth(Number(storedLatexWidth));
    }

    if (storedTypstWidth !== undefined) {
      setTypstOutputWidth(Number(storedTypstWidth));
    }

    if (storedSidebarCollapsed !== undefined) {
      setSidebarCollapsed(Boolean(storedSidebarCollapsed));
    }

    if (storedLatexCollapsed !== undefined) {
      setLatexOutputCollapsed(Boolean(storedLatexCollapsed));
    }

    if (storedTypstCollapsed !== undefined) {
      setTypstOutputCollapsed(Boolean(storedTypstCollapsed));
    }

    if (storedOutlineHeight !== undefined) {
      setOutlineHeight(Number(storedOutlineHeight));
    }

    if (storedToolbarVisible !== undefined) {
      setToolbarVisible(Boolean(storedToolbarVisible));
    }

    setPropertiesLoaded(true);
  }, [getProperty, propertiesLoaded]);

  useEffect(() => {
    const loadProjectType = async () => {
      const projectId = sessionStorage.getItem('currentProjectId');
      if (!projectId) return;

      const project = await getProjectById(projectId);
      if (project) {
        setProjectType(project.type || 'latex');
      }
    };

    loadProjectType();
  }, [getProjectById]);

  useEffect(() => {
    const handleCursorUpdate = (event: Event) => {
      const customEvent = event as CustomEvent;
      if (customEvent.detail && typeof customEvent.detail.line === 'number') {
        setCurrentLine(customEvent.detail.line);
      }
    };

    document.addEventListener('editor-cursor-update', handleCursorUpdate);

    return () => {
      document.removeEventListener('editor-cursor-update', handleCursorUpdate);
    };
  }, []);

  useEffect(() => {
    const buildDocToFileMap = async () => {
      const allFiles = await fileStorageService.getAllFiles(false, false, false);
      const map = new Map<string, LinkedFileInfo>();

      for (const file of allFiles) {
        if (file.documentId) {
          map.set(file.documentId, {
            fileName: file.name,
            filePath: file.path,
            fileId: file.id,
            mimeType: file.mimeType
          });
        }
      }

      docToFileMapRef.current = map;
      setDocToFileMapReady(true);
    };

    buildDocToFileMap();

    document.addEventListener('refresh-file-tree', buildDocToFileMap);
    document.addEventListener('file-saved', buildDocToFileMap);

    return () => {
      document.removeEventListener('refresh-file-tree', buildDocToFileMap);
      document.removeEventListener('file-saved', buildDocToFileMap);
    };
  }, []);

  useEffect(() => {
    const handleOpenSearchPanel = () => {
      setActiveView('search');
    };

    document.addEventListener('open-search-panel', handleOpenSearchPanel);

    return () => {
      document.removeEventListener('open-search-panel', handleOpenSearchPanel);
    };
  }, []);

  useEffect(() => {
    const handleNavigateToLinkedFile = async (event: Event) => {
      const customEvent = event as CustomEvent;
      const { filePath, fileId } = customEvent.detail;

      if (!filePath || !fileId) return;

      const file = await getFile(fileId);
      if (!file) return;

      if (file.documentId) {
        openDocumentById(file.documentId, 'files');
        pushEditorRoute(file.documentId, file.path);
        return;
      }

      await openFileByNode(file);
      pushEditorRoute(undefined, file.path);
    };

    const handleNavigateToCompiledFile = async (event: Event) => {
      const customEvent = event as CustomEvent;
      const { filePath } = customEvent.detail;

      if (!filePath) return;

      const targetFile = findFileByPath(fileTree, filePath);
      if (!targetFile) return;

      if (targetFile.documentId) {
        openDocumentById(targetFile.documentId, 'files');
        pushEditorRoute(targetFile.documentId, targetFile.path);
        return;
      }

      await openFileByNode(targetFile);
      pushEditorRoute(undefined, targetFile.path);
    };

    document.addEventListener(
      'navigate-to-linked-file',
      handleNavigateToLinkedFile
    );
    document.addEventListener(
      'navigate-to-compiled-file',
      handleNavigateToCompiledFile
    );
    document.addEventListener('expand-latex-output', handleLatexOutputExpand);
    document.addEventListener('expand-typst-output', handleTypstOutputExpand);

    return () => {
      document.removeEventListener(
        'navigate-to-linked-file',
        handleNavigateToLinkedFile
      );
      document.removeEventListener(
        'navigate-to-compiled-file',
        handleNavigateToCompiledFile
      );
      document.removeEventListener(
        'expand-latex-output',
        handleLatexOutputExpand
      );
      document.removeEventListener(
        'expand-typst-output',
        handleTypstOutputExpand
      );
    };
  }, [
    showLatexOutput,
    showTypstOutput,
    fileTree,
    isEditingFile,
    selectedFileId
  ]);

  useEffect(() => {
    if (!selectedFileId || !isEditingFile) return;

    const loadFileData = async () => {
      const file = await getFile(selectedFileId);
      if (!file) return;
      if (file.path === currentFilePath) return;

      setFileName(file.name);
      setMimeType(file.mimeType);
      setLinkedDocumentId(file.documentId || null);
      setCurrentFilePath(file.path);
      setOutputForFileName(file.name);
    };

    loadFileData();
  }, [selectedFileId, isEditingFile, getFile, currentFilePath]);

  useEffect(() => {
    if (!docToFileMapReady) return;

    if (isEditingFile) {
      setLinkedFileInfo({});
      return;
    }

    if (!selectedDocId) return;

    const linkedFile = docToFileMapRef.current.get(selectedDocId);

    if (linkedFile) {
      setLinkedFileInfo(linkedFile);
      setLinkedDocumentId(selectedDocId);
      setOutputForFileName(linkedFile.fileName);
    } else {
      setLinkedFileInfo({});
      setLinkedDocumentId(null);
      setOutputForFileName(undefined);
    }
  }, [selectedDocId, isEditingFile, docToFileMapReady]);

  useEffect(() => {
    if (!docToFileMapReady) return;
    if (!targetDocId) {
      setBootstrapResolved(true);
      return;
    }
    if (lastOpenedDocIdRef.current === targetDocId) {
      setBootstrapResolved(true);
      return;
    }

    openDocumentById(targetDocId, targetFilePath ? 'files' : 'documents');
    setBootstrapResolved(true);
  }, [targetDocId, targetFilePath, docToFileMapReady]);

  useEffect(() => {
    if (!docToFileMapReady) return;
    if (targetDocId) return;
    if (!targetFilePath) {
      setBootstrapResolved(true);
      return;
    }
    if (fileTree.length === 0) return;
    if (lastOpenedFilePathRef.current === targetFilePath) {
      setBootstrapResolved(true);
      return;
    }

    const navigate = async () => {
      const targetFile = findFileByPath(fileTree, targetFilePath);
      if (!targetFile) {
        setBootstrapResolved(true);
        return;
      }
      await openFileByNode(targetFile);
      setBootstrapResolved(true);
    };

    navigate();
  }, [targetDocId, targetFilePath, docToFileMapReady, fileTree.length]);

  useEffect(() => {
    const handleDocumentLinked = (event: Event) => {
      const customEvent = event as CustomEvent;
      const { documentId } = customEvent.detail;

      if (documentId) {
        openDocumentById(documentId, 'documents');
      }
    };

    document.addEventListener('document-linked', handleDocumentLinked);

    return () => {
      document.removeEventListener('document-linked', handleDocumentLinked);
    };
  }, [documents, docToFileMapReady]);

  useEffect(() => {
    const isTexFile = isEditingFile && fileName && isLatexFile(fileName);
    const isTypFile = isEditingFile && fileName && isTypstFile(fileName);
    const isDocumentLinkedToTex =
      !isEditingFile &&
      linkedFileInfo?.fileName &&
      isLatexFile(linkedFileInfo.fileName);
    const isDocumentLinkedToTyp =
      !isEditingFile &&
      linkedFileInfo?.fileName &&
      isTypstFile(linkedFileInfo.fileName);
    const hasLatexContent =
      !isEditingFile &&
      !linkedFileInfo?.fileName &&
      content &&
      isLatexContent(content);
    const hasTypstContent =
      !isEditingFile &&
      !linkedFileInfo?.fileName &&
      content &&
      isTypstContent(content);

    setShowOutline(
      Boolean(
        isTexFile ||
        isTypFile ||
        isDocumentLinkedToTex ||
        isDocumentLinkedToTyp ||
        hasLatexContent ||
        hasTypstContent
      )
    );
  }, [isEditingFile, fileName, linkedFileInfo?.fileName, content]);

  useEffect(() => {
    if (isEditingFile) {
      if (typeof fileContent === 'string') {
        setCurrentEditorContent(fileContent);
      } else if (fileContent instanceof ArrayBuffer) {
        try {
          setCurrentEditorContent(new TextDecoder().decode(fileContent));
        } catch {
          setCurrentEditorContent('');
        }
      } else {
        setCurrentEditorContent('');
      }
    } else {
      setCurrentEditorContent(content || '');
    }
  }, [isEditingFile, content, fileContent]);

  const handleCreateDocument = (name: string) => {
    onCreateDocument();

    const lastDoc = documents[documents.length - 1];
    if (!lastDoc) return '';

    onRenameDocument(lastDoc.id, name);
    return lastDoc.id;
  };

  const handleOutlineSectionClick = (line: number) => {
    gotoEditor(null, { line });
  };

  const handleOutlineRefresh = async () => {
    if (!isEditingFile || !selectedFileId) return;

    try {
      const refreshedContent = await getFileContent(selectedFileId);
      if (!refreshedContent) return;

      if (typeof refreshedContent === 'string') {
        setCurrentEditorContent(refreshedContent);
      } else if (refreshedContent instanceof ArrayBuffer) {
        try {
          setCurrentEditorContent(new TextDecoder().decode(refreshedContent));
        } catch {
          setCurrentEditorContent('');
        }
      }
    } catch (error) {
      console.error('Error refreshing file content for outline:', error);
    }
  };

  const handleUserFileSelect = async (fileId: string) => {
    const file = await getFile(fileId);
    if (!file) return;

    if (file.documentId) {
      openDocumentById(file.documentId, 'files');
      pushEditorRoute(file.documentId, file.path);
      return;
    }

    await openFileByNode(file);
    pushEditorRoute(undefined, file.path);
  };

  const handleDocumentSelect = (id: string) => {
    openDocumentById(id, 'files');

    const linkedFile = docToFileMapRef.current.get(id);
    pushEditorRoute(id, linkedFile?.filePath);
  };

  const handleUserDocumentSelect = (id: string) => {
    openDocumentById(id, 'documents');
    pushEditorRoute(id, undefined);
  };

  const handleSwitchToDocuments = () => {
    setActiveView('documents');
  };

  const handleSwitchToFiles = () => {
    setActiveView('files');
  };

  const handleTabSwitch = async (tabId: string) => {
    const targetTab = tabs.find((tab) => tab.id === tabId);
    if (!targetTab) return;

    if (targetTab.type === 'document' && targetTab.documentId) {
      openDocumentById(targetTab.documentId, 'documents');
      pushEditorRoute(targetTab.documentId, undefined);
      return;
    }

    if (targetTab.type === 'file' && targetTab.fileId) {
      const file = await getFile(targetTab.fileId);
      if (!file) return;

      if (file.documentId) {
        openDocumentById(file.documentId, 'files');
        pushEditorRoute(file.documentId, file.path);
        return;
      }

      await openFileByNode(file);
      pushEditorRoute(undefined, file.path);
    }
  };

  const handleUpdateContent = (newContent: string) => {
    if (!isEditingFile) return;

    if (newContent !== fileContent) {
      onUpdateContent(newContent);
    }
  };

  const handleSidebarResize = (width: number) => {
    setSidebarWidth(width);
    setProperty('sidebar-width', width);
  };

  const handleSidebarCollapse = (collapsed: boolean) => {
    setSidebarCollapsed(collapsed);
    setProperty('sidebar-collapsed', collapsed);
  };

  const handleExplorerResize = (height: number) => {
    setOutlineHeight(height);
    setProperty('explorer-height', height);
  };

  const handleLatexOutputWidthResize = (width: number) => {
    setLatexOutputWidth(width);
    setProperty('latex-output-width', width);
  };

  const handleLatexOutputCollapse = (collapsed: boolean) => {
    setLatexOutputCollapsed(collapsed);
    setProperty('latex-output-collapsed', collapsed);

    if (collapsed) {
      setTemporaryLatexExpand(false);
    }
  };

  const handleLatexOutputExpand = () => {
    if (!showLatexOutput) {
      setShowLatexOutput(true);
    }

    setTemporaryLatexExpand(true);
  };

  const handleTypstOutputWidthResize = (width: number) => {
    setTypstOutputWidth(width);
    setProperty('typst-output-width', width);
  };

  const handleTypstOutputCollapse = (collapsed: boolean) => {
    setTypstOutputCollapsed(collapsed);
    setProperty('typst-output-collapsed', collapsed);

    if (collapsed) {
      setTemporaryTypstExpand(false);
    }
  };

  const handleTypstOutputExpand = () => {
    if (!showTypstOutput) {
      setShowTypstOutput(true);
    }

    setTemporaryTypstExpand(true);
  };

  const handleToolbarToggle = (visible: boolean) => {
    setToolbarVisible(visible);
    setProperty('toolbar-visible', visible);
  };

  const handleNavigateToLinkedFile = () => {
    if (!linkedFileInfo?.filePath) return;

    document.dispatchEvent(
      new CustomEvent('navigate-to-linked-file', {
        detail: {
          filePath: linkedFileInfo.filePath,
          fileId: linkedFileInfo.fileId
        }
      })
    );
  };

  return (
    <div className="main-content">
      <ResizablePanel
        direction="horizontal"
        width={sidebarWidth}
        minWidth={currentLayout?.minFileExplorerWidth || 200}
        maxWidth={currentLayout?.maxFileExplorerWidth || 500}
        onResize={handleSidebarResize}
        collapsed={sidebarCollapsed}
        onCollapse={handleSidebarCollapse}
        className="sidebar-container"
      >
        <ResizablePanel
          direction="vertical"
          height={explorerHeight}
          minHeight={350}
          maxHeight="90%"
          alignment="end"
          onResize={handleExplorerResize}
          collapsible={false}
          maintainAlignment={true}
          className="explorer-container"
        >
          <div className="view-toggle">
            <button
              className={activeView === 'files' ? 'active' : ''}
              onClick={handleSwitchToFiles}
            >
              {t('Files')}
            </button>

            <button
              className={activeView === 'documents' ? 'active' : ''}
              onClick={handleSwitchToDocuments}
            >
              {t('Docs')}
            </button>

            <button
              className={activeView === 'search' ? 'active' : ''}
              onClick={() => setActiveView('search')}
            >
              {t('Search')}
            </button>
          </div>

          {activeView === 'search' ? (
            <SearchPanel
              onNavigateToResult={async (
                fileId,
                line,
                column,
                documentId,
                isLinkedDocument,
              ) => {
                if (line === undefined) return;

                if (isLinkedDocument && documentId) {
                  if (!(await getFile(fileId))) return;
                  openDocumentById(documentId, 'files', true);
                  gotoEditor({ kind: 'document', documentId }, { line, column }, { waitForReady: true });
                  return;
                }

                const file = await getFile(fileId);
                if (!file) return;

                if (file.documentId) {
                  openDocumentById(file.documentId, 'files', true);
                  gotoEditor(
                    { kind: 'document', documentId: file.documentId },
                    { line, column },
                    { waitForReady: true },
                  );
                  return;
                }

                await openFileByNode(file, true);
                gotoEditor({ kind: 'file', fileId: file.id }, { line, column }, { waitForReady: true });
              }}
            />
          ) : activeView === 'documents' ? (
            <DocumentExplorer
              documents={documents}
              selectedDocId={selectedDocId}
              onSelectDocument={handleUserDocumentSelect}
              onCreateDocument={onCreateDocument}
              onRenameDocument={onRenameDocument}
              onUpdateContent={onUpdateContent}
              content={content}
              docUrl={docUrl}
              getDocumentContent={getDocumentContent}
            />
          ) : (
            <FileExplorer
              onFileSelect={handleUserFileSelect}
              onOpenDocument={handleDocumentSelect}
              onCreateDocument={handleCreateDocument}
              documents={documents.map((doc) => ({
                id: Number.parseInt(doc.id, 36),
                name: doc.name
              }))}
              initialSelectedFile={initialSelectedFile}
              initialExpandedPaths={initialExpandedPaths}
              currentProjectId={sessionStorage.getItem('currentProjectId')}
              onExportCurrentProject={handleExportCurrentProject}
              projectType={projectType}
            />
          )}
        </ResizablePanel>

        {showOutline &&
          (() => {
            const isTypFile =
              (isEditingFile && isTypstFile(fileName)) ||
              (!isEditingFile && isTypstFile(linkedFileInfo?.filePath)) ||
              (!isEditingFile &&
                !linkedFileInfo?.filePath &&
                isTypstContent(currentEditorContent));

            const isTexFile =
              (isEditingFile && isLatexFile(fileName)) ||
              (!isEditingFile && isLatexFile(linkedFileInfo?.filePath)) ||
              (!isEditingFile &&
                !linkedFileInfo?.filePath &&
                isLatexContent(currentEditorContent));

            if (isTexFile) {
              return (
                <LaTeXOutline
                  content={currentEditorContent}
                  currentLine={currentLine}
                  onSectionClick={handleOutlineSectionClick}
                  onRefresh={handleOutlineRefresh}
                  linkedFileInfo={linkedFileInfo}
                  currentFilePath={currentFilePath}
                  isEditingFile={isEditingFile}
                />
              );
            }

            if (isTypFile) {
              return (
                <TypstOutline
                  content={currentEditorContent}
                  currentLine={currentLine}
                  onSectionClick={handleOutlineSectionClick}
                  onRefresh={handleOutlineRefresh}
                  linkedFileInfo={linkedFileInfo}
                  currentFilePath={currentFilePath}
                  isEditingFile={isEditingFile}
                />
              );
            }

            return null;
          })()}
      </ResizablePanel>

      <div
        className="editor-container-outer"
        style={{ flex: 1, display: 'flex', minHeight: 0 }}
      >
        <div
          className="editor-container"
          style={{ flex: 1, minWidth: 0, position: 'relative' }}
        >
          <EditorTabs onTabSwitch={handleTabSwitch} />

          {!bootstrapResolved ? (
            <div className="file-loading-overlay">
              <div className="loading-spinner" />
            </div>
          ) : (
            <Editor
              content={isEditingFile ? fileContent : content}
              documentId={selectedDocId || ''}
              onUpdateContent={handleUpdateContent}
              isDocumentSelected={bootstrapResolved && (isEditingFile || !!selectedDocId)}
              isBinaryFile={isEditingFile && isBinaryFile}
              fileName={isEditingFile ? fileName : linkedFileInfo.fileName}
              mimeType={isEditingFile ? mimeType : linkedFileInfo.mimeType}
              fileId={
                isEditingFile ? selectedFileId || '' : linkedFileInfo.fileId || ''
              }
              docUrl={docUrl}
              documentSelectionChange={
                isEditingFile ? fileSelectionChange : documentSelectionChange
              }
              isEditingFile={isEditingFile}
              onSelectDocument={handleDocumentSelect}
              onSwitchToDocuments={handleSwitchToDocuments}
              linkedDocumentId={
                isEditingFile
                  ? linkedDocumentId
                  : linkedFileInfo.fileName
                    ? selectedDocId
                    : null
              }
              documents={documents}
              linkedFileInfo={linkedFileInfo}
              toolbarVisible={toolbarVisible}
              onToolbarToggle={handleToolbarToggle}
            />
          )}
        </div>

        {isFileLoading && (
          <div className="file-loading-overlay">
            <div className="loading-spinner" />
          </div>
        )}

        {showLatexOutput && (
          <ResizablePanel
            direction="horizontal"
            width={latexOutputWidth}
            minWidth={540}
            maxWidth="80%"
            alignment="start"
            onResize={handleLatexOutputWidthResize}
            collapsed={latexOutputCollapsed && !temporaryLatexExpand}
            onCollapse={handleLatexOutputCollapse}
            className="latex-output-container"
          >
            <LaTeXOutput
              selectedDocId={selectedDocId}
              documents={documents}
              onNavigateToLinkedFile={handleNavigateToLinkedFile}
              onExpandLatexOutput={
                popoutViewerService.isWindowOpen()
                  ? undefined
                  : handleLatexOutputExpand
              }
              linkedFileInfo={linkedFileInfo}
            />
          </ResizablePanel>
        )}

        {showTypstOutput && (
          <ResizablePanel
            direction="horizontal"
            width={typstOutputWidth}
            minWidth={540}
            maxWidth="80%"
            alignment="start"
            onResize={handleTypstOutputWidthResize}
            collapsed={typstOutputCollapsed && !temporaryTypstExpand}
            onCollapse={handleTypstOutputCollapse}
            className="typst-output-container"
          >
            <TypstOutput
              selectedDocId={selectedDocId}
              documents={documents}
              onNavigateToLinkedFile={handleNavigateToLinkedFile}
              onExpandTypstOutput={
                popoutViewerService.isWindowOpen()
                  ? undefined
                  : handleTypstOutputExpand
              }
              linkedFileInfo={linkedFileInfo}
            />
          </ResizablePanel>
        )}
      </div>

      {showCurrentProjectExportModal && currentProjectForExport && (
        <ProjectExportModal
          isOpen={showCurrentProjectExportModal}
          onClose={() => setShowCurrentProjectExportModal(false)}
          selectedProjects={[currentProjectForExport]}
        />
      )}
    </div>
  );
};

const FileDocumentController: React.FC<FileDocumentControllerProps> = (props) => {
  return (
    <SearchProvider>
      <EditorTabsProvider>
        <FileDocumentControllerContent {...props} />
      </EditorTabsProvider>
    </SearchProvider>
  );
};

export default FileDocumentController;