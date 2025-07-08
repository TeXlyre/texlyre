// src/components/editor/Editor.tsx
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import { CommentProvider } from "../../contexts/CommentContext";
import { processComments } from "../../extensions/codemirror/CommentExtension.ts";
import { useComments } from "../../hooks/useComments";
import { usePluginFileInfo } from "../../hooks/usePluginFileInfo";
import type {
	CollaborativeViewerProps,
	ViewerProps,
} from "../../plugins/PluginInterface";
import { pluginRegistry } from "../../plugins/PluginRegistry";
import { EditorLoader } from "../../services/EditorLoader.ts";
import { fileCommentProcessor } from "../../services/FileCommentProcessor";
import { fileStorageService } from "../../services/FileStorageService";
import { copyCleanTextToClipboard } from "../../utils/clipboardUtils";
import { arrayBufferToString } from "../../utils/fileUtils";
import CommentPanel from "../comments/CommentPanel";
import CommentToggleButton from "../comments/CommentToggleButton";
import { CopyIcon, DownloadIcon, LinkIcon, SaveIcon } from "../common/Icons";
import { PluginHeader, PluginControlGroup } from "../common/PluginHeader";

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
	documents?: Array<{ id: string; name: string }>;
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
	onExport?: () => void;
	linkedFileInfo?: {
		fileName?: string;
		filePath?: string;
		fileId?: string;
	} | null;
	onNavigateToLinkedFile?: () => void;
	documents?: Array<{ id: string; name: string }>;
	shouldShowLatexOutput?: boolean;
	onSaveDocument?: () => void;
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
}) => {
	const { parseComments, getCommentAtPosition, addComment, updateComments } =
		useComments();
	const fileInfo = usePluginFileInfo(fileId, fileName);

	const { viewRef, isUpdatingRef, showSaveIndicator } = EditorLoader(
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
	);

	useEffect(() => {
		if (isDocumentSelected && textContent) {
			updateComments(textContent);
		}
	}, [textContent, isDocumentSelected, updateComments]);

	useEffect(() => {
		if (shouldShowLatexOutput) {
			document.dispatchEvent(new CustomEvent("show-latex-output"));
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
		[parseComments, updateComments, viewRef],
	);

	useEffect(() => {
		document.addEventListener(
			"codemirror-content-changed",
			handleContentChanged,
		);

		return () => {
			document.removeEventListener(
				"codemirror-content-changed",
				handleContentChanged,
			);
		};
	}, [handleContentChanged]);

	const tooltipInfo =
		isEditingFile && fileName
			? [
				`File: ${fileName}`,
				`Path: ${filePath || fileInfo.filePath}`,
				`Mode: ${isViewOnly ? "Read-only" : "Editing"}`,
				linkedDocumentId ? `Linked to document: ${linkedDocumentId}` : "",
				`MIME Type: ${fileInfo.mimeType || "text/plain"}`,
				`Size: ${fileInfo.fileSize ? Math.round(fileInfo.fileSize / 1024) + " KB" : "Unknown"}`,
				`Last Modified: ${fileInfo.lastModified ? new Date(fileInfo.lastModified).toLocaleString() : "Unknown"}`
			]
			: !isEditingFile && documentId && documents
				? [
					`Document: ${documents.find((d) => d.id === documentId)?.name || "Untitled"}`,
					linkedFileInfo ? `Linked File: ${linkedFileInfo.fileName}` : "",
					linkedFileInfo ? `Path: ${linkedFileInfo.filePath}` : "No linked file",
					"Mode: Collaborative editing",
					"Type: Text document"
				]
				: "";

	const handleCopyLinkedFile = async () => {
		if (!linkedFileInfo?.fileId) return;
		try {
			const file = await fileStorageService.getFile(linkedFileInfo.fileId);
			if (file && file.content) {
				const content =
					typeof file.content === "string"
						? file.content
						: new TextDecoder().decode(file.content);
				await copyCleanTextToClipboard(content);
			}
		} catch (error) {
			console.error("Error copying linked file:", error);
		}
	};

	const handleDownloadLinkedFile = async () => {
		if (!linkedFileInfo?.fileId || !linkedFileInfo.fileName) return;
		try {
			const file = await fileStorageService.getFile(linkedFileInfo.fileId);
			if (file && file.content) {
				const content =
					typeof file.content === "string"
						? file.content
						: new TextDecoder().decode(file.content);
				const cleanedContent =
					fileCommentProcessor.processTextSelection(content);
				const blob = new Blob([cleanedContent], {
					type: "text/plain;charset=utf-8",
				});
				const url = URL.createObjectURL(blob);
				const a = document.createElement("a");
				a.href = url;
				a.download = linkedFileInfo.fileName;
				document.body.appendChild(a);
				a.click();
				document.body.removeChild(a);
				URL.revokeObjectURL(url);
			}
		} catch (error) {
			console.error("Error downloading linked file:", error);
		}
	};

	const headerControls =
		isEditingFile && fileName ? (
			<PluginControlGroup>
				{!isViewOnly && onSave && (
					<button
						onClick={onSave}
						title="Save File (Ctrl+S)"
						className="control-button"
					>
						<SaveIcon />
					</button>
				)}
				<button
					onClick={() => copyCleanTextToClipboard(textContent)}
					title="Copy text"
					className="control-button"
				>
					<CopyIcon />
				</button>
				{onExport && (
					<button
						onClick={onExport}
						title="Download File"
						className="control-button"
					>
						<DownloadIcon />
					</button>
				)}
				{!isViewOnly && (
					<CommentToggleButton className="header-comment-button" />
				)}
			</PluginControlGroup>
		) : !isEditingFile && linkedFileInfo ? (
			<PluginControlGroup>
				{onSaveDocument && (
					<button
						onClick={onSaveDocument}
						title="Save Document to Linked File (Ctrl+S)"
						className="control-button"
					>
						<SaveIcon />
					</button>
				)}
				<button
					onClick={handleCopyLinkedFile}
					title={`Copy text from linked file: ${linkedFileInfo.fileName}`}
					className="control-button"
				>
					<CopyIcon />
				</button>
				<button
					onClick={handleDownloadLinkedFile}
					title={`Download linked file: ${linkedFileInfo.fileName}`}
					className="control-button"
				>
					<DownloadIcon />
				</button>
				{!isViewOnly && (
					<CommentToggleButton className="header-comment-button" />
				)}
			</PluginControlGroup>
		) : !isEditingFile && documentId && documents ? (
			<PluginControlGroup>
				<button
					onClick={() => copyCleanTextToClipboard(textContent)}
					title="Copy text"
					className="control-button"
				>
					<CopyIcon />
				</button>
				{!isViewOnly && (
					<CommentToggleButton className="header-comment-button" />
				)}
			</PluginControlGroup>
		) : null;

	return (
		<>
			{((isEditingFile && fileName) ||
				(!isEditingFile && documentId && documents)) && (
				<PluginHeader
					fileName={
						isEditingFile
							? fileInfo.fileName
							: documents?.find((d) => d.id === documentId)?.name || "Document"
					}
					filePath={
						isEditingFile
							? filePath || fileInfo.filePath
							: linkedFileInfo?.filePath
					}
					pluginName={isEditingFile ? "Text Editor" : "Document Editor"}
					pluginVersion="1.0.0"
					tooltipInfo={tooltipInfo}
					controls={headerControls}
					onNavigateToLinkedFile={!isEditingFile && linkedFileInfo ? onNavigateToLinkedFile : undefined}
					linkedFileInfo={!isEditingFile ? linkedFileInfo : null}
				/>
			)}

			<div className="editor-toolbar">
				{isViewOnly && linkedDocumentId && (
					<div className="linked-file-notice">
						<span>
							Read-only: This file is linked to a collaborative document{" "}
						</span>
						<button
							className="link-button"
							onClick={onDocumentNavigation}
							title="Navigate to linked document"
						>
							View linked document
						</button>
					</div>
				)}
			</div>

			<div className="editor-main-container">
				<div
					className="editor-wrapper"
					style={{ flex: 1, position: "relative" }}
				>
					<div ref={editorRef} className="codemirror-editor-container" />

					{showSaveIndicator && (
						<div className="save-indicator">
							<span>Saved</span>
						</div>
					)}
				</div>

				{!isViewOnly && <CommentPanel className="editor-comment-panel" />}
			</div>
		</>
	);
};

const Editor: React.FC<EditorComponentProps> = ({
	content,
	documentId,
	onUpdateContent,
	isDocumentSelected,
	isBinaryFile = false,
	fileName = "",
	mimeType,
	fileId = "",
	docUrl,
	documentSelectionChange = 0,
	isEditingFile = false,
	onSelectDocument,
	onSwitchToDocuments,
	linkedDocumentId,
	documents,
}) => {
	const [textContent, setTextContent] = useState<string>("");
	const [filePath, setFilePath] = useState<string>("");
	const [linkedFileInfo, setLinkedFileInfo] = useState<{
		fileName?: string;
		filePath?: string;
		fileId?: string;
	} | null>(null);
	const editorRef = useRef<HTMLDivElement>(null);
	const isUpdatingRef = useRef<boolean>(false);

	useEffect(() => {
		const checkLinkedFile = async () => {
			if (!isEditingFile && documentId && documents) {
				try {
					const allFiles = await fileStorageService.getAllFiles();
					const linkedFile = allFiles.find(
						(file) => file.documentId === documentId,
					);

					if (linkedFile) {
						setLinkedFileInfo({
							fileName: linkedFile.name,
							filePath: linkedFile.path,
							fileId: linkedFile.id,
						});
					} else {
						setLinkedFileInfo(null);
					}
				} catch (error) {
					console.error("Error checking for linked file:", error);
					setLinkedFileInfo(null);
				}
			} else {
				setLinkedFileInfo(null);
			}
		};

		checkLinkedFile();
	}, [documentId, documents, isEditingFile, documentSelectionChange]);

	useEffect(() => {
		const handleDocumentSelected = (event: Event) => {
			const customEvent = event as CustomEvent;
			const { documentId: selectedDocId } = customEvent.detail;

			if (selectedDocId === documentId && !isEditingFile) {
				const checkAndUpdateLinkedFile = async () => {
					try {
						const allFiles = await fileStorageService.getAllFiles();
						const linkedFile = allFiles.find(
							(file) => file.documentId === selectedDocId,
						);

						if (linkedFile) {
							setLinkedFileInfo({
								fileName: linkedFile.name,
								filePath: linkedFile.path,
								fileId: linkedFile.id,
							});
						} else {
							setLinkedFileInfo(null);
						}
					} catch (error) {
						console.error("Error checking for linked file:", error);
						setLinkedFileInfo(null);
					}
				};

				checkAndUpdateLinkedFile();
			}
		};

		document.addEventListener("document-selected", handleDocumentSelected);

		return () => {
			document.removeEventListener("document-selected", handleDocumentSelected);
		};
	}, [documentId, isEditingFile]);

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

	useEffect(() => {
		if (content instanceof ArrayBuffer) {
			setTextContent(arrayBufferToString(content));
		} else if (typeof content === "string") {
			setTextContent(content);
		} else {
			setTextContent("");
		}
	}, [content]);

	useEffect(() => {
		const loadFilePath = async () => {
			if (isEditingFile && fileId) {
				try {
					const file = await fileStorageService.getFile(fileId);
					if (file) {
						setFilePath(file.path);
					}
				} catch (error) {
					console.error("Error loading file path:", error);
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
				new CustomEvent("trigger-save", {
					detail: { fileId, isFile: true },
				}),
			);
		}
	};

	const handleSaveDocument = () => {
		if (!isEditingFile && documentId) {
			if (editorRef.current) {
				document.dispatchEvent(
					new CustomEvent("trigger-save", {
						detail: { documentId, isFile: false },
					}),
				);
			}
		}
	};

	const handleExport = () => {
		if (!fileName) return;

		try {
			const cleanedText =
				fileCommentProcessor.processTextSelection(textContent);
			const blob = new Blob([cleanedText], {
				type: "text/plain;charset=utf-8",
			});
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = fileName;
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			URL.revokeObjectURL(url);
		} catch (error) {
			console.error("Error exporting file:", error);
		}
	};

	const shouldUseCollaborativeViewer =
		!isEditingFile && fileName && linkedDocumentId;
	const collaborativeViewerPlugin = shouldUseCollaborativeViewer
		? pluginRegistry.getCollaborativeViewerForFile(fileName, mimeType)
		: null;

	const viewerPlugin =
		isEditingFile && fileName
			? pluginRegistry.getViewerForFile(fileName, mimeType)
			: null;

	console.log("Editor plugin selection debug:", {
		isEditingFile,
		fileName,
		mimeType,
		linkedDocumentId,
		shouldUseCollaborativeViewer,
		collaborativeViewerPlugin: collaborativeViewerPlugin?.name || "none",
		viewerPlugin: viewerPlugin?.name || "none",
		documentId,
		fileId,
		isDocumentSelected,
		availableCollaborativeViewers: pluginRegistry
			.getCollaborativeViewers()
			.map((p) => p.name),
	});

	if (
		collaborativeViewerPlugin &&
		!isEditingFile &&
		shouldUseCollaborativeViewer
	) {
		console.log("Using collaborative viewer:", collaborativeViewerPlugin.name);
		const CollaborativeViewerComponent = collaborativeViewerPlugin.renderViewer;

		return (
			<CommentProvider
				editorContent={textContent}
				onUpdateContent={onUpdateContent}
			>
				<div className="editor-container viewer-container collaborative-viewer">
					<div className="viewer-plugin-info">
						<span>
							Collaborative viewing with {collaborativeViewerPlugin.name} v
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
						}}
					/>
				</div>
			</CommentProvider>
		);
	}

	if (viewerPlugin && isEditingFile) {
		console.log("Using regular viewer for file editing:", viewerPlugin.name);
		const ViewerComponent = viewerPlugin.renderViewer;
		const viewerProps: ViewerProps = {
			fileId,
			content: content as ArrayBuffer,
			mimeType,
			fileName,
		};

		return (
			<div className="editor-container viewer-container">
				<div className="viewer-plugin-info">
					<span>
						Viewing with {viewerPlugin.name} v{viewerPlugin.version}
					</span>
				</div>
				<ViewerComponent {...viewerProps} />
			</div>
		);
	}

	if (isBinaryFile) {
		return (
			<div className="editor-container binary-file">
				<div className="binary-file-message">
					<h3>Binary File</h3>
					<p>This file cannot be edited in the text editor.</p>
					<p>Please download the file to view or edit its contents.</p>
				</div>
			</div>
		);
	}

	if (!isDocumentSelected) {
		return (
			<div className="editor-container empty-state">
			   <p>Select a file or create a new one to start editing.</p>

			   <br /><br /><br /><br />

			   <p style={{ fontStyle: 'italic'}}>
				   Linking files allows you to view the cursor positions and text changes by your collaborators in real-time.
				   To link a text file to a document, select or hover over the file and click the <LinkIcon/>
				   <strong>Link</strong> button that appears next to it.</p>
			</div>
		);
	}

	const isViewOnly =
		isEditingFile && linkedDocumentId && !collaborativeViewerPlugin;

	const handleContentUpdate = (newContent: string) => {
		if (!isUpdatingRef.current && !isViewOnly) {
			onUpdateContent(newContent);
		}
	};

	const shouldShowLatexOutput =
		!isEditingFile && linkedFileInfo?.fileName?.endsWith(".tex");

	return (
		<CommentProvider
			editorContent={textContent}
			onUpdateContent={handleContentUpdate}
		>
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
				/>
			</div>
		</CommentProvider>
	);
};

export default Editor;