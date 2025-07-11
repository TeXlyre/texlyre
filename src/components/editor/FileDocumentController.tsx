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
import type { Document } from "../../types/documents";
import type { FileNode } from "../../types/files";
import type { Project } from "../../types/projects";
import { buildUrlWithFragments, parseUrlFragments } from "../../types/yjs";
import type { YjsDocUrl } from "../../types/yjs";
import ResizablePanel from "../common/ResizablePanel";
import LaTeXOutput from "../latex/LaTeXOutput";
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
	const { getProjectById } = useAuth();
	const { getProperty, setProperty, registerProperty } = useProperties();
	const propertiesRegistered = useRef(false);
	const [propertiesLoaded, setPropertiesLoaded] = useState(false);
	const [activeView, setActiveView] = useState<"documents" | "files">("files");
	const [hasNavigated, setHasNavigated] = useState(false);
	const [fileContent, setFileContent] = useState<string | ArrayBuffer>("");
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
	const [sidebarWidth, setSidebarWidth] = useState(
		currentLayout?.defaultFileExplorerWidth || 250,
	);
	const [latexOutputWidth, setLatexOutputWidth] = useState(550);
	const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
	const [latexOutputCollapsed, setLatexOutputCollapsed] = useState(false);
	const [showLatexOutput, setShowLatexOutput] = useState(false);
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
			defaultValue: 550,
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
	}, [registerProperty]);

	useEffect(() => {
		if (propertiesLoaded) return;

		const storedSidebarWidth = getProperty("sidebar-width");
		const storedLatexWidth = getProperty("latex-output-width");
		const storedSidebarCollapsed = getProperty("sidebar-collapsed");
		const storedLatexCollapsed = getProperty("latex-output-collapsed");

		// Only load if at least one property is available (meaning registration worked)
		if (
			storedSidebarWidth !== undefined ||
			storedLatexWidth !== undefined ||
			storedSidebarCollapsed !== undefined ||
			storedLatexCollapsed !== undefined
		) {
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

			setPropertiesLoaded(true);
		}
	}, [getProperty, propertiesLoaded]);

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

		const handleExpandLatexOutput = () => {
			if (!showLatexOutput) {
				setShowLatexOutput(true);
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
		document.addEventListener("expand-latex-output", handleExpandLatexOutput);

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
				handleExpandLatexOutput,
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
		if (targetDocId && targetDocId.trim()) {
			setActiveView("documents");
		}
	}, [targetDocId]);

	const handleCreateDocument = (name: string) => {
		onCreateDocument();
		const lastDoc = documents[documents.length - 1];
		onRenameDocument(lastDoc.id, name);
		return lastDoc.id;
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
		console.log(
			"handleUserFileSelect called for fileId:",
			fileId,
			"file path:",
			file?.path,
		);
		setLastUserSelectedFileId(fileId);
		handleFileSelect(fileId, content, isBinary);
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

	const handleLatexOutputWidthResize = (width: number) => {
		setLatexOutputWidth(width);
		setProperty("latex-output-width", width);
	};

	const handleLatexOutputCollapse = (collapsed: boolean) => {
		setLatexOutputCollapsed(collapsed);
		setProperty("latex-output-collapsed", collapsed);
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

	const handleExpandLatexOutput = () => {
		if (!showLatexOutput) {
			setShowLatexOutput(true);
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
						collapsed={latexOutputCollapsed}
						onCollapse={handleLatexOutputCollapse}
						className="latex-output-container"
					>
						<LaTeXOutput
							selectedDocId={selectedDocId}
							documents={documents}
							onNavigateToLinkedFile={handleNavigateToLinkedFile}
							onExpandLatexOutput={handleExpandLatexOutput}
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

export default FileDocumentController;
