// src/hooks/editor/useEditorNavigation.ts
import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

import { createNamedLogger } from '@/logging';
import { pluginRegistry } from '../../plugins/PluginRegistry';
import { fileStoreService } from '../../services/FileStoreService';
import type { Document } from '../../types/documents';
import type {
	EditorSidebarView,
	LinkedFileInfo,
	LinkedFileInfoState,
} from '../../types/editor';
import type { FileNode } from '../../types/files';
import type { YjsDocUrl } from '../../types/yjs';
import { gotoEditor } from '../../utils/editorNavigator';
import { buildUrlWithFragments, parseUrlFragments } from '../../utils/urlUtils';
import { useAuth } from '../useAuth';
import { useEditorTabs } from '../useEditorTabs';
import { useFileTree } from '../useFileTree';

const moduleLog = createNamedLogger('useEditorNavigation');

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

interface UseEditorNavigationOptions {
	documents: Document[];
	selectedDocId: string | null;
	onSelectDocument: (id: string) => void;
	onUpdateContent: (content: string) => void;
	content: string;
	docUrl: YjsDocUrl;
	targetDocId?: string | null;
	targetFilePath?: string | null;
	setOutputForFileName: (name?: string) => void;
}

export const useEditorNavigation = ({
	documents,
	selectedDocId,
	onSelectDocument,
	onUpdateContent,
	content,
	docUrl,
	targetDocId,
	targetFilePath,
	setOutputForFileName,
}: UseEditorNavigationOptions) => {
	const { selectedFileId, getFile, fileTree, selectFile, getFileContent } =
		useFileTree();
	const { getProjectById, updateProject } = useAuth();
	const { openTab, tabs } = useEditorTabs();
	const [activeView, setActiveView] = useState<EditorSidebarView>('files');
	const lastOpenedFilePathRef = useRef<string | null>(null);
	const lastOpenedDocIdRef = useRef<string | null>(null);
	const isViewerHandledRef = useRef(false);
	const docToFileMapRef = useRef<Map<string, LinkedFileInfo>>(new Map());
	const [docToFileMapReady, setDocToFileMapReady] = useState(false);
	const [loadedFile, setLoadedFile] = useState<{
		fileId: string;
		content: string | ArrayBuffer;
	} | null>(null);
	const [currentEditorContent, setCurrentEditorContent] = useState('');
	const [isEditingFile, setIsEditingFile] = useState(false);
	const [isBinaryFile, setIsBinaryFile] = useState(false);
	const [bootstrapResolved, setBootstrapResolved] = useState(false);
	const [currentFilePath, setCurrentFilePath] = useState<string | undefined>();
	const [fileName, setFileName] = useState('');
	const [isFileLoading, setIsFileLoading] = useState(false);
	const [mimeType, setMimeType] = useState<string | undefined>();
	const [linkedDocumentId, setLinkedDocumentId] = useState<string | null>(null);
	const [linkedFileInfo, setLinkedFileInfo] = useState<LinkedFileInfoState>({});
	const [documentSelectionChange, setDocumentSelectionChange] = useState(0);
	const [fileSelectionChange, setFileSelectionChange] = useState(0);
	const [initialSelectedFile, setInitialSelectedFile] = useState<
		string | undefined
	>();
	const [initialExpandedPaths, setInitialExpandedPaths] = useState<
		string[] | undefined
	>();

	const selectFileInExplorer = useCallback(
		(file: FileNode | LinkedFileInfo) => {
			const fileId = 'fileId' in file ? file.fileId : file.id;
			const filePath = 'filePath' in file ? file.filePath : file.path;
			setInitialSelectedFile(fileId);
			setInitialExpandedPaths(getExpandPaths(filePath));
		},
		[],
	);

	const createTabForFile = useCallback(
		(file: FileNode) => {
			openTab({
				title: file.name,
				type: 'file',
				fileId: file.id,
				filePath: file.path,
			});
		},
		[openTab],
	);

	const createTabForDocument = useCallback(
		(documentId: string, document: Document) => {
			openTab({
				title: document.name,
				type: 'document',
				documentId,
				filePath: docToFileMapRef.current.get(documentId)?.filePath,
			});
		},
		[openTab],
	);

	const openDocumentById = useCallback(
		(docId: string, view: 'documents' | 'files', preserveView = false) => {
			const document = documents.find((doc) => doc.id === docId);
			if (!document) return;

			lastOpenedDocIdRef.current = docId;
			lastOpenedFilePathRef.current =
				docToFileMapRef.current.get(docId)?.filePath ?? null;

			if (!preserveView) setActiveView(view);

			setIsEditingFile(false);
			onSelectDocument(docId);
			setDocumentSelectionChange((prev) => prev + 1);
			createTabForDocument(docId, document);

			const linkedFile = docToFileMapRef.current.get(docId);
			if (linkedFile) {
				setLinkedFileInfo(linkedFile);
				setLinkedDocumentId(docId);
				setOutputForFileName(linkedFile.fileName);
				if (view === 'files' && !preserveView) selectFileInExplorer(linkedFile);
			} else {
				setLinkedFileInfo({});
				setLinkedDocumentId(null);
				setOutputForFileName(undefined);
			}
		},
		[
			documents,
			onSelectDocument,
			setOutputForFileName,
			createTabForDocument,
			selectFileInExplorer,
		],
	);

	const handleFileSelect = useCallback(
		async (
			file: FileNode,
			loadedContent: string | ArrayBuffer,
			isBinary = false,
		) => {
			flushSync(() => setIsFileLoading(true));
			selectFile(file.id);

			isViewerHandledRef.current = !!pluginRegistry.getViewerForFile(
				file.name,
				file.mimeType,
			);

			flushSync(() => {
				setLoadedFile({ fileId: file.id, content: loadedContent });
				setFileName(file.name);
				setMimeType(file.mimeType);
				setIsBinaryFile(isBinary || isViewerHandledRef.current);
				setLinkedDocumentId(file.documentId || null);
				setCurrentFilePath(file.path);
				setCurrentEditorContent(
					typeof loadedContent === 'string' ? loadedContent : '',
				);
				setIsEditingFile(true);
				setFileSelectionChange((prev) => prev + 1);
			});

			setIsFileLoading(false);
			if (selectedDocId !== null) onSelectDocument('');
			setOutputForFileName(file.name);
			createTabForFile(file);
		},
		[
			selectFile,
			selectedDocId,
			onSelectDocument,
			setOutputForFileName,
			createTabForFile,
		],
	);

	const openFileByNode = useCallback(
		async (file: FileNode, preserveView = false) => {
			const loadedContent = await getFileContent(file.id);
			if (!loadedContent) return;

			lastOpenedFilePathRef.current = file.path;
			lastOpenedDocIdRef.current = null;

			if (!preserveView) {
				setActiveView('files');
				selectFileInExplorer(file);
			}

			await handleFileSelect(file, loadedContent, file.isBinary || false);
		},
		[getFileContent, handleFileSelect, selectFileInExplorer],
	);

	const updateProjectLastOpened = useCallback(
		async (docId?: string, filePath?: string) => {
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
					lastOpenedDocId: nextDocId ?? undefined,
					lastOpenedFilePath: nextFilePath ?? undefined,
				}).catch((error) => {
					moduleLog.warn('Failed to update project last opened state:', error);
				});
			} catch (error) {
				moduleLog.warn('Error updating project last opened state:', error);
			}
		},
		[getProjectById, updateProject],
	);

	const pushEditorRoute = useCallback(
		(docId?: string, filePath?: string) => {
			const currentFragment = parseUrlFragments(
				window.location.hash.substring(1),
			);
			const newUrl = buildUrlWithFragments(
				currentFragment.yjsUrl,
				docId,
				filePath,
			);

			window.location.hash = newUrl.startsWith('#') ? newUrl.slice(1) : newUrl;
			void updateProjectLastOpened(docId, filePath);
		},
		[updateProjectLastOpened],
	);

	const handleUserFileSelect = useCallback(
		async (fileId: string) => {
			const file = await getFile(fileId);
			if (!file) return;

			if (file.documentId) {
				openDocumentById(file.documentId, 'files');
				pushEditorRoute(file.documentId, file.path);
				return;
			}

			await openFileByNode(file);
			pushEditorRoute(undefined, file.path);
		},
		[getFile, openDocumentById, openFileByNode, pushEditorRoute],
	);

	const handleDocumentSelect = useCallback(
		(id: string) => {
			openDocumentById(id, 'files');
			const linkedFile = docToFileMapRef.current.get(id);
			pushEditorRoute(id, linkedFile?.filePath);
		},
		[openDocumentById, pushEditorRoute],
	);

	const handleUserDocumentSelect = useCallback(
		(id: string) => {
			openDocumentById(id, 'documents');
			pushEditorRoute(id, undefined);
		},
		[openDocumentById, pushEditorRoute],
	);

	const handleSwitchToDocuments = useCallback(() => {
		setActiveView('documents');
	}, []);

	const handleTabSwitch = useCallback(
		async (tabId: string) => {
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
		},
		[tabs, getFile, openDocumentById, openFileByNode, pushEditorRoute],
	);

	const handleSearchResultNavigate = useCallback(
		async (
			fileId: string,
			line?: number,
			column?: number,
			documentId?: string,
			isLinkedDocument?: boolean,
		) => {
			if (line === undefined) return;

			if (isLinkedDocument && documentId) {
				if (!(await getFile(fileId))) return;
				openDocumentById(documentId, 'files', true);
				gotoEditor(
					{ kind: 'document', documentId },
					{ line, column },
					{ waitForReady: false },
				);
				return;
			}

			const file = await getFile(fileId);
			if (!file) return;

			if (file.documentId) {
				openDocumentById(file.documentId, 'files', true);
				gotoEditor(
					{ kind: 'document', documentId: file.documentId },
					{ line, column },
					{ waitForReady: false },
				);
				return;
			}

			await openFileByNode(file, true);
			gotoEditor(
				{ kind: 'file', fileId: file.id },
				{ line, column },
				{ waitForReady: false },
			);
		},
		[getFile, openDocumentById, openFileByNode],
	);

	const handleUpdateContent = useCallback(
		(newContent: string) => {
			if (!isEditingFile) {
				setCurrentEditorContent((current) =>
					current === newContent ? current : newContent,
				);
				return;
			}
			if (newContent !== loadedFile?.content) onUpdateContent(newContent);
		},
		[isEditingFile, loadedFile?.content, onUpdateContent],
	);

	const handleNavigateToLinkedFile = useCallback(() => {
		if (!linkedFileInfo.filePath) return;

		document.dispatchEvent(
			new CustomEvent('navigate-to-linked-file', {
				detail: {
					filePath: linkedFileInfo.filePath,
					fileId: linkedFileInfo.fileId,
				},
			}),
		);
	}, [linkedFileInfo.filePath, linkedFileInfo.fileId]);

	const refreshCurrentFileContent = useCallback(async () => {
		if (!isEditingFile || !selectedFileId) return undefined;
		return getFileContent(selectedFileId);
	}, [isEditingFile, selectedFileId, getFileContent]);

	useEffect(() => {
		const buildDocToFileMap = async () => {
			if (!docUrl) return;

			await fileStoreService.initialize(docUrl);

			const allFiles = await fileStoreService.getAllFiles(false, false, false);
			const map = new Map<string, LinkedFileInfo>();

			for (const file of allFiles) {
				if (file.documentId) {
					map.set(file.documentId, {
						fileName: file.name,
						filePath: file.path,
						fileId: file.id,
						mimeType: file.mimeType,
					});
				}
			}

			docToFileMapRef.current = map;
			setDocToFileMapReady(true);
		};

		void buildDocToFileMap();
		document.addEventListener('refresh-file-tree', buildDocToFileMap);
		document.addEventListener('file-saved', buildDocToFileMap);

		return () => {
			document.removeEventListener('refresh-file-tree', buildDocToFileMap);
			document.removeEventListener('file-saved', buildDocToFileMap);
		};
	}, [docUrl]);

	useEffect(() => {
		const handleOpenSearchPanel = () => setActiveView('search');
		document.addEventListener('open-search-panel', handleOpenSearchPanel);
		return () => {
			document.removeEventListener('open-search-panel', handleOpenSearchPanel);
		};
	}, []);

	useEffect(() => {
		const handleNavigateToLinkedFileEvent = async (event: Event) => {
			const { filePath, fileId } = (event as CustomEvent).detail;
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
			const { filePath } = (event as CustomEvent).detail;
			if (!filePath) return;

			const targetFile = await fileStoreService.getFileByPath(filePath);
			if (!targetFile || targetFile.type !== 'file') return;

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
			handleNavigateToLinkedFileEvent,
		);
		document.addEventListener(
			'navigate-to-compiled-file',
			handleNavigateToCompiledFile,
		);

		return () => {
			document.removeEventListener(
				'navigate-to-linked-file',
				handleNavigateToLinkedFileEvent,
			);
			document.removeEventListener(
				'navigate-to-compiled-file',
				handleNavigateToCompiledFile,
			);
		};
	}, [getFile, openDocumentById, openFileByNode, pushEditorRoute]);

	useEffect(() => {
		if (!selectedFileId || !isEditingFile) return;
		let cancelled = false;

		const loadFileData = async () => {
			const file = await getFile(selectedFileId);
			if (!file || cancelled) return;

			if (loadedFile?.fileId !== selectedFileId) {
				const fileContent = await getFileContent(selectedFileId);
				if (fileContent === undefined || cancelled) return;
				setLoadedFile({ fileId: selectedFileId, content: fileContent });
			}

			if (file.path === currentFilePath) return;
			setFileName(file.name);
			setMimeType(file.mimeType);
			setLinkedDocumentId(file.documentId || null);
			setCurrentFilePath(file.path);
			setOutputForFileName(file.name);
		};

		void loadFileData();
		return () => {
			cancelled = true;
		};
	}, [
		selectedFileId,
		isEditingFile,
		getFile,
		getFileContent,
		loadedFile?.fileId,
		currentFilePath,
		setOutputForFileName,
	]);

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
	}, [selectedDocId, isEditingFile, docToFileMapReady, setOutputForFileName]);

	/* biome-ignore lint/correctness/useExhaustiveDependencies: Bootstrap effect intentionally reacts only to URL-derived targets; openDocumentById identity changes (driven by tabs/documents churn) are not relevant triggers. */
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

	/* biome-ignore lint/correctness/useExhaustiveDependencies: Bootstrap effect intentionally reacts only to URL-derived targets; fileTree identity and openFileByNode identity changes are not relevant triggers (fileTree.length is observed as a "files have arrived" signal). */
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
			const targetFile = await fileStoreService.getFileByPath(targetFilePath);
			if (!targetFile || targetFile.type !== 'file') {
				setBootstrapResolved(true);
				return;
			}
			await openFileByNode(targetFile);
			setBootstrapResolved(true);
		};

		void navigate();
	}, [targetDocId, targetFilePath, docToFileMapReady, fileTree.length]);

	useEffect(() => {
		const handleDocumentLinked = (event: Event) => {
			const { documentId } = (event as CustomEvent).detail;
			if (documentId) openDocumentById(documentId, 'documents');
		};

		document.addEventListener('document-linked', handleDocumentLinked);
		return () => {
			document.removeEventListener('document-linked', handleDocumentLinked);
		};
	}, [openDocumentById]);

	const fileContentReady =
		isEditingFile && loadedFile?.fileId === (selectedFileId || '');

	useEffect(() => {
		if (isEditingFile) {
			const loaded = fileContentReady ? loadedFile?.content : undefined;
			if (typeof loaded === 'string') {
				setCurrentEditorContent(loaded);
			} else if (loaded instanceof ArrayBuffer) {
				try {
					setCurrentEditorContent(new TextDecoder().decode(loaded));
				} catch {
					setCurrentEditorContent('');
				}
			} else {
				setCurrentEditorContent('');
			}
		} else {
			setCurrentEditorContent(content || '');
		}
	}, [isEditingFile, content, loadedFile, fileContentReady]);

	return {
		activeView,
		setActiveView,
		selectedFileId,
		loadedFile,
		currentEditorContent,
		setCurrentEditorContent,
		isEditingFile,
		isBinaryFile,
		bootstrapResolved,
		currentFilePath,
		fileName,
		isFileLoading,
		mimeType,
		linkedDocumentId,
		linkedFileInfo,
		documentSelectionChange,
		fileSelectionChange,
		initialSelectedFile,
		initialExpandedPaths,
		fileContentReady,
		handleUserFileSelect,
		handleDocumentSelect,
		handleUserDocumentSelect,
		handleSwitchToDocuments,
		handleTabSwitch,
		handleSearchResultNavigate,
		handleUpdateContent,
		handleNavigateToLinkedFile,
		refreshCurrentFileContent,
	};
};
