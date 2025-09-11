// src/components/editor/FileDocumentController.tsx
import type React from "react";
import { useEffect, useRef, useState } from "react";
import { IndexeddbPersistence } from "y-indexeddb";
import * as Y from "yjs";

import { useAuth } from "../../hooks/useAuth";
import { useFileTree } from "../../hooks/useFileTree";
import { useProperties } from "../../hooks/useProperties";
import { useTheme } from "../../hooks/useTheme";
import {
	fileStorageEventEmitter,
	fileStorageService,
} from "../../services/FileStorageService";
import { pdfWindowService } from "../../services/PdfWindowService";
import type { Document } from "../../types/documents";
import type { FileNode } from "../../types/files";
import type { Project } from "../../types/projects";
import { buildUrlWithFragments, parseUrlFragments } from "../../utils/urlUtils";
import type { YjsDocUrl } from "../../types/yjs";
import ResizablePanel from "../common/ResizablePanel";
import LaTeXOutline from "./LaTeXOutline";
import LaTeXOutput from "../output/LaTeXOutput";
import ProjectExportModal from "../project/ProjectExportModal";
import DocumentExplorer from "./DocumentExplorer";
import Editor from "./Editor";
import FileExplorer from "./FileExplorer";

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
	docId: string,
): Promise<string> => {
	const projectId = projectUrl.startsWith("yjs:")
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

			docPersistence.once("synced", () => {
				clearTimeout(timeout);
				resolve();
			});
		});

		const textContent = docYDoc.getText("codemirror").toString();

		docPersistence.destroy();
		docYDoc.destroy();

		return textContent;
	} catch (error) {
		console.error("Error getting document content:", error);
		return "";
	}
};

