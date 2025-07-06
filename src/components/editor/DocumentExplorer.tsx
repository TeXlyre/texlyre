// src/components/editor/DocumentExplorer.tsx
import type React from "react";
import { useRef, useState } from "react";

import { collabService } from "../../services/CollabService";
import type { Document } from "../../types/documents.ts";
import { buildUrlWithFragments, parseUrlFragments } from "../../types/yjs";
import type { YjsDocUrl } from "../../types/yjs.ts";
import DropdownPortal from "../common/DropdownPortal.tsx";
import {
	CopyIcon,
	DownloadIcon,
	EditIcon,
	FileTextIcon,
	InfoIcon,
	MoreIcon,
	PlusIcon,
	SyncIcon,
} from "../common/Icons.tsx";
import Modal from "../common/Modal.tsx";

interface FileViewerProps {
	documents: Document[];
	selectedDocId: string | null;
	onSelectDocument: (id: string) => void;
	onCreateDocument: () => void;
	onRenameDocument: (id: string, newName: string) => void;
	onUpdateContent: (content: string) => void;
	content: string;
	docUrl: YjsDocUrl;
	getDocumentContent: (projectUrl: string, docId: string) => Promise<string>;
}

interface DocumentPropertiesInfo {
	name: string;
	contentLength: number;
	lastModified?: Date;
}

