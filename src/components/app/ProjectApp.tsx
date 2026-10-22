// src/components/app/ProjectApp.tsx
import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { t } from '@/i18n';
import { createNamedLogger } from '@/logging';
import { typesetterRegistryService } from '../../services/TypesetterRegistryService';
import texlyreLogo from '../../assets/images/TeXlyre_notext.png';
import { useAuth } from '../../hooks/useAuth';
import { useWheelScroll } from '../../hooks/useWheelScroll';
import { useDiskBackup } from '../../hooks/useDiskBackup';
import { useTheme } from '../../hooks/useTheme';
import { useStorageConfig } from '../../hooks/useStorageConfig';
import { useSharedToolPreferences } from '../../hooks/useSharedToolPreferences';
import { useChelys } from '../../hooks/useChelys';
import { useSecrets } from '../../hooks/useSecrets';
import { useSettings } from '../../hooks/useSettings';
import type { Project, ProjectType, ProjectGroup } from '../../types/projects';
import type { StorageDashboardProject } from '../../types/storage';
import {
	isValidYjsUrl,
	buildUrlWithFragments,
	parseUrlFragments,
	pushHash,
} from '../../utils/urlUtils';
import BackupDiscoveryModal from '../backup/BackupDiscoveryModal';
import BackupStatusIndicator from '../backup/BackupStatusIndicator';
import Modal from '../common/Modal';
import ResizablePanel from '../common/ResizablePanel';
import ExportAccountModal from '../profile/ExportAccountModal';
import ProfileSettingsModal, {
	type ProfileSettingsTab,
} from '../profile/ProfileSettingsModal';
import UserDropdown from '../profile/UserDropdown';
import ProjectExportModal from '../project/ProjectExportModal';
import ProjectDeleteModal from '../project/ProjectDeleteModal';
import ProjectForm from '../project/ProjectForm';
import ProjectImportModal from '../project/ProjectImportModal';
import ProjectList from '../project/ProjectList';
import ProjectPanel from '../project/ProjectPanel';
import SettingsButton from '../settings/SettingsButton';
import PrivacyModal from '../common/PrivacyModal';
import DeleteAccountModal from '../profile/DeleteAccountModal';
import GuestUpgradeBanner from '../auth/GuestUpgradeBanner';
import GuestUpgradeModal from '../auth/GuestUpgradeModal';
import { NewProjectIcon } from '../common/Icons';
import FooterLinks from '../common/FooterLinks';
import ServiceStatusBanner from '../common/ServiceStatusBanner';
import QuotaBanner from '../common/QuotaBanner';
import { storageSyncService } from '../../services/StorageSyncService';

const moduleLog = createNamedLogger('ProjectApp');

interface ProjectManagerProps {
	onOpenProject: (
		docUrl: string,
		projectName?: string,
		projectDescription?: string,
		projectType?: ProjectType,
		projectGroup?: ProjectGroup,
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
		createProject,
		updateProject,
		deleteProject,
		getProjectById,
		toggleFavorite,
		isGuestUser,
	} = useAuth();
	const { currentThemePlugin, currentLayout } = useTheme();
	const { configs: storageConfigs } = useStorageConfig();
	const sharedToolPreferences = useSharedToolPreferences();
	const { storageUnlocked, storageUnlockReady, unlockStorage } = useChelys();
	const { promptForPassword } = useSecrets();
	const { getSetting } = useSettings();
	const {
		discoveredProjects,
		showDiscoveryModal,
		dismissDiscovery,
		getRootHandle,
	} = useDiskBackup();
	const backupRootHandle = getRootHandle();

