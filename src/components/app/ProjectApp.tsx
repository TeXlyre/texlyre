// src/components/app/ProjectApp.tsx
import type React from "react";
import { useCallback, useEffect, useState } from "react";

import texlyreLogo from "../../assets/images/TeXlyre_notext.png";
import { useAuth } from "../../hooks/useAuth";
import { useFileSystemBackup } from "../../hooks/useFileSystemBackup";
import { useTheme } from "../../hooks/useTheme";
import type { Project } from "../../types/projects";
import { isValidYjsUrl, buildUrlWithFragments, parseUrlFragments } from "../../utils/urlUtils";
import BackupDiscoveryModal from "../backup/BackupDiscoveryModal";
import BackupModal from "../backup/BackupModal";
import BackupStatusIndicator from "../backup/BackupStatusIndicator";
import Modal from "../common/Modal";
import ResizablePanel from "../common/ResizablePanel";
import ExportAccountModal from "../profile/ExportAccountModal";
import ProfileSettingsModal from "../profile/ProfileSettingsModal";
import UserDropdown from "../profile/UserDropdown";
import ProjectExportModal from "../project/ProjectExportModal";
import ProjectDeleteModal from "../project/ProjectDeleteModal";
import ProjectForm from "../project/ProjectForm";
import ProjectImportModal from "../project/ProjectImportModal";
import ProjectList from "../project/ProjectList";
import ProjectToolbar from "../project/ProjectToolbar";
import SettingsButton from "../settings/SettingsButton";
import PrivacyModal from "../common/PrivacyModal";
import DeleteAccountModal from "../profile/DeleteAccountModal.tsx";
import GuestUpgradeBanner from "../auth/GuestUpgradeBanner";
import GuestUpgradeModal from "../auth/GuestUpgradeModal";

interface ProjectManagerProps {
	onOpenProject: (
		docUrl: string,
		projectName?: string,
		projectDescription?: string,
		projectType?: "latex" | "typst",
		projectId?: string,
	) => void;
	onLogout: () => void;
}

