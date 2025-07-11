// src/components/backup/BackupModal.tsx
import type React from "react";
import { useEffect, useState } from "react";

import { useAuth } from "../../hooks/useAuth";
import { notificationService } from "../../services/NotificationService";
import { formatDate } from "../../utils/dateUtils";
import {
	DisconnectIcon,
	ExportIcon,
	FileSystemIcon,
	FolderIcon,
	ImportIcon,
	SettingsIcon,
	TrashIcon,
} from "../common/Icons";
import Modal from "../common/Modal";
import SettingsModal from "../settings/SettingsModal";

interface BackupStatus {
	isConnected: boolean;
	isEnabled: boolean;
	lastSync: number | null;
	status: "idle" | "syncing" | "error";
	error?: string;
}

interface BackupActivity {
	id: string;
	type:
		| "backup_start"
		| "backup_complete"
		| "backup_error"
		| "import_start"
		| "import_complete"
		| "import_error";
	message: string;
	timestamp: number;
	data?: any;
}

interface BackupModalProps {
	isOpen: boolean;
	onClose: () => void;
	status: BackupStatus;
	activities: BackupActivity[];
	onRequestAccess: (isAutoStart?: boolean) => Promise<boolean>;
	onSynchronize: (projectId?: string) => Promise<void>;
	onExportToFileSystem: (projectId?: string) => Promise<void>;
	onImportChanges: (projectId?: string) => Promise<void>;
	onDisconnect: () => Promise<void>;
	onClearActivity: (id: string) => void;
	onClearAllActivities: () => void;
	onChangeDirectory: () => Promise<boolean>;
	currentProjectId?: string | null;
	isInEditor?: boolean;
}