	const [projects, setProjects] = useState<Project[]>([]);
	const [filteredProjects, setFilteredProjects] = useState<Project[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
	const [availableTags, setAvailableTags] = useState<string[]>([]);
	const [availableTypes, setAvailableTypes] = useState<string[]>([]);
	const [availableGroups, setAvailableGroups] = useState<string[]>([]);
	const [searchQuery, setSearchQuery] = useState('');
	const [selectedTag, setSelectedTag] = useState('');
	const [selectedType, setSelectedType] = useState('');
	const [selectedGroup, setSelectedGroup] = useState('');
	const [sidebarWidth, setSidebarWidth] = useState(
		currentLayout?.defaultFileExplorerWidth || 250,
	);

	const headerRightRef = useWheelScroll<HTMLDivElement>();
	const [showProfileModal, setShowProfileModal] = useState(false);
	const [profileTab, setProfileTab] = useState<ProfileSettingsTab>('account');
	const [showAccountExportModal, setShowAccountExportModal] = useState(false);
	const [showCreateModal, setShowCreateModal] = useState(false);
	const [showEditModal, setShowEditModal] = useState(false);
	const [showDeleteModal, setShowDeleteModal] = useState(false);
	const [showGuestUpgradeModal, setShowGuestUpgradeModal] = useState(false);
	const [currentProject, setCurrentProject] = useState<Project | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [showImportModal, setShowImportModal] = useState(false);
	const [showExportModal, setShowExportModal] = useState(false);
	const [showMultiDeleteModal, setShowMultiDeleteModal] = useState(false);
	const [isDeleteAccountModalOpen, setIsDeleteAccountModalOpen] =
		useState(false);
	const [selectedProjectsForExport, setSelectedProjectsForExport] = useState<
		Project[]
	>([]);
	const [selectedProjectsForDelete, setSelectedProjectsForDelete] = useState<
		Project[]
	>([]);
	const [showPrivacy, setShowPrivacy] = useState(false);
	const [storageProjects, setStorageProjects] = useState<
		StorageDashboardProject[]
	>([]);
	const [storageBusy, setStorageBusy] = useState<Set<string>>(new Set());
	const [restoringStorageProjects, setRestoringStorageProjects] = useState<
		Set<string>
	>(new Set());
	const [unavailableStorageProviders, setUnavailableStorageProviders] =
		useState<Set<string>>(new Set());
	const storageUnlockAttemptRef = useRef<string | null>(null);

	const activeStorageConfigs = useMemo(
		() => storageConfigs.filter((config) => config.enabled),
		[storageConfigs],
	);
	const accountStorageConfigs = useMemo(
		() =>
			activeStorageConfigs.filter(
				(config) => !sharedToolPreferences.getOrigin('storage', config.id),
			),
		[activeStorageConfigs, sharedToolPreferences.getOrigin],
	);
	const sharedStorageConfigIds = useMemo(
		() =>
			new Set(
				activeStorageConfigs
					.filter((config) =>
						sharedToolPreferences.getOrigin('storage', config.id),
					)
					.map((config) => config.id),
			),
		[activeStorageConfigs, sharedToolPreferences.getOrigin],
	);
	const syncStorageBeforeOpen =
		(getSetting('storage-sync-before-open')?.value as boolean | undefined) ??
		true;

	const loadProjects = useCallback(async () => {
		try {
			setIsLoading(true);
			const userProjects = await getProjects();
			setProjects(userProjects);
			setFilteredProjects(userProjects);

			const tags = new Set<string>();
			userProjects.forEach((project) => {
				project.tags?.forEach((tag) => {
					tags.add(tag);
				});
			});

			setAvailableTags(Array.from(tags));
			setAvailableTypes(
				Array.from(new Set(userProjects.map((project) => project.type))),
			);
			setAvailableGroups(
				Array.from(
					new Set(
						userProjects.map(
							(project) =>
								project.group ??
								typesetterRegistryService.get(project.compilerId ?? '')
									?.projectGroup ??
								project.type,
						),
					),
				),
			);
		} catch (error) {
			moduleLog.error('Failed to load projects:', error);
		} finally {
			setIsLoading(false);
		}
	}, [getProjects]);

	useEffect(() => {
		loadProjects();
	}, [loadProjects]);

	useEffect(() => {
		if (!user || isGuestUser(user) || activeStorageConfigs.length === 0) {
			storageUnlockAttemptRef.current = null;
			return;
		}
		if (!storageUnlockReady || storageUnlocked) return;

		const attemptId = `${user.id}:${activeStorageConfigs
			.map((config) => config.id)
			.sort()
			.join(',')}`;
		if (storageUnlockAttemptRef.current === attemptId) return;
		storageUnlockAttemptRef.current = attemptId;

		void (async () => {
			const password = await promptForPassword(
				t('Enter your TeXlyre password to unlock encrypted storage:'),
			);
			if (storageUnlockAttemptRef.current !== attemptId || !password) return;
			try {
				await unlockStorage(password);
			} catch (error) {
				moduleLog.warn('Failed to unlock storage for this session:', error);
				setError(
					error instanceof Error
						? error.message
						: t('Failed to unlock storage'),
				);
			}
		})();
	}, [
		user,
		isGuestUser,
		activeStorageConfigs,
		storageUnlockReady,
		storageUnlocked,
		promptForPassword,
		unlockStorage,
	]);

	const loadStorageState = useCallback(async () => {
		if (!user || isGuestUser(user) || activeStorageConfigs.length === 0) {
			setStorageProjects([]);
			setUnavailableStorageProviders(new Set());
			return;
		}

		if (!storageUnlockReady) return;

		if (!storageUnlocked) {
			setStorageProjects([]);
			setUnavailableStorageProviders(
				new Set(activeStorageConfigs.map((config) => config.id)),
			);
			return;
		}

		const unavailable = new Set<string>();
		const reconciled = await Promise.all(
			accountStorageConfigs.map(async (config) => {
				try {
					return await storageSyncService.reconcileProvider(user.id, config.id);
				} catch (error) {
					unavailable.add(config.id);
					moduleLog.warn(
						`Storage provider ${config.id} is unavailable:`,
						error,
					);
					return [];
				}
			}),
		);

		const sharedBindings = Object.entries(
			storageSyncService.getProjectBindings(user.id),
		).filter(([, binding]) => sharedStorageConfigIds.has(binding.providerId));
		const shared = await Promise.all(
			sharedBindings.map(async ([projectId, binding]) => {
				try {
					return await storageSyncService.reconcileProjectBinding(
						user.id,
						projectId,
					);
				} catch (error) {
					unavailable.add(binding.providerId);
					moduleLog.warn(
						`Shared storage provider ${binding.providerId} is unavailable:`,
						error,
					);
					return null;
				}
			}),
		);

		setUnavailableStorageProviders(unavailable);
		setStorageProjects([
			...reconciled.flat(),
			...shared.filter(
				(entry): entry is StorageDashboardProject => entry !== null,
			),
		]);
	}, [
		user,
		isGuestUser,
		activeStorageConfigs,
		accountStorageConfigs,
		sharedStorageConfigIds,
		storageUnlockReady,
		storageUnlocked,
	]);

	useEffect(() => {
		void loadStorageState();
	}, [loadStorageState]);

	const storageStates = useMemo(() => {
		const states: Record<string, StorageDashboardProject> = {};
		for (const stored of storageProjects) {
			if (!stored.remoteOnly) states[stored.localProjectId] = stored;
		}

		if (!user) return states;
		const defaultProvider = accountStorageConfigs[0];
		for (const project of projects) {
			if (states[project.id]) continue;
			const binding = storageSyncService.getProjectBinding(user.id, project.id);
			const providerId = binding?.providerId ?? defaultProvider?.id;
			if (!providerId) continue;
			states[project.id] = {
				providerId,
				storageProjectId: binding?.storageProjectId ?? '',
				localProjectId: project.id,
				name: project.name,
				description: project.description,
				type: project.type,
				group: project.group,
				compilerId: project.compilerId,
				createdAt: project.createdAt,
				updatedAt: project.updatedAt,
				tags: project.tags,
				isFavorite: project.isFavorite,
				docUrl: project.docUrl,
				status: binding
					? !storageUnlockReady
						? 'syncing'
						: unavailableStorageProviders.has(providerId) || !storageUnlocked
							? 'unavailable'
							: sharedStorageConfigIds.has(providerId)
								? 'syncing'
								: 'error'
					: 'local-only',
				lastSync: binding?.lastSync,
				remoteOnly: false,
			};
		}
		return states;
	}, [
		storageProjects,
		projects,
		user,
		accountStorageConfigs,
		sharedStorageConfigIds,
		unavailableStorageProviders,
		storageUnlockReady,
		storageUnlocked,
	]);

	const filteredStoredProjects = useMemo(() => {
		const query = searchQuery.trim().toLowerCase();
		return storageProjects.filter(
			(project) =>
				project.remoteOnly &&
				(!query ||
					project.name.toLowerCase().includes(query) ||
					project.description.toLowerCase().includes(query) ||
					project.tags.some((tag) => tag.toLowerCase().includes(query))) &&
				(!selectedTag || project.tags.includes(selectedTag)) &&
				(!selectedType || project.type === selectedType) &&
				(!selectedGroup || (project.group ?? project.type) === selectedGroup),
		);
	}, [storageProjects, searchQuery, selectedTag, selectedType, selectedGroup]);

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
			moduleLog.error('Failed to delete projects:', error);
			setError(
				error instanceof Error ? error.message : t('Failed to delete projects'),
			);
		} finally {
			setIsSubmitting(false);
		}
	};

	useEffect(() => {
		const query = searchQuery.trim().toLowerCase();
		setFilteredProjects(
			projects.filter(
				(project) =>
					(!query ||
						project.name.toLowerCase().includes(query) ||
						project.description.toLowerCase().includes(query) ||
						project.tags.some((tag) => tag.toLowerCase().includes(query))) &&
					(!selectedTag || project.tags.includes(selectedTag)) &&
					(!selectedType || project.type === selectedType) &&
					(!selectedGroup || (project.group ?? project.type) === selectedGroup),
			),
		);
	}, [projects, searchQuery, selectedTag, selectedType, selectedGroup]);

	const handleSearch = (query: string) => setSearchQuery(query);
	const handleFilterByTag = (tag: string) => setSelectedTag(tag);
	const handleFilterByType = (type: string) => setSelectedType(type);
	const handleFilterByGroup = (group: string) => setSelectedGroup(group);

	const handleCreateProject = async (projectData: {
		name: string;
		description: string;
		type: ProjectType;
		group?: ProjectGroup;
		compilerId?: string;
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
					'projectMetadata',
					JSON.stringify({
						name: projectData.name,
						description: projectData.description,
						type: projectData.type,
						group: projectData.group,
						compilerId: projectData.compilerId,
					}),
				);
				onOpenProject(
					newProject.docUrl,
					newProject.name,
					newProject.description,
					newProject.type,
					newProject.group,
					newProject.id,
				);
			}
		} catch (error) {
			moduleLog.error('Failed to create project:', error);
			setError(
				error instanceof Error ? error.message : t('Failed to create project'),
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
			moduleLog.error('Failed to update project:', error);
			setError(
				error instanceof Error ? error.message : t('Failed to update project'),
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
			moduleLog.error('Failed to delete project:', error);
			setError(
				error instanceof Error ? error.message : t('Failed to delete project'),
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
			moduleLog.error('Failed to toggle favorite status:', error);
		}
	};

	const handleToggleViewMode = () => {
		setViewMode((prev) => (prev === 'grid' ? 'list' : 'grid'));
	};

	const handleExportSelected = async (selectedIds: string[]) => {
		try {
			const selectedProjects = projects.filter((p) =>
				selectedIds.includes(p.id),
			);
			setSelectedProjectsForExport(selectedProjects);
			setShowExportModal(true);
		} catch (error) {
			moduleLog.error('Error preparing export:', error);
			setError(t('Failed to prepare projects for export'));
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
			moduleLog.error('Error preparing delete:', error);
			setError(t('Failed to prepare projects for deletion'));
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

	const handleStorageSync = async (project: Project) => {
		if (!user) return;
		const binding = storageSyncService.getProjectBinding(user.id, project.id);
		const providerId = binding?.providerId ?? accountStorageConfigs[0]?.id;
		if (!providerId) {
			setError(t('No storage provider is configured'));
			return;
		}

		setStorageBusy((current) => new Set(current).add(project.id));
		setError(null);
		try {
			await storageSyncService.syncProject(user.id, project.id, providerId);
			await loadProjects();
			await loadStorageState();
		} catch (error) {
			moduleLog.error('Storage sync failed:', error);
			setError(
				error instanceof Error ? error.message : t('Storage sync failed'),
			);
		} finally {
			setStorageBusy((current) => {
				const next = new Set(current);
				next.delete(project.id);
				return next;
			});
		}
	};

	const prepareStoredProject = async (project: Project): Promise<Project> => {
		if (!user || !syncStorageBeforeOpen) return project;
		const binding = storageSyncService.getProjectBinding(user.id, project.id);
		if (!binding?.enabled) return project;

		setStorageBusy((current) => new Set(current).add(project.id));
		try {
			await storageSyncService.syncBoundProject(user.id, project.id);
			return (await getProjectById(project.id)) ?? project;
		} catch (error) {
			// Storage is supplemental: opening the local project must still succeed.
			moduleLog.warn('Storage reconciliation before open failed:', error);
			return project;
		} finally {
			setStorageBusy((current) => {
				const next = new Set(current);
				next.delete(project.id);
				return next;
			});
			void loadStorageState();
		}
	};

	const handleRestoreStoredProject = async (
		stored: StorageDashboardProject,
	) => {
		if (!user) return;
		setRestoringStorageProjects((current) =>
			new Set(current).add(stored.storageProjectId),
		);
		setError(null);
		try {
			const project = await storageSyncService.restoreRemoteProject(
				user.id,
				stored.providerId,
				stored.storageProjectId,
			);
			await loadProjects();
			await loadStorageState();
			onOpenProject(
				project.docUrl,
				project.name,
				project.description,
				project.type,
				project.group,
				project.id,
			);
		} catch (error) {
			moduleLog.error('Failed to restore stored project:', error);
			setError(
				error instanceof Error
					? error.message
					: t('Failed to restore stored project'),
			);
		} finally {
			setRestoringStorageProjects((current) => {
				const next = new Set(current);
				next.delete(stored.storageProjectId);
				return next;
			});
		}
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

	const handleOpenDefault = async (project: Project) => {
		const readyProject = await prepareStoredProject(project);
		if (!readyProject.docUrl) {
			moduleLog.error('Project has no document URL:', readyProject);
			setError(
				t(
					'This project has no associated document. Please try creating a new project',
				),
			);
			return;
		}

		if (!isValidYjsUrl(readyProject.docUrl)) {
			moduleLog.error('Invalid document URL format:', readyProject.docUrl);
			setError(
				t('Invalid document URL format: {url}', { url: readyProject.docUrl }),
			);
			return;
		}

		// This builds URL with last opened file/doc if available
		let finalUrl = readyProject.docUrl;
		if (readyProject.lastOpenedDocId || readyProject.lastOpenedFilePath) {
			const currentFragment = parseUrlFragments(finalUrl);
			const newUrl = buildUrlWithFragments(
				currentFragment.yjsUrl,
				readyProject.lastOpenedDocId,
				readyProject.lastOpenedFilePath,
			);
			finalUrl = newUrl;
		}

		onOpenProject(
			finalUrl,
			readyProject.name,
			readyProject.description,
			readyProject.type,
			readyProject.group,
			readyProject.id,
		);
	};

	const openProject = async (project: Project) => {
		const readyProject = await prepareStoredProject(project);
		if (!readyProject.docUrl) {
			moduleLog.error('Project has no document URL:', readyProject);
			setError(
				t(
					'This project has no associated document. Please try creating a new project',
				),
			);
			return;
		}

		if (!isValidYjsUrl(readyProject.docUrl)) {
			moduleLog.error('Invalid document URL format:', readyProject.docUrl);
			setError(
				t('Invalid document URL format: {url}', { url: readyProject.docUrl }),
			);
			return;
		}

		onOpenProject(
			readyProject.docUrl,
			readyProject.name,
			readyProject.description,
			readyProject.type,
			readyProject.group,
			readyProject.id,
		);
	};

	const handleSidebarResize = (width: number) => {
		setSidebarWidth(width);
	};

	return (
		<div className={`app-container ${currentThemePlugin?.id || 'default'}`}>
			{isGuestUser(user) && (
				<GuestUpgradeBanner
					onOpenUpgradeModal={() => setShowGuestUpgradeModal(true)}
				/>
			)}
			<ServiceStatusBanner />
			<QuotaBanner />
			<header data-role='projects'>
				<div className='header-left ui-actions'>
					<h1>{t('All Projects')}</h1>
				</div>

				<div className='header-center'>
					<a href='https://texlyre.org' target='_blank' rel='noreferrer'>
						<img src={texlyreLogo} className='logo' alt={t('TeXlyre logo')} />
					</a>
				</div>

				<div className='header-right scroll-x ui-actions' ref={headerRightRef}>
					{!isGuestUser(user) && (
						<BackupStatusIndicator className='header-backup-indicator' />
					)}
					<SettingsButton className='header-settings-button' />
					<UserDropdown
						username={user?.username || ''}
						onLogout={onLogout}
						onOpenProfile={(tab) => {
							setProfileTab(tab ?? 'account');
							setShowProfileModal(true);
						}}
						onOpenExport={() => setShowAccountExportModal(true)}
						onOpenDeleteAccount={() => setIsDeleteAccountModalOpen(true)}
						onOpenUpgrade={() => setShowGuestUpgradeModal(true)}
						isGuest={isGuestUser(user)}
					/>
				</div>
			</header>

			<div className='main-content'>
				<ResizablePanel
					direction='horizontal'
					width={sidebarWidth}
					minWidth={currentLayout?.minFileExplorerWidth || 200}
					maxWidth={currentLayout?.maxFileExplorerWidth || 500}
					onResize={handleSidebarResize}
					className='sidebar-container'
				>
					<ProjectPanel
						onCreateProject={openCreateModal}
						onImportProject={openImportModal}
						onSearch={handleSearch}
						onFilterByTag={handleFilterByTag}
						onFilterByType={handleFilterByType}
						onFilterByGroup={handleFilterByGroup}
						onOpenProject={openProject}
						onRestoreExternalProject={handleRestoreStoredProject}
						projects={projects}
						externalProjects={filteredStoredProjects}
						restoringExternalProjects={restoringStorageProjects}
						availableTags={availableTags}
						availableTypes={availableTypes}
						availableGroups={availableGroups}
					/>
				</ResizablePanel>

				<div className='editor-container'>
					{error && (
						<div
							className='ui-message'
							data-tone='error'
							style={{
								padding: '1rem',
								margin: '1rem',
								borderRadius: '4px',
							}}
						>
							{error}
						</div>
					)}

					{isLoading ? (
						<div className='ui-loading-state' data-fill='true'>
							<div className='loading-spinner' />
							<p>{t('Loading projects...')}</p>
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
							storageStates={storageStates}
							storageBusy={storageBusy}
							onStorageSync={handleStorageSync}
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
				<FooterLinks
					onShowPrivacy={() => {
						pushHash('privacy-policy');
						setShowPrivacy(true);
					}}
				/>
			</footer>

			<PrivacyModal
				isOpen={showPrivacy}
				onClose={() => {
					setShowPrivacy(false);
					if (window.location.hash === '#privacy-policy') {
						history.back();
					}
				}}
			/>

			<Modal
				isOpen={showCreateModal}
				onClose={() => setShowCreateModal(false)}
				title={t('Create New Project')}
				icon={NewProjectIcon}
			>
				{error && (
					<div className='form-error' style={{ marginBottom: '1rem' }}>
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
				title={t('Edit Project')}
			>
				{error && (
					<div className='form-error' style={{ marginBottom: '1rem' }}>
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
				title={t('Delete Project')}
				size='small'
			>
				<div className='delete-confirmation'>
					<p>
						{t('Are you sure you want to delete the project "{projectName}"?', {
							projectName: currentProject?.name || '',
						})}
					</p>
					<p className='ui-message' data-tone='warning'>
						{t('This action cannot be undone.')}
					</p>

					<div
						className='ui-actions'
						data-variant='modal'
						data-align='end'
						data-cross='stretch'
					>
						<button
							type='button'
							className='button secondary'
							onClick={() => setShowDeleteModal(false)}
							disabled={isSubmitting}
						>
							{t('Cancel')}
						</button>
						<button
							type='button'
							className='button danger'
							onClick={handleDeleteProject}
							disabled={isSubmitting}
						>
							{isSubmitting ? t('Deleting...') : t('Delete Project')}
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
						initialTab={profileTab}
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
			{!isGuestUser(user) && backupRootHandle && (
				<>
					<BackupDiscoveryModal
						isOpen={showDiscoveryModal}
						onClose={dismissDiscovery}
						rootHandle={backupRootHandle}
						discoveredProjects={discoveredProjects}
						onProjectsImported={handleDiscoveryImport}
					/>
				</>
			)}
		</div>
	);
};

export default ProjectApp;
