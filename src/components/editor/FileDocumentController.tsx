// src/components/editor/FileDocumentController.tsx
import { t } from '@/i18n';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { IndexeddbPersistence } from 'y-indexeddb';
import * as Y from 'yjs';

import { useAuth } from '../../hooks/useAuth';
import { useFileTree } from '../../hooks/useFileTree';
import { useSearch } from '../../hooks/useSearch';
import { useProperties } from '../../hooks/useProperties';
import { useTheme } from '../../hooks/useTheme';
import { useEditorTabs } from '../../hooks/useEditorTabs';
import {
  fileStorageEventEmitter,
  fileStorageService
} from
  '../../services/FileStorageService';
import { pdfWindowService } from '../../services/PdfWindowService';
import type { Document } from '../../types/documents';
import type { FileNode } from '../../types/files';
import type { Project } from '../../types/projects';
import { buildUrlWithFragments, parseUrlFragments } from '../../utils/urlUtils';
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
  docId: string)
  : Promise<string> => {
  const projectId = projectUrl.startsWith('yjs:') ?
    projectUrl.slice(4) :
    projectUrl;
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
  const [activeView, setActiveView] = useState<'documents' | 'files' | 'search'>('files');
  const [_hasNavigated, _setHasNavigated] = useState(false);
  const [fileContent, setFileContent] = useState<string | ArrayBuffer>('');
  const [currentEditorContent, setCurrentEditorContent] = useState<string>('');
  const [isEditingFile, setIsEditingFile] = useState(false);
  const [isBinaryFile, setIsBinaryFile] = useState(false);
  const [currentFilePath, setCurrentFilePath] = useState<string | undefined>(undefined);
  const [fileName, setFileName] = useState('');
  const [mimeType, setMimeType] = useState<string | undefined>(undefined);
  const [linkedDocumentId, setLinkedDocumentId] = useState<string | null>(null);
  const [linkedFileInfo, setLinkedFileInfo] = useState<{
    fileName?: string;
    mimeType?: string;
    fileId?: string;
    filePath?: string;
  }>({});
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
  const [hasNavigatedToFile, setHasNavigatedToFile] = useState(false);
  const [initialSelectedFile, setInitialSelectedFile] = useState<
    string | undefined>(
  );
  const [initialExpandedPaths, setInitialExpandedPaths] = useState<
    string[] | undefined>(
  );
  const [lastUserSelectedFileId, setLastUserSelectedFileId] = useState<
    string | null>(
      null);

  const [showCurrentProjectExportModal, setShowCurrentProjectExportModal] =
    useState(false);
  const [currentProjectForExport, setCurrentProjectForExport] =
    useState<Project | null>(null);

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

    console.log('Properties registered');
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
      if (projectId) {
        const project = await getProjectById(projectId);
        if (project) {
          setProjectType(project.type || 'latex');
        }
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
    const handleNavigateToLinkedFile = (event: Event) => {
      const customEvent = event as CustomEvent;
      const { filePath, fileId } = customEvent.detail;

      if (filePath && fileId) {
        setActiveView('files');

        const expandPaths: string[] = [];
        let currentPath = '';
        const pathSegments = filePath.split('/').filter((segment) => segment);

        for (let i = 0; i < pathSegments.length - 1; i++) {
          currentPath =
            currentPath === '' ?
              `/${pathSegments[i]}` :
              `${currentPath}/${pathSegments[i]}`;
          expandPaths.push(currentPath);
        }

        setInitialSelectedFile(fileId);
        setInitialExpandedPaths(expandPaths);
        setHasNavigatedToFile(false);
      }
    };

    const handleNavigateToCompiledFile = async (event: Event) => {
      const customEvent = event as CustomEvent;
      const { filePath } = customEvent.detail;

      if (filePath) {
        const findFileByPath = (
          nodes: FileNode[],
          path: string)
          : FileNode | null => {
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

        const targetFile = findFileByPath(fileTree, filePath);
        if (targetFile) {
          setActiveView('files');

          const expandPaths: string[] = [];
          let currentPath = '';
          const pathSegments = filePath.split('/').filter((segment) => segment);

          for (let i = 0; i < pathSegments.length - 1; i++) {
            currentPath =
              currentPath === '' ?
                `/${pathSegments[i]}` :
                `${currentPath}/${pathSegments[i]}`;
            expandPaths.push(currentPath);
          }

          setInitialSelectedFile(targetFile.id);
          setInitialExpandedPaths(expandPaths);
          setHasNavigatedToFile(false);

          if (!isEditingFile || selectedFileId !== targetFile.id) {
            try {
              const content = await getFileContent(targetFile.id);
              if (content) {
                handleFileSelect(
                  targetFile.id,
                  content,
                  targetFile.isBinary || false
                );
              }
            } catch (error) {
              console.error('Error loading compiled file:', error);
            }
          }
        }
      }
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
    selectedFileId,
    getFileContent]
  );

  useEffect(() => {
    const loadFileData = async () => {
      if (selectedFileId && isEditingFile) {
        const file = await getFile(selectedFileId);
        if (file) {
          setFileName(file.name);
          setMimeType(file.mimeType);
          setLinkedDocumentId(file.documentId || null);
          setCurrentFilePath(file.path);
          // Only show one output at a time
          if (file.name.endsWith('.tex')) {
            setShowLatexOutput(true);
            setShowTypstOutput(false);
          } else if (file.name.endsWith('.typ')) {
            setShowTypstOutput(true);
            setShowLatexOutput(false);
          } else {
            setShowLatexOutput(false);
            setShowTypstOutput(false);
          }
        }
      }
    };

    loadFileData();
  }, [selectedFileId, isEditingFile, getFile]);

  useEffect(() => {
    const loadInitialLinkedFile = async () => {
      if (!isEditingFile && selectedDocId) {
        try {
          const allFiles = await fileStorageService.getAllFiles(false);
          const linkedFile = allFiles.find(
            (file) => file.documentId === selectedDocId
          );

          if (linkedFile) {
            setLinkedFileInfo({
              fileName: linkedFile.name,
              filePath: linkedFile.path,
              fileId: linkedFile.id,
              mimeType: linkedFile.mimeType
            });
            setLinkedDocumentId(selectedDocId);

            // Only show one output at a time
            if (linkedFile.name.endsWith('.tex')) {
              setShowLatexOutput(true);
              setShowTypstOutput(false);
            } else if (linkedFile.name.endsWith('.typ')) {
              setShowTypstOutput(true);
              setShowLatexOutput(false);
            } else {
              setShowLatexOutput(false);
              setShowTypstOutput(false);
            }
          } else {
            setLinkedFileInfo({});
            setLinkedDocumentId(null);
            setShowLatexOutput(false);
            setShowTypstOutput(false);
          }
        } catch (error) {
          console.error('Error loading initial linked file:', error);
          setLinkedFileInfo({});
          setLinkedDocumentId(null);
          setShowLatexOutput(false);
          setShowTypstOutput(false);
        }
      } else if (isEditingFile) {
        setLinkedFileInfo({});
        setLinkedDocumentId(null);
      }
    };

    loadInitialLinkedFile();
  }, [selectedDocId, isEditingFile]);

  useEffect(() => {
    if (
      !hasNavigatedToFile &&
      targetFilePath &&
      fileTree.length > 0 &&
      !targetDocId) {
      const findFileByPath = (
        nodes: FileNode[],
        path: string)
        : FileNode | null => {
        for (const node of nodes) {
          if (node.path === path) {
            return node;
          }
          if (node.children) {
            const found = findFileByPath(node.children, path);
            if (found) return found;
          }
        }
        return null;
      };

      const targetFile = findFileByPath(fileTree, targetFilePath);
      if (targetFile && targetFile.type === 'file') {
        setActiveView('files');

        const expandPaths: string[] = [];
        let currentPath = '';
        const pathSegments = targetFilePath.
          split('/').
          filter((segment) => segment);

        for (let i = 0; i < pathSegments.length - 1; i++) {
          currentPath =
            currentPath === '' ?
              `/${pathSegments[i]}` :
              `${currentPath}/${pathSegments[i]}`;
          expandPaths.push(currentPath);
        }

        setInitialSelectedFile(targetFile.id);
        setInitialExpandedPaths(expandPaths);
        setHasNavigatedToFile(true);
      }
    }
  }, [targetFilePath, fileTree, hasNavigatedToFile, targetDocId]);

  useEffect(() => {
    if (
      selectedFileId &&
      activeView === 'files' &&
      !isEditingFile &&
      !lastUserSelectedFileId) {
      const isInitialNavigation =
        hasNavigatedToFile || initialSelectedFile === selectedFileId;

      if (isInitialNavigation) {
        const loadSelectedFile = async () => {
          try {
            const file = await getFile(selectedFileId);
            if (file) {
              const content = await getFileContent(selectedFileId);
              if (content) {
                handleFileSelect(
                  selectedFileId,
                  content,
                  file.isBinary || false
                );
                setLastUserSelectedFileId(selectedFileId);
              }
            }
          } catch (error) {
            console.error('Error loading selected file:', error);
          }
        };

        loadSelectedFile();
      }
    }
  }, [
    selectedFileId,
    activeView,
    isEditingFile,
    hasNavigatedToFile,
    initialSelectedFile,
    lastUserSelectedFileId]
  );

  useEffect(() => {
    const handleDocumentLinked = (event: Event) => {
      const customEvent = event as CustomEvent;
      const { documentId } = customEvent.detail;

      if (documentId && documents) {
        setActiveView('documents');
        handleDocumentSelect(documentId);
        window.location.reload();
      }
    };

    document.addEventListener('document-linked', handleDocumentLinked);

    return () => {
      document.removeEventListener('document-linked', handleDocumentLinked);
    };
  }, [documents]);

  useEffect(() => {
    if (targetDocId?.trim()) {
      setActiveView('documents');
    }
  }, [targetDocId]);

  useEffect(() => {
    const isTexFile = isEditingFile && fileName && fileName.endsWith('.tex');
    const isTypFile = isEditingFile && fileName && fileName.endsWith('.typ');
    const isDocumentLinkedToTex = !isEditingFile && linkedFileInfo?.fileName?.endsWith('.tex');
    const isDocumentLinkedToTyp = !isEditingFile && linkedFileInfo?.fileName?.endsWith('.typ');

    const hasLatexContent = !isEditingFile && !linkedFileInfo?.fileName &&
      content && (content.includes('\\section') || content.includes('\\chapter') ||
        content.includes('\\subsection') || content.includes('\\begin{document}'));

    // For Typst, look for heading markers
    const hasTypstContent = !isEditingFile && !linkedFileInfo?.fileName &&
      content && (content.includes('= ') || content.includes('== ') || content.includes('=== '));

    const shouldShowOutline = isTexFile || isTypFile || isDocumentLinkedToTex ||
      isDocumentLinkedToTyp || hasLatexContent || hasTypstContent;
    setShowOutline(shouldShowOutline);
  }, [isEditingFile, fileName, linkedFileInfo?.fileName, content]);

  useEffect(() => {
    if (isEditingFile) {
      if (typeof fileContent === 'string') {
        setCurrentEditorContent(fileContent);
      } else if (fileContent instanceof ArrayBuffer) {
        try {
          const decoded = new TextDecoder().decode(fileContent);
          setCurrentEditorContent(decoded);
        } catch {
          setCurrentEditorContent('');
        }
      } else {
        setCurrentEditorContent('');
      }
    } else if (!isEditingFile && content) {
      setCurrentEditorContent(content);
    }
  }, [isEditingFile, content, fileContent]);

  useEffect(() => {
    const handleOpenSearchPanel = () => {
      setActiveView('search');
    };

    document.addEventListener('open-search-panel', handleOpenSearchPanel);

    return () => {
      document.removeEventListener('open-search-panel', handleOpenSearchPanel);
    };
  }, []);

  const updateProjectLastOpened = async (docId?: string, filePath?: string) => {
    const projectId = sessionStorage.getItem('currentProjectId');
    if (!projectId) return;

    try {
      const project = await getProjectById(projectId);
      if (!project) return;

      const hasDocChange = docId !== project.lastOpenedDocId;
      const hasFileChange = filePath !== project.lastOpenedFilePath;

      if (hasDocChange || hasFileChange) {
        const updatedProject = {
          ...project,
          lastOpenedDocId: docId,
          lastOpenedFilePath: filePath
        };

        updateProject(updatedProject).catch((error) => {
          console.warn('Failed to update project last opened state:', error);
        });
      }
    } catch (error) {
      console.warn('Error updating project last opened state:', error);
    }
  };

  const handleCreateDocument = (name: string) => {
    onCreateDocument();
    const lastDoc = documents[documents.length - 1];
    onRenameDocument(lastDoc.id, name);
    return lastDoc.id;
  };

  const handleOutlineSectionClick = (line: number) => {
    document.dispatchEvent(
      new CustomEvent('codemirror-goto-line', {
        detail: { line }
      })
    );
  };

  const handleOutlineRefresh = async () => {
    if (isEditingFile && selectedFileId) {
      try {
        const content = await getFileContent(selectedFileId);
        if (content) {
          if (typeof content === 'string') {
            setCurrentEditorContent(content);
          } else if (content instanceof ArrayBuffer) {
            try {
              const decoded = new TextDecoder().decode(content);
              setCurrentEditorContent(decoded);
            } catch {
              setCurrentEditorContent('');
            }
          }
        }
      } catch (error) {
        console.error('Error refreshing file content for outline:', error);
      }
    }
  };

  const handleFileSelect = async (
    fileId: string,
    content: string | ArrayBuffer,
    isBinary = false) => {
    setFileContent(content);
    setIsEditingFile(true);
    setIsBinaryFile(isBinary);
    setFileSelectionChange((prev) => prev + 1);

    if (typeof content === 'string') {
      setCurrentEditorContent(content);
    } else {
      setCurrentEditorContent('');
    }

    if (selectedDocId !== null) {
      onSelectDocument('');
    }

    selectFile(fileId);
    const file = await getFile(fileId);
    if (file) {
      setCurrentFilePath(file.path);
      // Handle both file types
      if (file.name.endsWith('.tex')) {
        setShowLatexOutput(true);
        setShowTypstOutput(false);
      } else if (file.name.endsWith('.typ')) {
        setShowTypstOutput(true);
        setShowLatexOutput(false);
      } else {
        setShowLatexOutput(false);
        setShowTypstOutput(false);
      }

      // Create or switch to tab
      createTabForFile(fileId, file);

      const currentFragment = parseUrlFragments(
        window.location.hash.substring(1)
      );
      const newUrl = buildUrlWithFragments(
        currentFragment.yjsUrl,
        undefined,
        file.path
      );
      window.location.hash = newUrl;
    }
  };

  const handleUserFileSelect = async (
    fileId: string,
    content: string | ArrayBuffer,
    isBinary = false) => {
    const file = await getFile(fileId);
    setLastUserSelectedFileId(fileId);
    if (typeof content === 'string') {
      setCurrentEditorContent(content);
    } else {
      setCurrentEditorContent('');
    }
    handleFileSelect(fileId, content, isBinary);
    if (file) {
      updateProjectLastOpened(undefined, file.path);
    }
  };

  const handleDocumentSelect = (id: string) => {
    setIsEditingFile(false);
    onSelectDocument(id);
    setDocumentSelectionChange((prev) => prev + 1);

    const document = documents.find((d) => d.id === id);
    if (document) {
      // Create or switch to tab
      createTabForDocument(id, document);
    }

    const currentFragment = parseUrlFragments(
      window.location.hash.substring(1)
    );
    const newUrl = buildUrlWithFragments(currentFragment.yjsUrl, id);
    window.location.hash = newUrl;
    updateProjectLastOpened(id, undefined);
  };

  const handleSwitchToDocuments = () => {
    setActiveView('documents');
    setIsEditingFile(false);
  };

  const handleSwitchToFiles = async () => {
    console.log(
      'handleSwitchToFiles called, lastUserSelectedFileId:',
      lastUserSelectedFileId
    );
    setActiveView('files');

    if (lastUserSelectedFileId && !isEditingFile) {
      try {
        const file = await getFile(lastUserSelectedFileId);
        console.log('Retrieved file for restoration:', file?.path);
        if (file) {
          const content = await getFileContent(lastUserSelectedFileId);
          if (content) {
            selectFile(lastUserSelectedFileId);
            handleUserFileSelect(
              lastUserSelectedFileId,
              content,
              file.isBinary || false
            );
          }
        }
      } catch (error) {
        console.error('Error restoring last user selected file:', error);
      }
    }
  };

  const handleTabSwitch = async (tabId: string) => {
    const targetTab = tabs.find((tab) => tab.id === tabId);
    if (!targetTab) return;

    console.log('Switching to tab:', targetTab.title, targetTab.type);

    if (targetTab.type === 'file' && targetTab.fileId) {
      try {
        const content = await getFileContent(targetTab.fileId);
        if (content) {
          const file = await getFile(targetTab.fileId);
          if (file) {
            handleUserFileSelect(targetTab.fileId, content, file.isBinary || false);
          }
        }
      } catch (error) {
        console.error('Error loading file content for tab:', error);
      }
    } else if (targetTab.type === 'document' && targetTab.documentId) {
      handleDocumentSelect(targetTab.documentId);
    }
  };

  const createTabForFile = async (fileId: string, file: FileNode) => {
    return openTab({
      title: file.name,
      type: 'file',
      fileId: file.id,
      filePath: file.path
    });
  };

  const createTabForDocument = (documentId: string, document: Document) => {
    return openTab({
      title: document.name,
      type: 'document',
      documentId: documentId
    });
  };

  const handleUpdateContent = (content: string) => {
    setCurrentEditorContent(content);

    if (content !== (isEditingFile ? fileContent : content)) {
      onUpdateContent(content);
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
        className="sidebar-container">

        <ResizablePanel
          direction="vertical"
          height={explorerHeight}
          minHeight={350}
          maxHeight="85%"
          alignment="end"
          onResize={handleExplorerResize}
          collapsible={false}
          maintainAlignment={true}
          className="explorer-container">

          <div className="view-toggle">
            <button
              className={activeView === 'files' ? 'active' : ''}
              onClick={handleSwitchToFiles}>{t('Files')}


            </button>
            <button
              className={activeView === 'documents' ? 'active' : ''}
              onClick={handleSwitchToDocuments}>{t('Docs')}


            </button>
            <button
              className={activeView === 'search' ? 'active' : ''}
              onClick={() => setActiveView('search')}>{t('Search')}


            </button>
          </div>

          {activeView === 'search' ?
            <SearchPanel
              onNavigateToResult={async (fileId, line, column, documentId, isLinkedDocument) => {
                if (isLinkedDocument && documentId) {
                  // Navigate to the linked document instead
                  handleDocumentSelect(documentId);

                  setTimeout(() => {
                    if (line !== undefined) {
                      document.dispatchEvent(
                        new CustomEvent('codemirror-goto-line', {
                          detail: { line, documentId }
                        })
                      );
                    }
                  }, 100);
                } else {
                  // Navigate to the file
                  const file = await getFile(fileId);
                  if (file) {
                    const content = await getFileContent(fileId);
                    if (content) {
                      handleUserFileSelect(fileId, content, file.isBinary || false);

                      setTimeout(() => {
                        if (line !== undefined) {
                          document.dispatchEvent(
                            new CustomEvent('codemirror-goto-line', {
                              detail: { line, fileId }
                            })
                          );
                        }
                      }, 100);
                    }
                  }
                }
              }} /> :

            activeView === 'documents' ?
              <DocumentExplorer
                documents={documents}
                selectedDocId={selectedDocId}
                onSelectDocument={handleDocumentSelect}
                onCreateDocument={onCreateDocument}
                onRenameDocument={onRenameDocument}
                onUpdateContent={onUpdateContent}
                content={content}
                docUrl={docUrl}
                getDocumentContent={getDocumentContent} /> :


              <FileExplorer
                onFileSelect={handleUserFileSelect}
                onCreateDocument={handleCreateDocument}
                documents={documents.map((doc) => ({
                  id: Number.parseInt(doc.id, 36),
                  name: doc.name
                }))}
                initialSelectedFile={initialSelectedFile}
                initialExpandedPaths={initialExpandedPaths}
                currentProjectId={sessionStorage.getItem('currentProjectId')}
                onExportCurrentProject={handleExportCurrentProject}
                projectType={projectType} />

          }
        </ResizablePanel>

        {showOutline && (() => {
          const isTypstFile = isEditingFile && fileName?.endsWith('.typ') ||
            !isEditingFile && linkedFileInfo?.fileName?.endsWith('.typ') ||
            !isEditingFile && !linkedFileInfo?.fileName &&
            currentEditorContent?.includes('= ');

          return isTypstFile ?
            <TypstOutline
              content={currentEditorContent}
              currentLine={currentLine}
              onSectionClick={handleOutlineSectionClick}
              onRefresh={handleOutlineRefresh}
              linkedFileInfo={linkedFileInfo}
              currentFilePath={currentFilePath}
              isEditingFile={isEditingFile} /> :


            <LaTeXOutline
              content={currentEditorContent}
              currentLine={currentLine}
              onSectionClick={handleOutlineSectionClick}
              onRefresh={handleOutlineRefresh}
              linkedFileInfo={linkedFileInfo}
              currentFilePath={currentFilePath}
              isEditingFile={isEditingFile} />;


        })()}

      </ResizablePanel>

      <div
        className="editor-container-outer"
        style={{ flex: 1, display: 'flex', minHeight: 0 }}>

        <div className="editor-container" style={{ flex: 1, minWidth: 0 }}>
          <EditorTabs onTabSwitch={handleTabSwitch} />

          <Editor
            content={isEditingFile ? fileContent : content}
            documentId={selectedDocId || ''}
            onUpdateContent={handleUpdateContent}
            isDocumentSelected={isEditingFile || !!selectedDocId}
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
              isEditingFile ?
                linkedDocumentId :
                linkedFileInfo.fileName ?
                  selectedDocId :
                  null
            }
            documents={documents}
            linkedFileInfo={linkedFileInfo}
            toolbarVisible={toolbarVisible}
            onToolbarToggle={handleToolbarToggle} />

        </div>

        {showLatexOutput &&
          <ResizablePanel
            direction="horizontal"
            width={latexOutputWidth}
            minWidth={400}
            maxWidth={1200}
            alignment="start"
            onResize={handleLatexOutputWidthResize}
            collapsed={latexOutputCollapsed && !temporaryLatexExpand}
            onCollapse={handleLatexOutputCollapse}
            className="latex-output-container">

            <LaTeXOutput
              selectedDocId={selectedDocId}
              documents={documents}
              onNavigateToLinkedFile={handleNavigateToLinkedFile}
              onExpandLatexOutput={pdfWindowService.isWindowOpen() ? undefined : handleLatexOutputExpand}
              linkedFileInfo={linkedFileInfo} />

          </ResizablePanel>
        }

        {showTypstOutput &&
          <ResizablePanel
            direction="horizontal"
            width={typstOutputWidth}
            minWidth={400}
            maxWidth={1200}
            alignment="start"
            onResize={handleTypstOutputWidthResize}
            collapsed={typstOutputCollapsed && !temporaryTypstExpand}
            onCollapse={handleTypstOutputCollapse}
            className="typst-output-container">

            <TypstOutput
              selectedDocId={selectedDocId}
              documents={documents}
              onNavigateToLinkedFile={handleNavigateToLinkedFile}
              onExpandTypstOutput={handleTypstOutputExpand}
              linkedFileInfo={linkedFileInfo} />

          </ResizablePanel>
        }
      </div>

      {showCurrentProjectExportModal && currentProjectForExport &&
        <ProjectExportModal
          isOpen={showCurrentProjectExportModal}
          onClose={() => setShowCurrentProjectExportModal(false)}
          selectedProjects={[currentProjectForExport]} />

      }
    </div>);

};

const FileDocumentController: React.FC<FileDocumentControllerProps> = (props) => {
  return (
    <SearchProvider>
      <EditorTabsProvider>
        <FileDocumentControllerContent {...props} />
      </EditorTabsProvider>
    </SearchProvider>);

};

export default FileDocumentController;