const FileDocumentController: React.FC<FileDocumentControllerProps> = ({
	documents,
	selectedDocId,
	onSelectDocument,
	onCreateDocument,
	onRenameDocument,
	onUpdateContent,
	content,
	docUrl,
	targetDocId,
	targetFilePath,
}) => {
	const { selectedFileId, getFile, fileTree, selectFile, getFileContent } =
		useFileTree();
	const { currentLayout } = useTheme();
	const { getProjectById, updateProject } = useAuth();
	const { getProperty, setProperty, registerProperty } = useProperties();
	const propertiesRegistered = useRef(false);
	const [propertiesLoaded, setPropertiesLoaded] = useState(false);
	const [activeView, setActiveView] = useState<"documents" | "files">("files");
	const [_hasNavigated, _setHasNavigated] = useState(false);
	const [fileContent, setFileContent] = useState<string | ArrayBuffer>("");
	const [currentEditorContent, setCurrentEditorContent] = useState<string>("");
	const [isEditingFile, setIsEditingFile] = useState(false);
	const [isBinaryFile, setIsBinaryFile] = useState(false);
	const [fileName, setFileName] = useState("");
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
		currentLayout?.defaultFileExplorerWidth || 250,
	);
	const [showOutline, setShowOutline] = useState(false);
	const [explorerHeight, setOutlineHeight] = useState(600);
	const [latexOutputWidth, setLatexOutputWidth] = useState(550);
	const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
	const [latexOutputCollapsed, setLatexOutputCollapsed] = useState(false);
	const [showLatexOutput, setShowLatexOutput] = useState(false);
	const [temporaryLatexExpand, setTemporaryLatexExpand] = useState(false);
	const [documentSelectionChange, setDocumentSelectionChange] = useState(0);
	const [fileSelectionChange, setFileSelectionChange] = useState(0);
	const [hasNavigatedToFile, setHasNavigatedToFile] = useState(false);
	const [initialSelectedFile, setInitialSelectedFile] = useState<
		string | undefined
	>();
	const [initialExpandedPaths, setInitialExpandedPaths] = useState<
		string[] | undefined
	>();
	const [lastUserSelectedFileId, setLastUserSelectedFileId] = useState<
		string | null
	>(null);

	// Export modal state
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
			console.error("Error loading project for export:", error);
		}
	};

	useEffect(() => {
	if (propertiesRegistered.current) return;
	propertiesRegistered.current = true;

	registerProperty({
		id: "sidebar-width",
		category: "UI",
		subcategory: "Layout",
		defaultValue: currentLayout?.defaultFileExplorerWidth || 250,
	});

	registerProperty({
		id: "latex-output-width",
		category: "UI",
		subcategory: "Layout",
		defaultValue: latexOutputWidth,
	});

	registerProperty({
		id: "sidebar-collapsed",
		category: "UI",
		subcategory: "Layout",
		defaultValue: false,
	});

	registerProperty({
		id: "latex-output-collapsed",
		category: "UI",
		subcategory: "Layout",
		defaultValue: false,
	});
	
	registerProperty({
		id: "explorer-height",
		category: "UI",
		subcategory: "Layout", 
		defaultValue: explorerHeight,
	});
	
	console.log('Properties registered');
	}, [registerProperty]);

	useEffect(() => {
	if (propertiesLoaded) return;

	const storedSidebarWidth = getProperty("sidebar-width");
	const storedLatexWidth = getProperty("latex-output-width");
	const storedSidebarCollapsed = getProperty("sidebar-collapsed");
	const storedLatexCollapsed = getProperty("latex-output-collapsed");
	const storedOutlineHeight = getProperty("explorer-height");

	// Load each property individually if available
	if (storedSidebarWidth !== undefined) {
		setSidebarWidth(Number(storedSidebarWidth));
	}

	if (storedLatexWidth !== undefined) {
		setLatexOutputWidth(Number(storedLatexWidth));
	}

	if (storedSidebarCollapsed !== undefined) {
		setSidebarCollapsed(Boolean(storedSidebarCollapsed));
	}

	if (storedLatexCollapsed !== undefined) {
		setLatexOutputCollapsed(Boolean(storedLatexCollapsed));
	}

	if (storedOutlineHeight !== undefined) {
		setOutlineHeight(Number(storedOutlineHeight));
	}
	
	setPropertiesLoaded(true);
	}, [getProperty, propertiesLoaded]);

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
				setActiveView("files");

				const expandPaths: string[] = [];
				let currentPath = "";
				const pathSegments = filePath.split("/").filter((segment) => segment);

				for (let i = 0; i < pathSegments.length - 1; i++) {
					currentPath =
						currentPath === ""
							? `/${pathSegments[i]}`
							: `${currentPath}/${pathSegments[i]}`;
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
					path: string,
				): FileNode | null => {
					for (const node of nodes) {
						if (node.path === path && node.type === "file") {
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
					setActiveView("files");

					const expandPaths: string[] = [];
					let currentPath = "";
					const pathSegments = filePath.split("/").filter((segment) => segment);

					for (let i = 0; i < pathSegments.length - 1; i++) {
						currentPath =
							currentPath === ""
								? `/${pathSegments[i]}`
								: `${currentPath}/${pathSegments[i]}`;
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
									targetFile.isBinary || false,
								);
							}
						} catch (error) {
							console.error("Error loading compiled file:", error);
						}
					}
				}
			}
		};

		document.addEventListener(
			"navigate-to-linked-file",
			handleNavigateToLinkedFile,
		);
		document.addEventListener(
			"navigate-to-compiled-file",
			handleNavigateToCompiledFile,
		);
		document.addEventListener("expand-latex-output", handleLatexOutputExpand);

		return () => {
			document.removeEventListener(
				"navigate-to-linked-file",
				handleNavigateToLinkedFile,
			);
			document.removeEventListener(
				"navigate-to-compiled-file",
				handleNavigateToCompiledFile,
			);
			document.removeEventListener(
				"expand-latex-output",
				handleLatexOutputExpand,
			);
		};
	}, [
		showLatexOutput,
		fileTree,
		isEditingFile,
		selectedFileId,
		getFileContent,
	]);

	useEffect(() => {
		const loadFileData = async () => {
			if (selectedFileId && isEditingFile) {
				const file = await getFile(selectedFileId);
				if (file) {
					setFileName(file.name);
					setMimeType(file.mimeType);
					setLinkedDocumentId(file.documentId || null);

					if (file.name.endsWith(".tex")) {
						setShowLatexOutput(true);
					} else {
						setShowLatexOutput(false);
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
						(file) => file.documentId === selectedDocId,
					);

					if (linkedFile) {
						setLinkedFileInfo({
							fileName: linkedFile.name,
							filePath: linkedFile.path,
							fileId: linkedFile.id,
							mimeType: linkedFile.mimeType,
						});
						setLinkedDocumentId(selectedDocId);

						if (linkedFile.name.endsWith(".tex")) {
							setShowLatexOutput(true);
						}
					} else {
						setLinkedFileInfo({});
						setLinkedDocumentId(null);
						setShowLatexOutput(false);
					}
				} catch (error) {
					console.error("Error loading initial linked file:", error);
					setLinkedFileInfo({});
					setLinkedDocumentId(null);
					setShowLatexOutput(false);
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
			!targetDocId
		) {
			const findFileByPath = (
				nodes: FileNode[],
				path: string,
			): FileNode | null => {
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
			if (targetFile && targetFile.type === "file") {
				setActiveView("files");

				const expandPaths: string[] = [];
				let currentPath = "";
				const pathSegments = targetFilePath
					.split("/")
					.filter((segment) => segment);

				for (let i = 0; i < pathSegments.length - 1; i++) {
					currentPath =
						currentPath === ""
							? `/${pathSegments[i]}`
							: `${currentPath}/${pathSegments[i]}`;
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
			activeView === "files" &&
			!isEditingFile &&
			!lastUserSelectedFileId
		) {
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
									file.isBinary || false,
								);
							}
						}
					} catch (error) {
						console.error("Error loading selected file:", error);
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
		lastUserSelectedFileId,
	]);

	useEffect(() => {
		const handleDocumentLinked = (event: Event) => {
			const customEvent = event as CustomEvent;
			const { documentId } = customEvent.detail;

			if (documentId && documents) {
				setActiveView("documents");
				handleDocumentSelect(documentId);
				window.location.reload();
			}
		};

		document.addEventListener("document-linked", handleDocumentLinked);

		return () => {
			document.removeEventListener("document-linked", handleDocumentLinked);
		};
	}, [documents]);

	useEffect(() => {
		if (targetDocId?.trim()) {
			setActiveView("documents");
		}
	}, [targetDocId]);

	useEffect(() => {
		// Show outline for:
		// 1. Editing a .tex file directly
		// 2. Editing a document linked to a .tex file
		// 3. Editing a document that contains LaTeX commands
		const isTexFile = isEditingFile && fileName && fileName.endsWith('.tex');
		const isDocumentLinkedToTex = !isEditingFile && linkedFileInfo?.fileName?.endsWith('.tex');
		
		const hasLatexContent = !isEditingFile && !linkedFileInfo?.fileName && 
			content && (content.includes('\\section') || content.includes('\\chapter') || 
			content.includes('\\subsection') || content.includes('\\begin{document}'));
		
		const shouldShowOutline = isTexFile || isDocumentLinkedToTex || hasLatexContent;
		setShowOutline(shouldShowOutline);
	}, [isEditingFile, fileName, linkedFileInfo?.fileName, content]);

	useEffect(() => {
		if (isEditingFile) {
			// For files, use fileContent
			if (typeof fileContent === 'string') {
				setCurrentEditorContent(fileContent);
			} else if (fileContent instanceof ArrayBuffer) {
				// Try to decode ArrayBuffer as text for tex files
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
			// For documents, use the document content
			setCurrentEditorContent(content);
		}
	}, [isEditingFile, content, fileContent]);

	const updateProjectLastOpened = async (docId?: string, filePath?: string) => {
		const projectId = sessionStorage.getItem("currentProjectId");
		if (!projectId) return;

		try {
			const project = await getProjectById(projectId);
			if (!project) return;

			// Only update if there's actually a change
			const hasDocChange = docId !== project.lastOpenedDocId;
			const hasFileChange = filePath !== project.lastOpenedFilePath;

			if (hasDocChange || hasFileChange) {
				const updatedProject = {
					...project,
					lastOpenedDocId: docId,
					lastOpenedFilePath: filePath,
				};

				// Update project silently
				updateProject(updatedProject).catch(error => {
					console.warn("Failed to update project last opened state:", error);
				});
			}
		} catch (error) {
			console.warn("Error updating project last opened state:", error);
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
			new CustomEvent("codemirror-goto-line", {
			detail: { line },
			})
		);
	};

	const handleOutlineRefresh = async () => {
		if (isEditingFile && selectedFileId) {
			// For files, re-fetch the file content
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
				console.error("Error refreshing file content for outline:", error);
			}
		} 
	};
	
	const handleFileSelect = async (
		fileId: string,
		content: string | ArrayBuffer,
		isBinary = false,
	) => {
		setFileContent(content);
		setIsEditingFile(true);
		setIsBinaryFile(isBinary);
		setFileSelectionChange((prev) => prev + 1);
		
		// Update current editor content for outline
		if (typeof content === 'string') {
			setCurrentEditorContent(content);
		} else {
			setCurrentEditorContent('');
		}

		if (selectedDocId !== null) {
			onSelectDocument("");
		}

		const file = await getFile(fileId);
		if (file) {
			if (file.name.endsWith(".tex")) {
				setShowLatexOutput(true);
			} else {
				setShowLatexOutput(false);
			}

			const currentFragment = parseUrlFragments(
				window.location.hash.substring(1),
			);
			const newUrl = buildUrlWithFragments(
				currentFragment.yjsUrl,
				undefined,
				file.path,
			);
			window.location.hash = newUrl;
		}
	};

	const handleUserFileSelect = async (
		fileId: string,
		content: string | ArrayBuffer,
		isBinary = false,
	) => {
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

		const currentFragment = parseUrlFragments(
			window.location.hash.substring(1),
		);
		const newUrl = buildUrlWithFragments(currentFragment.yjsUrl, id);
		window.location.hash = newUrl;
		updateProjectLastOpened(id, undefined);
	};

	const handleSwitchToDocuments = () => {
		setActiveView("documents");
		setIsEditingFile(false);
	};

	const handleSwitchToFiles = async () => {
		console.log(
			"handleSwitchToFiles called, lastUserSelectedFileId:",
			lastUserSelectedFileId,
		);
		setActiveView("files");

		if (lastUserSelectedFileId && !isEditingFile) {
			try {
				const file = await getFile(lastUserSelectedFileId);
				console.log("Retrieved file for restoration:", file?.path);
				if (file) {
					const content = await getFileContent(lastUserSelectedFileId);
					if (content) {
						selectFile(lastUserSelectedFileId);
						handleUserFileSelect(
							lastUserSelectedFileId,
							content,
							file.isBinary || false,
						);
					}
				}
			} catch (error) {
				console.error("Error restoring last user selected file:", error);
			}
		}
	};

	const handleUpdateContent = (content: string) => {
		// Update the current editor content for outline
		setCurrentEditorContent(content);
		
		if (content !== (isEditingFile ? fileContent : content)) {
			onUpdateContent(content);
		}
	};

	const handleSidebarResize = (width: number) => {
		setSidebarWidth(width);
		setProperty("sidebar-width", width);
	};

	const handleSidebarCollapse = (collapsed: boolean) => {
		setSidebarCollapsed(collapsed);
		setProperty("sidebar-collapsed", collapsed);
	};

	const handleExplorerResize = (height: number) => {
		setOutlineHeight(height);
		setProperty("explorer-height", height);
	};

	const handleLatexOutputWidthResize = (width: number) => {
		setLatexOutputWidth(width);
		setProperty("latex-output-width", width);
	};

	const handleLatexOutputCollapse = (collapsed: boolean) => {
		setLatexOutputCollapsed(collapsed);
		setProperty("latex-output-collapsed", collapsed);
		// If user manually collapses, clear temporary expand
		if (collapsed) {
			setTemporaryLatexExpand(false);
		}
	};

	const handleLatexOutputExpand = () => {
	if (!showLatexOutput) {
		setShowLatexOutput(true);
	}
	// Temporarily expand without saving to properties
	setTemporaryLatexExpand(true);
	};

	const handleNavigateToLinkedFile = () => {
		if (linkedFileInfo?.filePath) {
			document.dispatchEvent(
				new CustomEvent("navigate-to-linked-file", {
					detail: {
						filePath: linkedFileInfo.filePath,
						fileId: linkedFileInfo.fileId,
					},
				}),
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
				className="sidebar-container"
			>
				<ResizablePanel
				direction="vertical"
				height={explorerHeight}
				minHeight={100}
				maxHeight={1000}
				alignment="end"
				onResize={handleExplorerResize}
				collapsible={false}
				className="explorer-container"
				>
				<div className="view-toggle">
					<button
						className={activeView === "files" ? "active" : ""}
						onClick={handleSwitchToFiles}
					>
						Files
					</button>
					<button
						className={activeView === "documents" ? "active" : ""}
						onClick={handleSwitchToDocuments}
					>
						Docs
					</button>
				</div>

				{activeView === "documents" ? (
					<DocumentExplorer
						documents={documents}
						selectedDocId={selectedDocId}
						onSelectDocument={handleDocumentSelect}
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
						onCreateDocument={handleCreateDocument}
						documents={documents.map((doc) => ({
							id: Number.parseInt(doc.id, 36),
							name: doc.name,
						}))}
						initialSelectedFile={initialSelectedFile}
						initialExpandedPaths={initialExpandedPaths}
						currentProjectId={sessionStorage.getItem("currentProjectId")}
						onExportCurrentProject={handleExportCurrentProject}
					/>
				)}
				</ResizablePanel>

				{showOutline && (
					<LaTeXOutline
						content={currentEditorContent}
						currentLine={currentLine}
						onSectionClick={handleOutlineSectionClick}
						onRefresh={handleOutlineRefresh}
					/>
				)}

			</ResizablePanel>

			<div
				className="editor-container-outer"
				style={{ flex: 1, display: "flex", minHeight: 0 }}
			>
				<div className="editor-container" style={{ flex: 1, minWidth: 0 }}>
					<Editor
						content={isEditingFile ? fileContent : content}
						documentId={selectedDocId || ""}
						onUpdateContent={handleUpdateContent}
						isDocumentSelected={isEditingFile || !!selectedDocId}
						isBinaryFile={isEditingFile && isBinaryFile}
						fileName={isEditingFile ? fileName : linkedFileInfo.fileName}
						mimeType={isEditingFile ? mimeType : linkedFileInfo.mimeType}
						fileId={
							isEditingFile ? selectedFileId || "" : linkedFileInfo.fileId || ""
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
					/>
				</div>

				{showLatexOutput && (
					<ResizablePanel
						direction="horizontal"
						width={latexOutputWidth}
						minWidth={400}
						maxWidth={1200}
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
							onExpandLatexOutput={pdfWindowService.isWindowOpen() ? undefined : handleLatexOutputExpand}
							linkedFileInfo={linkedFileInfo}
							docUrl={docUrl}
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

export default FileDocumentController;
