// src/components/editor/Editor.tsx
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import { LSPProvider } from '../../contexts/LSPContext';
import { CommentProvider } from "../../contexts/CommentContext";
import { processComments } from "../../extensions/codemirror/CommentExtension.ts";
import { useCollab } from "../../hooks/useCollab";
import { useComments } from "../../hooks/useComments";
import { usePluginFileInfo } from "../../hooks/usePluginFileInfo";
import type {
	CollaborativeViewerProps,
	ViewerProps,
} from "../../plugins/PluginInterface";
import { pluginRegistry } from "../../plugins/PluginRegistry";
import { EditorLoader } from "../../services/EditorLoader.ts";
import { fileStorageService } from "../../services/FileStorageService";
import type { DocumentList } from "../../types/documents.ts";
import { buildUrlWithFragments, parseUrlFragments } from "../../types/yjs";
import { copyCleanTextToClipboard } from "../../utils/clipboardUtils";
import { fileCommentProcessor } from "../../utils/fileCommentProcessor.ts";
import { arrayBufferToString } from "../../utils/fileUtils";
import CommentPanel from "../comments/CommentPanel";
import CommentToggleButton from "../comments/CommentToggleButton";
import LSPToggleButton from "../lsp/LSPToggleButton";
import LSPPanel from "../lsp/LSPPanel";
import CommentModal from "../comments/CommentModal";
import {
	CopyIcon,
	DownloadIcon,
	FileTextIcon,
	LinkIcon,
	SaveIcon,
} from "../common/Icons";
import { PluginControlGroup, PluginHeader } from "../common/PluginHeader";
import UnlinkedDocumentNotice from "./UnlinkedDocumentNotice";

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
	linkedFileInfo?: {
		fileName?: string;
		mimeType?: string;
		fileId?: string;
		filePath?: string;
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
	onSelectDocument?: (docId: string) => void;
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
}) => {
	const [showUnlinkedNotice, setShowUnlinkedNotice] = useState(false);
	const { parseComments, getCommentAtPosition, addComment, updateComments } =
		useComments();
	const fileInfo = usePluginFileInfo(fileId, fileName);
	const { data: doc, changeData: changeDoc } = useCollab<DocumentList>();
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
		true
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
		let timeoutId: NodeJS.Timeout;

		if (
			!isEditingFile &&
			documentId &&
			!linkedFileInfo?.fileName &&
			documents
		) {
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
								{ from: selection.from, insert: rawComment.openTag },
							],
						});
						updateComments(viewRef.current.state.doc.toString());
					}
				} catch (error) {
					console.error("Error adding comment:", error);
				}
			}
		};

		document.addEventListener("add-comment-to-editor", handleAddCommentToEditor);

		return () => {
			document.removeEventListener("add-comment-to-editor", handleAddCommentToEditor);
		};
	}, [viewRef, isViewOnly, addComment, updateComments]);

	const tooltipInfo =
		isEditingFile && fileName
			? [
					`File: ${fileName}`,
					`Path: ${filePath || fileInfo.filePath}`,
					`Mode: ${isViewOnly ? "Read-only" : "Editing"}`,
					linkedDocumentId ? `Linked to document: ${linkedDocumentId}` : "",
					`MIME Type: ${fileInfo.mimeType || "text/plain"}`,
					`Size: ${fileInfo.fileSize ? `${Math.round(fileInfo.fileSize / 1024)} KB` : "Unknown"}`,
					`Last Modified: ${fileInfo.lastModified ? new Date(fileInfo.lastModified).toLocaleString() : "Unknown"}`,
				]
			: !isEditingFile && documentId && documents
				? [
						`Document: ${documents.find((d) => d.id === documentId)?.name || "Untitled"}`,
						linkedFileInfo ? `Linked File: ${linkedFileInfo.fileName}` : "",
						linkedFileInfo
							? `Path: ${linkedFileInfo.filePath}`
							: "No linked file",
						"Mode: Collaborative editing",
						"Type: Text document",
					]
				: "";

	const handleCopyLinkedFile = async () => {
		if (!linkedFileInfo?.fileId) return;
		try {
			const file = await fileStorageService.getFile(linkedFileInfo.fileId);
			if (file?.content) {
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
			if (file?.content) {
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
	const fileExtension = fileName?.split('.').pop()?.toLowerCase();
	const availableLSPPlugins = fileExtension ?
		pluginRegistry.getLSPPluginsForFileType(fileExtension) : [];

	const headerControls =
		isEditingFile && fileName ? (
			<>
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

				{/* LSP Plugin Controls */}
				{availableLSPPlugins.length > 0 && (
					<PluginControlGroup>
						{availableLSPPlugins.map(plugin => (
							<LSPToggleButton
								key={plugin.id}
								pluginId={plugin.id}
								className="header-lsp-button"
							/>
						))}
					</PluginControlGroup>
				)}
			</>
		) : !isEditingFile && linkedFileInfo && !showUnlinkedNotice ? (
			<>
				<PluginControlGroup>
					{onSaveDocument && (
						<button
							onClick={onSaveDocument}
							title="Save document to linked file (Ctrl+S)"
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

				{/* LSP Plugin Controls for linked files */}
				{linkedFileInfo?.fileName && (() => {
					const linkedFileExtension = linkedFileInfo.fileName.split('.').pop()?.toLowerCase();
					const linkedLSPPlugins = linkedFileExtension ?
						pluginRegistry.getLSPPluginsForFileType(linkedFileExtension) : [];

					return linkedLSPPlugins.length > 0 && (
						<PluginControlGroup>
							{linkedLSPPlugins.map(plugin => (
								<LSPToggleButton
									key={plugin.id}
									pluginId={plugin.id}
									className="header-lsp-button"
								/>
							))}
						</PluginControlGroup>
					);
				})()}
			</>
		) : !isEditingFile && documentId && documents ? (
			<>
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

				{/* LSP Plugin Controls for documents (detect LaTeX content) */}
				{textContent?.includes('\\') && (() => {
					const texLSPPlugins = pluginRegistry.getLSPPluginsForFileType('tex');
					return texLSPPlugins.length > 0 && (
						<PluginControlGroup>
							{texLSPPlugins.map(plugin => (
								<LSPToggleButton
									key={plugin.id}
									pluginId={plugin.id}
									className="header-lsp-button"
								/>
							))}
						</PluginControlGroup>
					);
				})()}
			</>
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
					onNavigateToLinkedFile={
						!isEditingFile && linkedFileInfo
							? onNavigateToLinkedFile
							: undefined
					}
					linkedFileInfo={!isEditingFile ? linkedFileInfo : null}
				/>
			)}

			<div className="editor-toolbar">
				{isViewOnly && linkedDocumentId && (
					<div className="linked-file-notice">
						<span>
							Read-only: This file is linked to a collaborative document{" "}
						</span>
						<div className="linked-file-actions">
							<button
								className="link-button"
								onClick={onDocumentNavigation}
								title="Navigate to linked document"
							>
								<FileTextIcon />
								View linked doc
							</button>
						</div>
					</div>
				)}

				{showUnlinkedNotice && (
					<UnlinkedDocumentNotice
						documentId={documentId}
						documentName={
							documents.find((d) => d.id === documentId)?.name || "Untitled"
						}
						onDeleteDocument={(docId) => {
							if (!changeDoc) {
								console.error(
									"Cannot delete document: changeData not available",
								);
								return;
							}

							changeDoc((data) => {
								if (!data.documents) return;

								const docIndex = data.documents.findIndex(
									(d) => d.id === docId,
								);
								if (docIndex >= 0) {
									data.documents.splice(docIndex, 1);
								}

								if (data.currentDocId === docId) {
									data.currentDocId =
										data.documents.length > 0 ? data.documents[0].id : "";
								}
							});

							const remainingDocs = documents.filter((d) => d.id !== docId);
							if (remainingDocs.length > 0 && onSelectDocument) {
								const newSelectedId = remainingDocs[0].id;
								onSelectDocument(newSelectedId);
								const currentFragment = parseUrlFragments(
									window.location.hash.substring(1),
								);
								const newUrl = buildUrlWithFragments(
									currentFragment.yjsUrl,
									newSelectedId,
								);
								window.location.hash = newUrl;
							} else if (onSelectDocument) {
								onSelectDocument("");
								const currentFragment = parseUrlFragments(
									window.location.hash.substring(1),
								);
								const newUrl = buildUrlWithFragments(currentFragment.yjsUrl);
								window.location.hash = newUrl;
							}
						}}
						onDocumentLinked={() => {
							window.location.reload();
						}}
					/>
				)}
			</div>

			<div className="editor-main-container">
				<div
					className="editor-wrapper"
					style={{ flex: 1, position: "relative" }}
				>
					<div ref={editorRef} className="codemirror-editor-container" />

					{showSaveIndicator && (
						<div className={`save-indicator ${isViewOnly ? 'read-only' : ''}`}>
							<span>{isViewOnly ? 'Cannot Save Read-Only' : 'Saved'}</span>
						</div>
					)}
				</div>

				{!isViewOnly && <CommentPanel className="editor-comment-panel" />}
				{!isViewOnly && <LSPPanel className="editor-lsp-panel" />}
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
	linkedFileInfo,
}) => {
	const [textContent, setTextContent] = useState<string>("");
	const [filePath, setFilePath] = useState<string>("");
	const [showCommentModal, setShowCommentModal] = useState(false);
	const [pendingSelection, setPendingSelection] = useState<{ from: number; to: number } | null>(null);

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

		document.addEventListener("show-comment-modal", handleShowCommentModal);

		return () => {
			document.removeEventListener("show-comment-modal", handleShowCommentModal);
		};
	}, []);

	const handleCommentSubmit = (content: string) => {
		if (!pendingSelection) return;

		document.dispatchEvent(
			new CustomEvent("add-comment-to-editor", {
				detail: { content, selection: pendingSelection },
			})
		);

		setPendingSelection(null);
	};

	const handleShowCommentModal = (event: Event) => {
		const customEvent = event as CustomEvent;
		const { selection } = customEvent.detail;
		if (selection && selection.from !== selection.to) {
			setPendingSelection(selection);
			setShowCommentModal(true);

			document.dispatchEvent(new CustomEvent("hide-floating-comment-button"));
		}
	};

	const handleCommentModalClose = () => {
		setShowCommentModal(false);
		setPendingSelection(null);

		document.dispatchEvent(new CustomEvent("comment-modal-closed"));
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
		isEditingFile && fileName && !linkedDocumentId
			? pluginRegistry.getViewerForFile(fileName, mimeType)
			: null;

	if (
		collaborativeViewerPlugin &&
		!isEditingFile &&
		shouldUseCollaborativeViewer
	) {
		const CollaborativeViewerComponent = collaborativeViewerPlugin.renderViewer;

		return (
			<LSPProvider>
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
				<CommentModal
					isOpen={showCommentModal}
					onClose={handleCommentModalClose}
					onCommentSubmit={handleCommentSubmit}
				/>
			</CommentProvider>
			</LSPProvider>
		);
	}

	if (viewerPlugin && isEditingFile) {
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

				<br />
				<br />
				<br />
				<br />

				<p style={{ fontStyle: "italic" }}>
					Linking files allows you to view the cursor positions and text changes
					by your collaborators in real-time. To link a text file to a document,
					select or hover over the file and click the <LinkIcon />
					<strong>Link</strong> button that appears next to it.
				</p>
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
		<LSPProvider>
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
					onSelectDocument={onSelectDocument}
				/>
			</div>
			<CommentModal
				isOpen={showCommentModal}
				onClose={handleCommentModalClose}
				onCommentSubmit={handleCommentSubmit}
			/>
		</CommentProvider>
		</LSPProvider>
	);
};

export default Editor;