// src/components/project/ProjectExportModal.tsx
import type React from "react";
import { useState } from "react";
import {
	type ExportOptions,
	accountExportService,
} from "../../services/AccountExportService";
import type { Project } from "../../types/projects";
import { formatDate } from "../../utils/dateUtils";
import { ExportIcon, FileIcon, FolderIcon } from "../common/Icons";
import Modal from "../common/Modal";

interface ProjectExportModalProps {
	isOpen: boolean;
	onClose: () => void;
	selectedProjects: Project[];
}

const ProjectExportModal: React.FC<ProjectExportModalProps> = ({
	isOpen,
	onClose,
	selectedProjects,
}) => {
	const [exportFormat, setExportFormat] = useState<"texlyre" | "files-only">(
		"texlyre",
	);
	const [includeDocuments, setIncludeDocuments] = useState(true);
	const [includeFiles, setIncludeFiles] = useState(true);
	const [isExporting, setIsExporting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const handleExport = async () => {
		if (selectedProjects.length === 0) return;

		setIsExporting(true);
		setError(null);

		try {
			const options: ExportOptions = {
				includeAccount: false,
				includeDocuments: exportFormat === "texlyre" ? includeDocuments : false,
				includeFiles,
				format: exportFormat,
				projectIds: selectedProjects.map((p) => p.id),
			};

			await accountExportService.exportProjects(
				selectedProjects.map((p) => p.id),
				options,
			);

			onClose();
		} catch (err) {
			setError(err instanceof Error ? err.message : "Export failed");
		} finally {
			setIsExporting(false);
		}
	};

	const handleClose = () => {
		setError(null);
		setIsExporting(false);
		onClose();
	};

	return (
		<Modal
			isOpen={isOpen}
			onClose={handleClose}
			title="Export Projects"
			size="medium"
		>
			<div className="project-export-modal">
				{error && (
					<div className="error-message" style={{ marginBottom: "1rem" }}>
						{error}
					</div>
				)}

				<div className="export-info">
					<p>
						Export {selectedProjects.length} project
						{selectedProjects.length === 1 ? "" : "s"} in your preferred format.
					</p>
				</div>

				<div
					className="selected-projects-list"
					style={{ maxHeight: "200px", overflowY: "auto", margin: "1rem 0" }}
				>
					{selectedProjects.map((project) => (
						<div
							key={project.id}
							className="project-item"
							style={{
								padding: "0.5rem",
								borderBottom: "1px solid var(--border-color)",
							}}
						>
							<strong>{project.name}</strong>
							<div
								style={{ fontSize: "0.875rem", color: "var(--text-secondary)" }}
							>
								{project.description || "No description"} • Last modified:{" "}
								{formatDate(project.updatedAt)}
							</div>
						</div>
					))}
				</div>

				<div className="export-format-selection">
					<h3>Export Format</h3>

					<div className="format-options" style={{ margin: "1rem 0" }}>
						<div
							className={`format-option ${exportFormat === "texlyre" ? "selected" : ""}`}
							onClick={() => setExportFormat("texlyre")}
							style={{
								border: "1px solid var(--border-color)",
								borderRadius: "8px",
								padding: "1rem",
								marginBottom: "0.75rem",
								cursor: "pointer",
								backgroundColor:
									exportFormat === "texlyre"
										? "rgba(var(--accent-color-rgb), 0.1)"
										: "transparent",
								borderColor:
									exportFormat === "texlyre"
										? "var(--accent-color)"
										: "var(--border-color)",
							}}
						>
							<label
								style={{
									display: "flex",
									alignItems: "flex-start",
									gap: "0.75rem",
									cursor: "pointer",
								}}
							>
								<input
									type="radio"
									name="exportFormat"
									value="texlyre"
									checked={exportFormat === "texlyre"}
									onChange={() => setExportFormat("texlyre")}
									style={{ marginTop: "0.125rem" }}
								/>
								<div className="option-content">
									<div
										className="option-header"
										style={{
											display: "flex",
											alignItems: "center",
											gap: "0.5rem",
											marginBottom: "0.5rem",
										}}
									>
										<FolderIcon />
										<strong>TeXlyre Format</strong>
									</div>
									<p style={{ margin: "0", color: "var(--text-secondary)" }}>
										Complete project export including documents, collaboration
										data, and files. Can be imported back into TeXlyre.
									</p>
								</div>
							</label>
						</div>

						<div
							className={`format-option ${exportFormat === "files-only" ? "selected" : ""}`}
							onClick={() => setExportFormat("files-only")}
							style={{
								border: "1px solid var(--border-color)",
								borderRadius: "8px",
								padding: "1rem",
								cursor: "pointer",
								backgroundColor:
									exportFormat === "files-only"
										? "rgba(var(--accent-color-rgb), 0.1)"
										: "transparent",
								borderColor:
									exportFormat === "files-only"
										? "var(--accent-color)"
										: "var(--border-color)",
							}}
						>
							<label
								style={{
									display: "flex",
									alignItems: "flex-start",
									gap: "0.75rem",
									cursor: "pointer",
								}}
							>
								<input
									type="radio"
									name="exportFormat"
									value="files-only"
									checked={exportFormat === "files-only"}
									onChange={() => setExportFormat("files-only")}
									style={{ marginTop: "0.125rem" }}
								/>
								<div className="option-content">
									<div
										className="option-header"
										style={{
											display: "flex",
											alignItems: "center",
											gap: "0.5rem",
											marginBottom: "0.5rem",
										}}
									>
										<FileIcon />
										<strong>Files Only</strong>
									</div>
									<p style={{ margin: "0", color: "var(--text-secondary)" }}>
										Export only the files from your projects in a simple folder
										structure. Compatible with any application.
									</p>
								</div>
							</label>
						</div>
					</div>
				</div>

				<div className="export-options">
					<h3>Include Content</h3>

					<div className="option-group" style={{ margin: "1rem 0" }}>
						{exportFormat === "texlyre" && (
							<label
								style={{
									display: "flex",
									alignItems: "center",
									gap: "0.5rem",
									marginBottom: "0.5rem",
								}}
							>
								<input
									type="checkbox"
									checked={includeDocuments}
									onChange={(e) => setIncludeDocuments(e.target.checked)}
									disabled={isExporting}
								/>
								<span>Include documents and collaboration data</span>
							</label>
						)}

						<label
							style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
						>
							<input
								type="checkbox"
								checked={includeFiles}
								onChange={(e) => setIncludeFiles(e.target.checked)}
								disabled={isExporting}
							/>
							<span>Include project files</span>
						</label>
					</div>

					{exportFormat === "files-only" && (
						<div
							className="format-note"
							style={{
								padding: "0.75rem",
								backgroundColor: "rgba(var(--accent-color-rgb), 0.1)",
								borderRadius: "4px",
								fontSize: "0.875rem",
								color: "var(--text-secondary)",
							}}
						> Files will be organized by project name in separate folders. Documents are not included in files-only export.
						</div>
					)}
				</div>

				<div className="modal-actions">
					<button
						type="button"
						className="button secondary"
						onClick={handleClose}
						disabled={isExporting}
					>
						Cancel
					</button>
					<button
						type="button"
						className="button primary"
						onClick={handleExport}
						disabled={isExporting || (!includeDocuments && !includeFiles)}
					>
						{isExporting
							? "Exporting..."
							: `Export ${selectedProjects.length} Project${selectedProjects.length === 1 ? "" : "s"}`}
					</button>
				</div>
			</div>
		</Modal>
	);
};

export default ProjectExportModal;
