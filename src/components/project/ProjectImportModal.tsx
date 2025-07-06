// src/components/project/ProjectImportModal.tsx
import type React from "react";
import { useRef, useState } from "react";
import {
	type ImportOptions,
	type ImportableProject,
	projectImportService,
} from "../../services/ProjectImportService";
import { formatDate } from "../../utils/dateUtils";
import { FolderIcon, ImportIcon } from "../common/Icons";
import Modal from "../common/Modal";

interface ProjectImportModalProps {
	isOpen: boolean;
	onClose: () => void;
	onProjectsImported: () => void;
}

const ProjectImportModal: React.FC<ProjectImportModalProps> = ({
	isOpen,
	onClose,
	onProjectsImported,
}) => {
	const [importSource, setImportSource] = useState<"backup" | "zip" | null>(
		null,
	);
	const [availableProjects, setAvailableProjects] = useState<
		ImportableProject[]
	>([]);
	const [selectedProjects, setSelectedProjects] = useState<Set<string>>(
		new Set(),
	);
	const [isScanning, setIsScanning] = useState(false);
	const [isImporting, setIsImporting] = useState(false);
	const [conflictResolution, setConflictResolution] = useState<
		"skip" | "overwrite" | "create-new"
	>("create-new");
	const [makeCollaborator, setMakeCollaborator] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [selectedZipFile, setSelectedZipFile] = useState<File | null>(null);

	const handleBackupDirectorySelect = async () => {
		try {
			setIsScanning(true);
			setError(null);
			// TODO (fabawi): Need to simply trigger the autodiscovery function rather than open a directory
			//
			// if (!("showDirectoryPicker" in window)) {
			// 	throw new Error("File System Access API not supported");
			// }
			//
			// const dirHandle = await window.showDirectoryPicker({
			// 	mode: "readonly",
			// 	id: "texlyre-import",
			// });
			//
			// const projects = await projectImportService.scanBackupDirectory(dirHandle);
			// setAvailableProjects(projects);
			// setImportSource("backup");
			// setSelectedProjects(new Set());
		} catch (error) {
			if (error instanceof Error && error.name !== "AbortError") {
				setError(error.message);
			}
		} finally {
			setIsScanning(false);
		}
	};

	const handleZipFileSelect = async (
		event: React.ChangeEvent<HTMLInputElement>,
	) => {
		const file = event.target.files?.[0];
		if (!file) return;

		try {
			setIsScanning(true);
			setError(null);

			// Store the selected file
			setSelectedZipFile(file);

			const projects = await projectImportService.scanZipFile(file);
			setAvailableProjects(projects);
			setImportSource("zip");
			setSelectedProjects(new Set());
		} catch (error) {
			setError(
				error instanceof Error ? error.message : "Error scanning zip file",
			);
		} finally {
			setIsScanning(false);
		}
	};

	const handleProjectToggle = (projectId: string) => {
		const newSelected = new Set(selectedProjects);
		if (newSelected.has(projectId)) {
			newSelected.delete(projectId);
		} else {
			newSelected.add(projectId);
		}
		setSelectedProjects(newSelected);
	};

	const handleSelectAll = () => {
		if (selectedProjects.size === availableProjects.length) {
			setSelectedProjects(new Set());
		} else {
			setSelectedProjects(new Set(availableProjects.map((p) => p.id)));
		}
	};

	const handleImport = async () => {
		if (selectedProjects.size === 0) return;

		try {
			setIsImporting(true);
			setError(null);

			const options: ImportOptions = {
				makeCollaborator,
				conflictResolution,
			};

			let result;
			if (importSource === "backup") {
				if (!("showDirectoryPicker" in window)) {
					throw new Error("File System Access API not supported");
				}
				const dirHandle = await (window as any).showDirectoryPicker({
					mode: "readonly",
					id: "texlyre-import",
				});
				result = await projectImportService.importFromBackup(
					dirHandle,
					Array.from(selectedProjects),
					options,
				);
			} else if (importSource === "zip") {
				if (!selectedZipFile) {
					throw new Error("No ZIP file available for import");
				}
				result = await projectImportService.importFromZip(
					selectedZipFile,
					Array.from(selectedProjects),
					options,
				);
			} else {
				throw new Error("Invalid import source");
			}

			if (result.errors.length > 0) {
				setError(
					`Import completed with errors: ${result.errors.map((e) => e.error).join(", ")}`,
				);
			}

			if (result.imported.length > 0) {
				document.dispatchEvent(new CustomEvent("projects-imported"));
				onProjectsImported();
				onClose();
			}
		} catch (error) {
			setError(error instanceof Error ? error.message : "Import failed");
		} finally {
			setIsImporting(false);
		}
	};

	const handleClose = () => {
		setImportSource(null);
		setAvailableProjects([]);
		setSelectedProjects(new Set());
		setSelectedZipFile(null);
		setError(null);
		setIsScanning(false);
		setIsImporting(false);
		if (fileInputRef.current) {
			fileInputRef.current.value = "";
		}
		onClose();
	};

	const getOwnershipText = (project: ImportableProject) => {
		if (project.originalOwnerId === "current-user-id") {
			return "Owned by you";
		}
		return makeCollaborator
			? "Will be imported as collaborator"
			: "Will be imported as owner";
	};

	return (
		<Modal
			isOpen={isOpen}
			onClose={handleClose}
			title="Import Projects"
			size="large"
		>
			<div className="project-import-modal">
				{error && (
					<div className="error-message" style={{ marginBottom: "1rem" }}>
						{error}
					</div>
				)}

				{!importSource && (
					<div className="import-source-selection">
						<h3>Choose Import Source</h3>

						<div className="import-options">
							<button
								className="import-option-button"
								onClick={handleBackupDirectorySelect}
								disabled={isScanning}
							>
								<FolderIcon />
								<div>
									<strong>From Backup Directory</strong>
									<p>Import projects from a TeXlyre backup folder</p>
								</div>
							</button>

							<label className="import-option-button">
								<ImportIcon />
								<div>
									<strong>From ZIP File</strong>
									<p>Import projects from a TeXlyre export file</p>
								</div>
								<input
									ref={fileInputRef}
									type="file"
									accept=".zip"
									onChange={handleZipFileSelect}
									style={{ display: "none" }}
									disabled={isScanning}
								/>
							</label>
						</div>

						{isScanning && (
							<div className="scanning-indicator">
								<div className="loading-spinner" />
								<p>Scanning for projects...</p>
							</div>
						)}
					</div>
				)}

				{importSource && availableProjects.length > 0 && (
					<div className="project-selection">
						<div className="selection-header">
							<h3>Available Projects ({availableProjects.length})</h3>
							<button
								className="button secondary"
								onClick={handleSelectAll}
								disabled={isImporting}
							>
								{selectedProjects.size === availableProjects.length
									? "Deselect All"
									: "Select All"}
							</button>
						</div>

						<div className="import-options-panel">
							<div className="option-group">
								<label>Conflict resolution strategy:</label>
								<select
									value={conflictResolution}
									onChange={(e) =>
										setConflictResolution(
											e.target.value as "skip" | "overwrite" | "create-new",
										)
									}
									disabled={isImporting}
								>
									<option value="skip">Skip existing projects</option>
									<option value="overwrite">
										Merge and overwrite existing projects
									</option>
									<option value="create-new">
										Create new projects (create new URLs on conflict)
									</option>
								</select>
							</div>

							<div className="option-group">
								<label>
									<input
										type="checkbox"
										checked={makeCollaborator}
										onChange={(e) => setMakeCollaborator(e.target.checked)}
										disabled={isImporting}
									/>
									Import as collaborator (preserve original ownership)
								</label>
							</div>
						</div>

						<div className="projects-compact-list">
							{availableProjects.map((project) => (
								<div
									key={project.id}
									className={`project-item ${selectedProjects.has(project.id) ? "selected" : ""}`}
									onClick={() =>
										!isImporting && handleProjectToggle(project.id)
									}
								>
									<input
										type="checkbox"
										checked={selectedProjects.has(project.id)}
										onChange={() => handleProjectToggle(project.id)}
										disabled={isImporting}
									/>
									<div className="project-details">
										<div className="project-name">{project.name}</div>
										<div className="project-description">
											{project.description || "No description"}
										</div>
										<div className="project-meta">
											<span>
												Last modified: {formatDate(project.lastModified)}
											</span>
											<span>{getOwnershipText(project)}</span>
										</div>
									</div>
								</div>
							))}
						</div>

						<div className="modal-actions">
							<button
								type="button"
								className="button secondary"
								onClick={handleClose}
								disabled={isImporting}
							>
								Cancel
							</button>
							<button
								type="button"
								className="button primary"
								onClick={handleImport}
								disabled={selectedProjects.size === 0 || isImporting}
							>
								{isImporting
									? "Importing..."
									: `Import ${selectedProjects.size} Project${selectedProjects.size === 1 ? "" : "s"}`}
							</button>
						</div>
					</div>
				)}

				{importSource && availableProjects.length === 0 && !isScanning && (
					<div className="no-projects">
						<p>
							No importable projects found in the selected{" "}
							{importSource === "backup" ? "directory" : "ZIP file"}.
						</p>
						<button
							className="button secondary"
							onClick={() => setImportSource(null)}
						>
							Choose Different Source
						</button>
					</div>
				)}
			</div>
		</Modal>
	);
};

export default ProjectImportModal;
