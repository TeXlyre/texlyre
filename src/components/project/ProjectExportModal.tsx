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
	const [includeTemporaryFiles, setIncludeTemporaryFiles] = useState(false);
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
				includeTemporaryFiles,
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
				{error && <div className="export-error-message">{error}</div>}

				<div className="export-info">
					<p>
						Export {selectedProjects.length} project
						{selectedProjects.length === 1 ? "" : "s"} in your preferred format.
					</p>
				</div>

				<div className="selected-projects-list">
					{selectedProjects.map((project) => (
						<div key={project.id} className="export-project-item">
							<strong>{project.name}</strong>
							<div className="export-project-details">
								{project.description || "No description"} • Last modified:{" "}
								{formatDate(project.updatedAt)}
							</div>
						</div>
					))}
				</div>

				<div className="export-format-selection">
					<h3>Export Format</h3>

					<div className="format-options">
						<div
							className={`format-option ${exportFormat === "texlyre" ? "selected" : ""}`}
							onClick={() => setExportFormat("texlyre")}
						>
							<label className="format-option-label">
								<input
									type="radio"
									name="exportFormat"
									value="texlyre"
									checked={exportFormat === "texlyre"}
									onChange={() => setExportFormat("texlyre")}
								/>
								<div className="option-content">
									<div className="option-header">
										<FolderIcon />
										<strong>TeXlyre Format</strong>
									</div>
									<p>
										Complete project export including documents, collaboration
										data, and files. Can be imported back into TeXlyre.
									</p>
								</div>
							</label>
						</div>

						<div
							className={`format-option ${exportFormat === "files-only" ? "selected" : ""}`}
							onClick={() => setExportFormat("files-only")}
						>
							<label className="format-option-label">
								<input
									type="radio"
									name="exportFormat"
									value="files-only"
									checked={exportFormat === "files-only"}
									onChange={() => setExportFormat("files-only")}
								/>
								<div className="option-content">
									<div className="option-header">
										<FileIcon />
										<strong>Files Only</strong>
									</div>
									<p>
										Export only the files from your projects in a simple folder
										structure. Compatible with any application.
									</p>
								</div>
							</label>
						</div>
					</div>
				</div>

				<div className="export-option-group">
					{exportFormat === "texlyre" && (
						<>
							<label className="export-option-label">
								<input
									type="checkbox"
									checked={includeDocuments}
									onChange={(e) => setIncludeDocuments(e.target.checked)}
									disabled={isExporting}
								/>
								<span>Include documents and collaboration data</span>
							</label>
							<label className="export-option-label">
								<input
									type="checkbox"
									checked={includeFiles}
									onChange={(e) => setIncludeFiles(e.target.checked)}
									disabled={isExporting}
								/>
								<span>Include project files</span>
							</label>
						</>
					)}

					<label className="export-option-label">
						<input
							type="checkbox"
							checked={includeTemporaryFiles}
							onChange={(e) => setIncludeTemporaryFiles(e.target.checked)}
							disabled={isExporting}
						/>
						<span>Include cache and temporary files</span>
					</label>
				</div>

				{exportFormat === "files-only" && selectedProjects.length > 1 && (
					<div className="format-note">
						<ExportIcon /> Files will be organized by project name in separate
						folders. Documents are not included in files-only export.
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
		</Modal>
	);
};

export default ProjectExportModal;