const ProjectApp: React.FC<ProjectManagerProps> = ({
	onOpenProject,
	onLogout,
}) => {
	const {
		user,
		getProjects,
		getProjectsByTag,
		searchProjects,
		createProject,
		updateProject,
		deleteProject,
		toggleFavorite,
		isGuestUser,
	} = useAuth();
	const { currentThemePlugin, currentLayout } = useTheme();
	const {
		discoveredProjects,
		showDiscoveryModal,
		dismissDiscovery,
		getRootHandle,
		shouldShowAutoBackupModal,
		status,
		activities,
		requestAccess,
		synchronize,
		importChanges,
		disconnect,
		clearActivity,
		clearAllActivities,
		changeDirectory,
	} = useFileSystemBackup();

	const [projects, setProjects] = useState<Project[]>([]);
	const [filteredProjects, setFilteredProjects] = useState<Project[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
	const [availableTags, setAvailableTags] = useState<string[]>([]);
	const [sidebarWidth, setSidebarWidth] = useState(
		currentLayout?.defaultFileExplorerWidth || 250,
	);

	const [showProfileModal, setShowProfileModal] = useState(false);
	const [showAccountExportModal, setShowAccountExportModal] = useState(false);
	const [showCreateModal, setShowCreateModal] = useState(false);
	const [showEditModal, setShowEditModal] = useState(false);
	const [showDeleteModal, setShowDeleteModal] = useState(false);
	const [showAutoBackupModal, setShowAutoBackupModal] = useState(false);
	const [showGuestUpgradeModal, setShowGuestUpgradeModal] = useState(false);
	const [currentProject, setCurrentProject] = useState<Project | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [showImportModal, setShowImportModal] = useState(false);
	const [showExportModal, setShowExportModal] = useState(false);
	const [showMultiDeleteModal, setShowMultiDeleteModal] = useState(false);
	const [isDeleteAccountModalOpen, setIsDeleteAccountModalOpen] = useState(false);
	const [selectedProjectsForExport, setSelectedProjectsForExport] = useState<Project[]>([]);
	const [selectedProjectsForDelete, setSelectedProjectsForDelete] = useState<Project[]>([]);
	const [showPrivacy, setShowPrivacy] = useState(false);

	useEffect(() => {
		setShowAutoBackupModal(shouldShowAutoBackupModal);
	}, [shouldShowAutoBackupModal]);

	const loadProjects = useCallback(async () => {
		try {
			setIsLoading(true);
			const userProjects = await getProjects();
			setProjects(userProjects);
			setFilteredProjects(userProjects);

			const tags = new Set<string>();
			userProjects.forEach((project) => {
				project.tags.forEach((tag) => tags.add(tag));
			});

			setAvailableTags(Array.from(tags));
		} catch (error) {
			console.error("Failed to load projects:", error);
		} finally {
			setIsLoading(false);
		}
	}, [getProjects]);

	useEffect(() => {
		loadProjects();
	}, [loadProjects]);

	const handleAccountDeleted = async () => {
		setIsDeleteAccountModalOpen(false);
		await onLogout();
	};

	const handleGuestUpgradeSuccess = () => {
		setShowGuestUpgradeModal(false);
	};

	const handleMultiDeleteProjects = async (projectIds: string[]) => {
		try {
			setIsSubmitting(true);
			for (const projectId of projectIds) {
				await deleteProject(projectId);
			}
			await loadProjects();
		} catch (error) {
			console.error("Failed to delete projects:", error);
			setError(
				error instanceof Error ? error.message : "Failed to delete projects",
			);
		} finally {
			setIsSubmitting(false);
		}
	};

	const handleSearch = async (query: string) => {
		if (!query.trim()) {
			setFilteredProjects(projects);
			return;
		}

		const results = await searchProjects(query);
		setFilteredProjects(results);
	};

	const handleFilterByTag = async (tag: string) => {
		if (!tag) {
			setFilteredProjects(projects);
			return;
		}

		const results = await getProjectsByTag(tag);
		setFilteredProjects(results);
	};

	const handleCreateProject = async (projectData: {
		name: string;
		description: string;
		type: "latex" | "typst";
		tags: string[];
		docUrl?: string;
		isFavorite: boolean;
	}) => {
		try {
			setIsSubmitting(true);
			setError(null);

			const newProject = await createProject(projectData);
			setShowCreateModal(false);
			await loadProjects();

			if (newProject.docUrl) {
				sessionStorage.setItem(
					"projectMetadata",
					JSON.stringify({
						name: projectData.name,
						description: projectData.description,
						type: projectData.type,
					}),
				);
				onOpenProject(
					newProject.docUrl,
					newProject.name,
					newProject.description,
					newProject.type,
					newProject.id,
				);
			}
		} catch (error) {
			console.error("Failed to create project:", error);
			setError(
				error instanceof Error ? error.message : "Failed to create project",
			);
		} finally {
			setIsSubmitting(false);
		}
	};

	const handleUpdateProject = async (projectData: {
		name: string;
		description: string;
		tags: string[];
		docUrl?: string;
		isFavorite: boolean;
	}) => {
		if (!currentProject) return;

		try {
			setIsSubmitting(true);
			setError(null);

			await updateProject({
				...currentProject,
				tags: projectData.tags,
				isFavorite: projectData.isFavorite,
			});
			setShowEditModal(false);
			await loadProjects();
		} catch (error) {
			console.error("Failed to update project:", error);
			setError(
				error instanceof Error ? error.message : "Failed to update project",
			);
		} finally {
			setIsSubmitting(false);
		}
	};

	const handleDeleteProject = async () => {
		if (!currentProject) return;

		try {
			setIsSubmitting(true);
			await deleteProject(currentProject.id);
			setShowDeleteModal(false);
			await loadProjects();
		} catch (error) {
			console.error("Failed to delete project:", error);
			setError(
				error instanceof Error ? error.message : "Failed to delete project",
			);
		} finally {
			setIsSubmitting(false);
		}
	};

	const handleToggleFavorite = async (projectId: string) => {
		try {
			await toggleFavorite(projectId);
			await loadProjects();
		} catch (error) {
			console.error("Failed to toggle favorite status:", error);
		}
	};

	const handleToggleViewMode = () => {
		setViewMode((prev) => (prev === "grid" ? "list" : "grid"));
	};

	const handleExportSelected = async (selectedIds: string[]) => {
		try {
			const selectedProjects = projects.filter((p) =>
				selectedIds.includes(p.id),
			);
			setSelectedProjectsForExport(selectedProjects);
			setShowExportModal(true);
		} catch (error) {
			console.error("Error preparing export:", error);
			setError("Failed to prepare projects for export");
		}
	};

	const handleDeleteSelected = async (selectedIds: string[]) => {
		try {
			const selectedProjects = projects.filter((p) =>
				selectedIds.includes(p.id),
			);
			setSelectedProjectsForDelete(selectedProjects);
			setShowMultiDeleteModal(true);
		} catch (error) {
			console.error("Error preparing delete:", error);
			setError("Failed to prepare projects for deletion");
		}
	};

	const openCreateModal = () => {
		setError(null);
		setShowCreateModal(true);
	};

	const openImportModal = () => {
		setError(null);
		setShowImportModal(true);
	};

	const handleProjectsImported = async () => {
		await loadProjects();
	};

	const handleDiscoveryImport = async () => {
		dismissDiscovery();
		await loadProjects();
	};

	const openEditModal = (project: Project) => {
		setError(null);
		setCurrentProject(project);
		setShowEditModal(true);
	};

	const openDeleteModal = (project: Project) => {
		setError(null);
		setCurrentProject(project);
		setShowDeleteModal(true);
	};

	const handleOpenDefault = (project: Project) => {
		if (!project.docUrl) {
			console.error("Project has no document URL:", project);
			setError("This project has no associated document. Please try creating a new project.");
			return;
		}

		if (!isValidYjsUrl(project.docUrl)) {
			console.error("Invalid document URL format:", project.docUrl);
			setError(`Invalid document URL format: ${project.docUrl}`);
			return;
		}

		// Build URL with last opened file/doc if available
		let finalUrl = project.docUrl;
		if (project.lastOpenedDocId || project.lastOpenedFilePath) {
			const currentFragment = parseUrlFragments(finalUrl);
			const newUrl = buildUrlWithFragments(
				currentFragment.yjsUrl,
				project.lastOpenedDocId,
				project.lastOpenedFilePath,
			);
			finalUrl = newUrl;
		}

		onOpenProject(finalUrl, project.name, project.description, project.type, project.id);
	};

	const openProject = async (project: Project) => {
		if (!project.docUrl) {
			console.error("Project has no document URL:", project);
			setError(
				"This project has no associated document. Please try creating a new project.",
			);
			return;
		}

		if (!isValidYjsUrl(project.docUrl)) {
			console.error("Invalid document URL format:", project.docUrl);
			setError(`Invalid document URL format: ${project.docUrl}`);
			return;
		}

		onOpenProject(
			project.docUrl,
			project.name,
			project.description,
			project.type,
			project.id,
		);
	};

	const handleSidebarResize = (width: number) => {
		setSidebarWidth(width);
	};

	return (
		<div className={`app-container ${currentThemePlugin?.id || "default"}`}>
			{isGuestUser(user) && (
				<GuestUpgradeBanner
					onOpenUpgradeModal={() => setShowGuestUpgradeModal(true)}
				/>
			)}
			<header>
				<div className="header-left">
					<h1>All Projects</h1>
				</div>

				<div className="header-center">
					<a
						href="https://texlyre.github.io"
						target="_blank"
						rel="noreferrer"
					>
						<img src={texlyreLogo} className="logo" alt="TeXlyre logo" />
					</a>
				</div>

				<div className="header-right">
					{!isGuestUser(user) && (
						<BackupStatusIndicator className="header-backup-indicator" />
					)}
					<SettingsButton className="header-settings-button" />
					<UserDropdown
						username={user?.username || ""}
						onLogout={onLogout}
						onOpenProfile={() => setShowProfileModal(true)}
						onOpenExport={() => setShowAccountExportModal(true)}
						onOpenDeleteAccount={() => setIsDeleteAccountModalOpen(true)}
						onOpenUpgrade={() => setShowGuestUpgradeModal(true)}
						isGuest={isGuestUser(user)}
					/>
				</div>
			</header>

			<div className="main-content">
				<ResizablePanel
					direction="horizontal"
					width={sidebarWidth}
					minWidth={currentLayout?.minFileExplorerWidth || 200}
					maxWidth={currentLayout?.maxFileExplorerWidth || 500}
					onResize={handleSidebarResize}
					className="sidebar-container"
				>
					<ProjectToolbar
						onCreateProject={openCreateModal}
						onImportProject={openImportModal}
						onSearch={handleSearch}
						onFilterByTag={handleFilterByTag}
						onOpenProject={openProject}
						projects={projects}
						availableTags={availableTags}
					/>
				</ResizablePanel>

				<div className="editor-container">
					{error && (
						<div
							className="error-message"
							style={{
								padding: "1rem",
								color: "red",
								backgroundColor: "rgba(255,0,0,0.1)",
								margin: "1rem",
								borderRadius: "4px",
							}}
						>
							{error}
						</div>
					)}

					{isLoading ? (
						<div className="loading-container">
							<div className="loading-spinner" />
							<p>Loading projects...</p>
						</div>
					) : (
						<ProjectList
							projects={filteredProjects}
							onOpenProject={openProject}
							onOpenProjectDefault={handleOpenDefault}
							onEditProject={openEditModal}
							onDeleteProject={openDeleteModal}
							onToggleFavorite={handleToggleFavorite}
							onToggleViewMode={handleToggleViewMode}
							onExportSelected={handleExportSelected}
							onDeleteSelected={handleDeleteSelected}
							viewMode={viewMode}
						/>
					)}
				</div>
				<ProjectExportModal
					isOpen={showExportModal}
					onClose={() => setShowExportModal(false)}
					selectedProjects={selectedProjectsForExport}
				/>
				<ProjectDeleteModal
					isOpen={showMultiDeleteModal}
					onClose={() => setShowMultiDeleteModal(false)}
					selectedProjects={selectedProjectsForDelete}
					onDeleteProjects={handleMultiDeleteProjects}
				/>
			</div>

			<footer>
				<p className="read-the-docs">
					Built with TeXlyre
					<a href="https://texlyre.github.io" target="_blank" rel="noreferrer">
						<img src={texlyreLogo} className="logo" alt="TeXlyre logo" />
					</a>
					<span className="legal-links">
						<br /> <a href="https://texlyre.github.io/docs/intro" target="_blank" rel="noreferrer">
							Documentation
						</a>
						{" "} • <a href="https://github.com/TeXlyre/texlyre" target="_blank" rel="noreferrer">
							Source Code
						</a>
						{" "} • <a href="#" onClick={(event) => {
							event.preventDefault();
							setShowPrivacy(true);
						}} className="privacy-link"> Privacy </a>
					</span>
				</p>
			</footer>

			<PrivacyModal
				isOpen={showPrivacy}
				onClose={() => setShowPrivacy(false)}
			/>

			<Modal
				isOpen={showCreateModal}
				onClose={() => setShowCreateModal(false)}
				title="Create New Project"
			>
				{error && (
					<div className="form-error" style={{ marginBottom: "1rem" }}>
						{error}
					</div>
				)}
				<ProjectForm
					onSubmit={handleCreateProject}
					onCancel={() => setShowCreateModal(false)}
					isSubmitting={isSubmitting}
				/>
			</Modal>

			<Modal
				isOpen={showEditModal}
				onClose={() => setShowEditModal(false)}
				title="Edit Project"
			>
				{error && (
					<div className="form-error" style={{ marginBottom: "1rem" }}>
						{error}
					</div>
				)}
				{currentProject && (
					<ProjectForm
						project={currentProject}
						onSubmit={handleUpdateProject}
						onCancel={() => setShowEditModal(false)}
						isSubmitting={isSubmitting}
						disableNameAndDescription={true}
					/>
				)}
			</Modal>

			<Modal
				isOpen={showDeleteModal}
				onClose={() => setShowDeleteModal(false)}
				title="Delete Project"
				size="small"
			>
				<div className="delete-confirmation">
					<p>
						Are you sure you want to delete the project "{currentProject?.name}
						"?
					</p>
					<p className="warning">This action cannot be undone.</p>

					<div className="modal-actions">
						<button
							className="button secondary"
							onClick={() => setShowDeleteModal(false)}
							disabled={isSubmitting}
						>
							Cancel
						</button>
						<button
							className="button danger"
							onClick={handleDeleteProject}
							disabled={isSubmitting}
						>
							{isSubmitting ? "Deleting..." : "Delete Project"}
						</button>
					</div>
				</div>
			</Modal>

			{/* Guest users cannot access profile/account features */}
			{!isGuestUser(user) && (
				<>
					<ProfileSettingsModal
						isOpen={showProfileModal}
						onClose={() => setShowProfileModal(false)}
					/>
					<ExportAccountModal
						isOpen={showAccountExportModal}
						onClose={() => setShowAccountExportModal(false)}
						showProjectSelection={false}
					/>
					<DeleteAccountModal
						isOpen={isDeleteAccountModalOpen}
						onClose={() => setIsDeleteAccountModalOpen(false)}
						onAccountDeleted={handleAccountDeleted}
						onOpenExport={() => setShowAccountExportModal(true)}
					/>
				</>
			)}

			{isGuestUser(user) && (
				<GuestUpgradeModal
					isOpen={showGuestUpgradeModal}
					onClose={() => setShowGuestUpgradeModal(false)}
					onUpgradeSuccess={handleGuestUpgradeSuccess}
				/>
			)}

			<ProjectImportModal
				isOpen={showImportModal}
				onClose={() => setShowImportModal(false)}
				onProjectsImported={handleProjectsImported}
			/>

			{/* Guest users cannot access backup features */}
			{!isGuestUser(user) && (
				<>
					<BackupDiscoveryModal
						isOpen={showDiscoveryModal}
						onClose={dismissDiscovery}
						rootHandle={getRootHandle()}
						discoveredProjects={discoveredProjects}
						onProjectsImported={handleDiscoveryImport}
					/>
					<BackupModal
						isOpen={showAutoBackupModal}
						onClose={() => setShowAutoBackupModal(false)}
						status={status}
						activities={activities}
						onRequestAccess={requestAccess}
						onSynchronize={synchronize}
						onExportToFileSystem={synchronize}
						onImportChanges={importChanges}
						onDisconnect={disconnect}
						onClearActivity={clearActivity}
						onClearAllActivities={clearAllActivities}
						onChangeDirectory={changeDirectory}
						currentProjectId={sessionStorage.getItem("currentProjectId")}
						isInEditor={true}
					/>
				</>
			)}
		</div>
	);
};

export default ProjectApp;