const DocumentExplorer: React.FC<FileViewerProps> = ({
	documents,
	selectedDocId,
	onSelectDocument,
	onCreateDocument,
	onRenameDocument,
	onUpdateContent,
	content,
	docUrl,
	getDocumentContent,
}) => {
	const [editingDocId, setEditingDocId] = useState<string | null>(null);
	const [editName, setEditName] = useState("");
	const [activeMenu, setActiveMenu] = useState<string | null>(null);
	const menuRefs = useRef<Map<string, HTMLDivElement>>(new Map());
	const [showPropertiesModal, setShowPropertiesModal] = useState(false);
	const [propertiesInfo, setPropertiesInfo] =
		useState<DocumentPropertiesInfo | null>(null);

	// Sync state
	const [syncSession, setSyncSession] = useState<string | null>(null);
	const [syncProgress, setSyncProgress] = useState({ current: 0, total: 0 });

	const handleStartRename = (docId: string) => {
		setEditingDocId(docId);
		const doc = documents.find((d) => d.id === docId);
		setEditName(doc?.name || "");
		setActiveMenu(null);
	};

	const handleSaveRename = () => {
		if (editingDocId !== null && editName.trim()) {
			onRenameDocument(editingDocId, editName);
			setEditingDocId(null);
		}
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Enter") {
			handleSaveRename();
		} else if (e.key === "Escape") {
			setEditingDocId(null);
		}
	};

	const handleDuplicateDocument = async (docId: string) => {
		const doc = documents.find((d) => d.id === docId);
		if (!doc) return;

		const docContent = await getDocumentContent(docUrl, docId);

		onCreateDocument();
		const newIndex = documents.length;
		onRenameDocument(documents[newIndex].id, `${doc.name}_copy`);

		onUpdateContent(docContent);
		setActiveMenu(null);
	};

	const handleExportDocument = async (docId: string) => {
		const doc = documents.find((d) => d.id === docId);
		if (!doc) return;

		const exportContent = await getDocumentContent(docUrl, docId);

		const blob = new Blob([exportContent], { type: "text/plain" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = `${doc.name}.txt`;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
		setActiveMenu(null);
	};

	const handleShowProperties = async (docId: string) => {
		const doc = documents.find((d) => d.id === docId);
		if (!doc) return;

		const docContent = await getDocumentContent(docUrl, docId);
		const contentLength = docContent.length;

		const info: DocumentPropertiesInfo = {
			name: doc.name,
			contentLength: contentLength,
		};

		setPropertiesInfo(info);
		setShowPropertiesModal(true);
		setActiveMenu(null);
	};

	const handleDocumentSelect = (docId: string) => {
		onSelectDocument(docId);

		const currentFragment = parseUrlFragments(
			window.location.hash.substring(1),
		);
		const newUrl = buildUrlWithFragments(currentFragment.yjsUrl, docId);
		window.location.hash = newUrl;
	};

	const handleSyncAll = async () => {
		if (syncSession || documents.length === 0) return;

		try {
			setSyncProgress({ current: 0, total: 0 });

			// Extract project ID from docUrl
			const projectId = docUrl.startsWith("yjs:") ? docUrl.slice(4) : docUrl;

			const sessionId = await collabService.syncAllDocuments(
				projectId,
				(current, total) => {
					setSyncProgress({ current, total });
				},
			);

			setSyncSession(sessionId);
			console.log("All documents connected for real-time sync");
		} catch (error) {
			console.error("Error starting document sync:", error);
		}
	};

	const handleStopSync = () => {
		if (!syncSession) return;

		try {
			collabService.stopSyncAllDocuments(syncSession);
			setSyncSession(null);
			setSyncProgress({ current: 0, total: 0 });
			console.log("Document sync stopped");
		} catch (error) {
			console.error("Error stopping document sync:", error);
		}
	};

	const getSyncButtonText = () => {
		if (!syncSession) return "Sync All";
		if (syncProgress.total === 0) return "Connecting...";
		return `Sync Active (${syncProgress.current}/${syncProgress.total})`;
	};

	return (
		<>
			<div className="file-explorer">
				<div className="file-explorer-header">
					<h3>Documents</h3>
					<div className="file-explorer-actions">
						{syncSession ? (
							<button
								className="action-btn"
								title="Stop Sync"
								onClick={handleStopSync}
								style={{ backgroundColor: "var(--accent-color)" }}
							>
								<SyncIcon />
							</button>
						) : (
							<button
								className="action-btn"
								title="Sync All Documents"
								onClick={handleSyncAll}
								disabled={documents.length === 0}
							>
								<SyncIcon />
							</button>
						)}
						<button
							className="action-btn"
							title="New Document"
							onClick={onCreateDocument}
						>
							<PlusIcon />
						</button>
					</div>
				</div>

				{syncSession && syncProgress.total > 0 && (
					<div
						className="sync-progress"
						style={{
							padding: "0.5rem",
							fontSize: "0.8rem",
							color: "var(--accent-color)",
							borderBottom: "1px solid var(--border-color)",
							backgroundColor: "var(--accent-color)",
						}}
					>
						🔄 {getSyncButtonText()} - Real-time sync active
					</div>
				)}

				<div className="file-tree">
					{documents.map((doc) => (
						<div
							key={doc.id}
							className={`file-node ${selectedDocId === doc.id ? "selected" : ""}`}
							onClick={() => handleDocumentSelect(doc.id)}
						>
							<span className="file-icon">
								<FileTextIcon />
							</span>
							{editingDocId === doc.id ? (
								<input
									type="text"
									value={editName}
									onChange={(e) => setEditName(e.target.value)}
									onBlur={handleSaveRename}
									onKeyDown={handleKeyDown}
									onClick={(e) => e.stopPropagation()}
									className="file-name-input"
								/>
							) : (
								<span className="file-name">{doc.name}</span>
							)}

							<div className="file-actions">
								<div
									className="action-menu"
									ref={(el) => {
										if (el) {
											menuRefs.current.set(doc.id, el);
										} else {
											menuRefs.current.delete(doc.id);
										}
									}}
								>
									<button
										className="action-btn menu-trigger"
										title="Options"
										onClick={(e) => {
											e.stopPropagation();
											setActiveMenu(activeMenu === doc.id ? null : doc.id);
										}}
									>
										<MoreIcon />
									</button>
									<DropdownPortal
										targetRef={
											menuRefs.current.get(doc.id)
												? { current: menuRefs.current.get(doc.id)! }
												: { current: null }
										}
										isOpen={activeMenu === doc.id}
										onClose={() => setActiveMenu(null)}
									>
										<button
											className="dropdown-item"
											onClick={() => {
												handleStartRename(doc.id);
												setActiveMenu(null);
											}}
										>
											<EditIcon />
											<span>Rename</span>
										</button>

										<button
											className="dropdown-item"
											onClick={() => {
												handleDuplicateDocument(doc.id);
												setActiveMenu(null);
											}}
										>
											<CopyIcon />
											<span>Duplicate</span>
										</button>

										<button
											className="dropdown-item"
											onClick={() => {
												handleExportDocument(doc.id);
												setActiveMenu(null);
											}}
										>
											<DownloadIcon />
											<span>Download</span>
										</button>

										<button
											className="dropdown-item"
											onClick={() => {
												handleShowProperties(doc.id);
												setActiveMenu(null);
											}}
										>
											<InfoIcon />
											<span>Properties</span>
										</button>
									</DropdownPortal>
								</div>
							</div>
						</div>
					))}
				</div>
			</div>

			{showPropertiesModal && propertiesInfo && (
				<Modal
					isOpen={showPropertiesModal}
					onClose={() => setShowPropertiesModal(false)}
					title="Document Properties"
					size="medium"
				>
					<div className="document-properties">
						<div className="property-item">
							<strong>Name:</strong> {propertiesInfo.name}
						</div>
						<div className="property-item">
							<strong>Content Length:</strong> {propertiesInfo.contentLength}{" "}
							characters
						</div>
					</div>
				</Modal>
			)}
		</>
	);
};

export default DocumentExplorer;