const BackupModal: React.FC<BackupModalProps> = ({
	isOpen,
	onClose,
	status,
	activities = [],
	onRequestAccess,
	onSynchronize,
	onExportToFileSystem,
	onImportChanges,
	onDisconnect,
	onClearActivity,
	onClearAllActivities,
	onChangeDirectory,
	currentProjectId,
	isInEditor = false,
}) => {
	const [showSettings, setShowSettings] = useState(false);
	const [syncScope, setSyncScope] = useState<"current" | "all">("current");
	const [isOperating, setIsOperating] = useState(false);
	const { getProjectById } = useAuth();
	const [currentProjectName, setCurrentProjectName] = useState<string>("");

	useEffect(() => {
		const loadProjectName = async () => {
			if (currentProjectId) {
				try {
					const project = await getProjectById(currentProjectId);
					setCurrentProjectName(project?.name || "Current project only");
				} catch (_error) {
					setCurrentProjectName("Current project only");
				}
			}
		};

		if (isInEditor && currentProjectId) {
			loadProjectName();
		}
	}, [currentProjectId, getProjectById, isInEditor]);

	const getStatusText = () => {
		if (!status.isConnected) return "No backup folder";
		if (status.status === "error") return "Backup error";
		if (status.status === "syncing") return "Syncing...";
		if (status.lastSync) {
			return `Last sync: ${formatDate(status.lastSync)}`;
		}
		return "Ready to sync";
	};

	const getActivityIcon = (type: string) => {
		switch (type) {
			case "backup_error":
			case "import_error":
				return "❌";
			case "backup_complete":
			case "import_complete":
				return "✅";
			case "backup_start":
				return "📤";
			case "import_start":
				return "📥";
			default:
				return "ℹ️";
		}
	};

	const getActivityColor = (type: string) => {
		switch (type) {
			case "backup_error":
			case "import_error":
				return "#dc3545";
			case "backup_complete":
			case "import_complete":
				return "#28a745";
			case "backup_start":
				return "#007bff";
			case "import_start":
				return "#6f42c1";
			default:
				return "#6c757d";
		}
	};

	const handleExport = async () => {
		if (isOperating) return;

		setIsOperating(true);
		const projectId =
			isInEditor && syncScope === "current" ? currentProjectId : undefined;
		const operationId = `backup-export-${Date.now()}`;

		try {
			notificationService.showLoading(
				projectId
					? `Exporting ${currentProjectName}...`
					: "Exporting all projects...",
				operationId,
			);

			await onExportToFileSystem(projectId || undefined);

			notificationService.showSuccess(
				projectId
					? `${currentProjectName} exported successfully`
					: "All projects exported successfully",
				{ operationId },
			);
		} catch (error) {
			notificationService.showError(
				`Backup export failed: ${error instanceof Error ? error.message : "Unknown error"}`,
				{ operationId },
			);
		} finally {
			setIsOperating(false);
		}
	};

	const handleImport = async () => {
		if (isOperating) return;

		setIsOperating(true);
		const projectId =
			isInEditor && syncScope === "current" ? currentProjectId : undefined;
		const operationId = `backup-import-${Date.now()}`;

		try {
			notificationService.showLoading(
				projectId
					? `Importing changes for ${currentProjectName}...`
					: "Importing all changes...",
				operationId,
			);

			await onImportChanges(projectId || undefined);

			notificationService.showSuccess(
				projectId
					? `Changes imported for ${currentProjectName}`
					: "All changes imported successfully",
				{ operationId },
			);
		} catch (error) {
			notificationService.showError(
				`Backup import failed: ${error instanceof Error ? error.message : "Unknown error"}`,
				{ operationId },
			);
		} finally {
			setIsOperating(false);
		}
	};

	const handleRequestAccess = async () => {
		if (isOperating) return;

		setIsOperating(true);
		const operationId = `backup-connect-${Date.now()}`;

		try {
			notificationService.showLoading(
				"Connecting to backup folder...",
				operationId,
			);
			await onRequestAccess();
			notificationService.showSuccess("Backup folder connected successfully", {
				operationId,
			});
			// onClose();
		} catch (error) {
			notificationService.showError(
				`Failed to connect backup folder: ${error instanceof Error ? error.message : "Unknown error"}`,
				{ operationId },
			);
		} finally {
			setIsOperating(false);
		}
	};

	const handleChangeDirectory = async () => {
		if (isOperating) return;

		setIsOperating(true);
		const operationId = `backup-change-dir-${Date.now()}`;

		try {
			notificationService.showLoading(
				"Changing backup directory...",
				operationId,
			);
			await onChangeDirectory();
			notificationService.showSuccess("Backup directory changed successfully", {
				operationId,
			});
			// onClose();
		} catch (error) {
			notificationService.showError(
				`Failed to change backup directory: ${error instanceof Error ? error.message : "Unknown error"}`,
				{ operationId },
			);
		} finally {
			setIsOperating(false);
		}
	};

	const handleDisconnect = async () => {
		if (isOperating) return;

		setIsOperating(true);
		const operationId = `backup-disconnect-${Date.now()}`;

		try {
			notificationService.showLoading("Disconnecting backup...", operationId);
			await onDisconnect();
			notificationService.showSuccess("Backup disconnected successfully", {
				operationId,
			});
			// onClose();
		} catch (error) {
			notificationService.showError(
				`Failed to disconnect backup: ${error instanceof Error ? error.message : "Unknown error"}`,
				{ operationId },
			);
		} finally {
			setIsOperating(false);
		}
	};

	return (
		<>
			<Modal
				isOpen={isOpen}
				onClose={onClose}
				title="File System Backup"
				icon={FileSystemIcon}
				size="medium"
				headerActions={
					<button
						className="modal-close-button"
						onClick={() => setShowSettings(true)}
						title="File System Settings"
					>
						<SettingsIcon />
					</button>
				}
			>
				<div className="backup-modal">
					<div className="backup-status">
						<div className="status-header">
							<div className="backup-controls">
								{!status.isConnected ? (
									<>
										<button
											className="button primary"
											onClick={handleRequestAccess}
											disabled={isOperating}
										>
											<FolderIcon />
											{isOperating ? "Connecting..." : "Connect Folder"}
										</button>
									</>
								) : (
									<>
										{isInEditor && (
											<div
												className="sync-scope-selector"
												style={{ marginBottom: "1rem" }}
											>
												<label
													style={{
														display: "block",
														marginBottom: "0.5rem",
														fontWeight: "bold",
													}}
												>
													Backup Scope:
												</label>
												<div style={{ display: "flex", gap: "1rem" }}>
													<label
														style={{
															display: "flex",
															alignItems: "center",
															gap: "0.5rem",
														}}
													>
														<input
															type="radio"
															name="syncScope"
															value="current"
															checked={syncScope === "current"}
															onChange={(e) =>
																setSyncScope(
																	e.target.value as "current" | "all",
																)
															}
															disabled={isOperating}
														/>
														<span>Current project ({currentProjectName})</span>
													</label>
													<label
														style={{
															display: "flex",
															alignItems: "center",
															gap: "0.5rem",
														}}
													>
														<input
															type="radio"
															name="syncScope"
															value="all"
															checked={syncScope === "all"}
															onChange={(e) =>
																setSyncScope(
																	e.target.value as "current" | "all",
																)
															}
															disabled={isOperating}
														/>
														<span>All projects</span>
													</label>
												</div>
											</div>
										)}
										<div className="backup-toolbar">
											<div className="primary-actions">
												<button
													className="button secondary"
													onClick={handleExport}
													disabled={status.status === "syncing" || isOperating}
												>
													<ExportIcon />
													Export To PC
												</button>
												<button
													className="button secondary"
													onClick={handleImport}
													disabled={status.status === "syncing" || isOperating}
												>
													<ImportIcon />
													Import From PC
												</button>
											</div>
											<div className="secondary-actions">
												<button
													className="button secondary icon-only"
													onClick={handleChangeDirectory}
													disabled={isOperating}
													title="Change backup folder"
												>
													<FolderIcon />
												</button>
												<button
													className="button secondary icon-only"
													onClick={handleDisconnect}
													disabled={isOperating}
													title="Disconnect"
												>
													<DisconnectIcon />
												</button>
											</div>
										</div>
									</>
								)}
							</div>
						</div>

						<div className="status-info">
							<div className="status-item">
								<strong>File System Backup:</strong>{" "}
								{status.isConnected ? "Connected" : "Disconnected"}
							</div>
							{status.isConnected && (
								<div className="status-item">
									<strong>Status:</strong> {getStatusText()}
								</div>
							)}
							{status.error && (
								<div className="error-message">{status.error}</div>
							)}
						</div>
					</div>

					{activities.length > 0 && (
						<div className="backup-activities">
							<div className="activities-header">
								<h3>Recent Activity</h3>
								<button
									className="button small secondary"
									onClick={onClearAllActivities}
									title="Clear all activities"
									disabled={isOperating}
								>
									<TrashIcon />
									Clear All
								</button>
							</div>

							<div className="activities-list">
								{activities
									.slice(-10)
									.reverse()
									.map((activity) => (
										<div
											key={activity.id}
											className="activity-item"
											style={{
												borderLeft: `3px solid ${getActivityColor(activity.type)}`,
											}}
										>
											<div className="activity-content">
												<div className="activity-header">
													<span className="activity-icon">
														{getActivityIcon(activity.type)}
													</span>
													<span className="activity-message">
														{activity.message}
													</span>
													<button
														className="activity-close"
														onClick={() => onClearActivity(activity.id)}
														title="Dismiss"
														disabled={isOperating}
													>
														×
													</button>
												</div>
												<div className="activity-time">
													{formatDate(activity.timestamp)}
												</div>
											</div>
										</div>
									))}
							</div>
						</div>
					)}

					<div className="backup-info">
						<h3>How File System Backup Works</h3>
						<div className="info-content">
							<p>
								File system backup creates a copy of your local TeXlyre data on
								your PC that you can sync with cloud storage:
							</p>
							<ul>
								<li>
									<strong>Export:</strong> Forces all local data to be written
									to the file system
								</li>
								<li>
									<strong>Import:</strong> Loads changes from the file system
									into your local workspace
								</li>
								<li>
									Sync the backup folder with cloud services like Dropbox,
									Google Drive, or OneDrive for cross-device access
								</li>
								<li>
									All project data is organized in a structured folder hierarchy
									with documents and files
								</li>
							</ul>
						</div>
					</div>
				</div>
			</Modal>

			<SettingsModal
				isOpen={showSettings}
				onClose={() => setShowSettings(false)}
				initialCategory="Backup"
				initialSubcategory="File System"
			/>
		</>
	);
};

export default BackupModal;
