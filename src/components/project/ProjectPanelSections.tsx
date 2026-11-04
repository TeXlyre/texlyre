// src/components/project/ProjectPanelSections.tsx
import type React from 'react';
import { useMemo, useState } from 'react';

import { t } from '@/i18n';
import { useWheelScroll } from '../../hooks/useWheelScroll';
import type { Project } from '../../types/projects';
import type { StorageDashboardProject } from '../../types/storage';
import { formatLastModified } from '../../utils/dateUtils';
import {
	CheckIcon,
	ChevronDownIcon,
	ChevronRightIcon,
	FolderImportIcon,
	OptionsIcon,
	RefreshIcon,
	StarIcon,
	TrashIcon,
	UnlinkIcon,
} from '../common/Icons';
import ResizablePanel, { ResizablePanelGroup } from '../common/ResizablePanel';
import StoredProjectList, { storageProjectKey } from './StoredProjectList';

export const PROJECT_PANEL_MIN_SECTION_SIZE = 12;

interface ProjectSectionHeaderProps {
	title: string;
	count: number;
	collapsed: boolean;
	onToggle: () => void;
	actions?: React.ReactNode;
}

const ProjectSectionHeader: React.FC<ProjectSectionHeaderProps> = ({
	title,
	count,
	collapsed,
	onToggle,
	actions,
}) => {
	const headerRef = useWheelScroll<HTMLDivElement>();
	return (
		<div
			className='project-panel-outline-heading ui-section-header ui-explorer-heading scroll-x'
			ref={headerRef}
		>
			<button
				type='button'
				className='ui-icon-button'
				data-variant='subtle'
				data-size='xs'
				onClick={onToggle}
				title={
					collapsed
						? t('Expand {section}', { section: title })
						: t('Collapse {section}', { section: title })
				}
				aria-label={
					collapsed
						? t('Expand {section}', { section: title })
						: t('Collapse {section}', { section: title })
				}
			>
				{collapsed ? <ChevronRightIcon /> : <ChevronDownIcon />}
			</button>
			<span className='outline-header-title ui-panel-title ui-section-title'>
				{title}
			</span>
			<span className='ui-badge' data-variant='label'>
				{count}
			</span>
			{actions && (
				<div className='ui-toolbar-actions' data-gap='xs'>
					{actions}
				</div>
			)}
		</div>
	);
};

type SectionSizes = {
	favorites: number;
	recent: number;
	external: number;
};

interface ProjectPanelSectionsProps {
	favoriteProjects: Project[];
	recentProjects: Project[];
	externalProjects: StorageDashboardProject[];
	localProjects: Project[];
	providerNames: Record<string, string>;
	ownedProviderIds: Set<string>;
	busyRemoteIds: Set<string>;
	storageLoading: boolean;
	onRefreshRemote: () => void;
	onOpenLocal: (project: Project) => void;
	onReconnectRemote: (project: StorageDashboardProject) => void;
	onRestoreMultiple: (projects: StorageDashboardProject[]) => void;
	onDisconnectRemote: (projects: StorageDashboardProject[]) => void;
	onRemoveRemote: (projects: StorageDashboardProject[]) => void;
	sectionSizes: SectionSizes;
	favoritesCollapsed: boolean;
	recentCollapsed: boolean;
	externalCollapsed: boolean;
	onSizesChangeEnd: (sizes: Record<string, number>) => void;
	onToggleFavorites: () => void;
	onToggleRecent: () => void;
	onToggleExternal: () => void;
	onOpenProject?: (project: Project) => void;
	onRestoreExternalProject: (project: StorageDashboardProject) => void;
}

const ProjectPanelSections: React.FC<ProjectPanelSectionsProps> = ({
	favoriteProjects,
	recentProjects,
	externalProjects,
	localProjects,
	providerNames,
	ownedProviderIds,
	busyRemoteIds,
	storageLoading,
	onRefreshRemote,
	onOpenLocal,
	onReconnectRemote,
	onRestoreMultiple,
	onDisconnectRemote,
	onRemoveRemote,
	sectionSizes,
	favoritesCollapsed,
	recentCollapsed,
	externalCollapsed,
	onSizesChangeEnd,
	onToggleFavorites,
	onToggleRecent,
	onToggleExternal,
	onOpenProject,
	onRestoreExternalProject,
}) => {
	const [optionsOpen, setOptionsOpen] = useState(false);
	const [selectionMode, setSelectionMode] = useState(false);
	const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
	const [visibility, setVisibility] = useState<'all' | 'local' | 'remote'>(
		'all',
	);
	const [sort, setSort] = useState('updated-desc');
	const visibleProjects = useMemo(() => {
		const filtered = externalProjects.filter(
			(project) =>
				visibility === 'all' ||
				(visibility === 'remote' ? project.remoteOnly : !project.remoteOnly),
		);
		return [...filtered].sort((a, b) => {
			switch (sort) {
				case 'name-asc':
					return a.name.localeCompare(b.name);
				case 'name-desc':
					return b.name.localeCompare(a.name);
				case 'updated-asc':
					return a.updatedAt - b.updatedAt;
				default:
					return b.updatedAt - a.updatedAt;
			}
		});
	}, [externalProjects, visibility, sort]);
	const selected = visibleProjects.filter((project) =>
		selectedKeys.has(storageProjectKey(project)),
	);
	const disconnectable = selected.filter(
		(project) =>
			localProjects.some((local) => local.id === project.localProjectId) &&
			project.status !== 'disconnected' &&
			project.status !== 'error',
	);
	const restorable = selected.filter((project) => project.remoteOnly);
	const removable = selected.filter(
		(project) =>
			ownedProviderIds.has(project.providerId) &&
			project.canDeleteRemote === true &&
			!['local-only', 'error', 'unavailable', 'checking'].includes(
				project.status,
			),
	);
	const toggleSelection = () => {
		setSelectionMode((current) => !current);
		setSelectedKeys(new Set());
	};
	return (
		<ResizablePanelGroup
			direction='vertical'
			className='project-panel-stack'
			defaultSizes={sectionSizes}
			onSizesChangeEnd={onSizesChangeEnd}
		>
			<ResizablePanel
				direction='vertical'
				alignment='start'
				className='project-panel-stack-panel favorites'
				collapsible={false}
				collapsed={favoritesCollapsed}
				stackId='favorites'
				stackDefaultSize={sectionSizes.favorites}
				stackMinSize={PROJECT_PANEL_MIN_SECTION_SIZE}
			>
				<section className='project-panel-outline-section favorites'>
					<ProjectSectionHeader
						title={t('Favorites')}
						count={favoriteProjects.length}
						collapsed={favoritesCollapsed}
						onToggle={onToggleFavorites}
					/>
					{!favoritesCollapsed && (
						<div className='project-panel-section-body'>
							{favoriteProjects.length === 0 ? (
								<div className='project-panel-empty-row ui-note'>
									{t('No favorite projects')}
								</div>
							) : (
								<div className='ui-list'>
									{favoriteProjects.map((project) => (
										<button
											type='button'
											key={project.id}
											className='project-panel-project-row'
											onClick={() => onOpenProject?.(project)}
											title={project.description}
										>
											<span
												className='project-panel-project-icon'
												aria-hidden='true'
											>
												<StarIcon filled />
											</span>
											<span className='project-panel-project-copy'>
												<strong>{project.name}</strong>
											</span>
										</button>
									))}
								</div>
							)}
						</div>
					)}
				</section>
			</ResizablePanel>

			<ResizablePanel
				direction='vertical'
				alignment='start'
				className='project-panel-stack-panel recent'
				collapsible={false}
				collapsed={recentCollapsed}
				stackId='recent'
				stackDefaultSize={sectionSizes.recent}
				stackMinSize={PROJECT_PANEL_MIN_SECTION_SIZE}
			>
				<section className='project-panel-outline-section recent'>
					<ProjectSectionHeader
						title={t('Recent')}
						count={recentProjects.length}
						collapsed={recentCollapsed}
						onToggle={onToggleRecent}
					/>
					{!recentCollapsed && (
						<div className='project-panel-section-body'>
							{recentProjects.length === 0 ? (
								<div className='project-panel-empty-row ui-note'>
									{t('No recent projects')}
								</div>
							) : (
								<div className='ui-list'>
									{recentProjects.map((project) => (
										<button
											type='button'
											key={project.id}
											className='project-panel-project-row'
											onClick={() => onOpenProject?.(project)}
											title={project.description}
										>
											<span className='project-panel-project-copy'>
												<strong>{project.name}</strong>
												<span className='project-panel-item-meta'>
													{formatLastModified(project.updatedAt)}
												</span>
											</span>
										</button>
									))}
								</div>
							)}
						</div>
					)}
				</section>
			</ResizablePanel>

			<ResizablePanel
				direction='vertical'
				alignment='start'
				className='project-panel-stack-panel external'
				collapsible={false}
				collapsed={externalCollapsed}
				stackId='external'
				stackDefaultSize={sectionSizes.external}
				stackMinSize={PROJECT_PANEL_MIN_SECTION_SIZE}
			>
				<section className='project-panel-outline-section external'>
					<ProjectSectionHeader
						title={t('Remote Projects')}
						count={externalProjects.length}
						collapsed={externalCollapsed}
						onToggle={onToggleExternal}
						actions={
							<>
								<button
									type='button'
									className='ui-icon-button'
									data-variant='subtle'
									data-size='xs'
									title={t('Refresh remote projects')}
									aria-label={t('Refresh remote projects')}
									disabled={storageLoading}
									onClick={onRefreshRemote}
								>
									{storageLoading ? (
										<span className='loading-spinner' aria-hidden='true' />
									) : (
										<RefreshIcon />
									)}
								</button>
								<button
									type='button'
									className='ui-icon-button'
									data-variant='subtle'
									data-size='xs'
									title={t('Remote project options')}
									aria-label={t('Remote project options')}
									aria-expanded={optionsOpen}
									onClick={() => setOptionsOpen(!optionsOpen)}
								>
									<OptionsIcon />
								</button>
								<button
									type='button'
									className='ui-icon-button'
									data-variant='subtle'
									data-size='xs'
									title={t('Select remote projects')}
									aria-label={t('Select remote projects')}
									aria-pressed={selectionMode}
									onClick={toggleSelection}
								>
									<CheckIcon />
								</button>
							</>
						}
					/>
					{!externalCollapsed && (
						<div className='project-panel-section-body'>
							{optionsOpen && (
								<div className='project-panel-remote-options'>
									<label>
										{t('Show')}
										<select
											className='ui-field-control'
											value={visibility}
											onChange={(event) =>
												setVisibility(event.target.value as typeof visibility)
											}
										>
											<option value='all'>{t('All remote projects')}</option>
											<option value='local'>{t('Local and remote')}</option>
											<option value='remote'>{t('Remote only')}</option>
										</select>
									</label>
									<label>
										{t('Sort by')}
										<select
											className='ui-field-control'
											value={sort}
											onChange={(event) => setSort(event.target.value)}
										>
											<option value='updated-desc'>{t('Newest first')}</option>
											<option value='updated-asc'>{t('Oldest first')}</option>
											<option value='name-asc'>{t('Name (A–Z)')}</option>
											<option value='name-desc'>{t('Name (Z–A)')}</option>
										</select>
									</label>
								</div>
							)}
							{selectionMode && (
								<div className='project-panel-remote-selection'>
									<button
										type='button'
										className='project-panel-remote-text-action'
										title={t('Select all visible')}
										onClick={() =>
											setSelectedKeys((current) => {
												const next = new Set(current);
												visibleProjects.forEach((project) => {
													next.add(storageProjectKey(project));
												});
												return next;
											})
										}
									>
										{t('Select all')}
									</button>
									<button
										type='button'
										className='project-panel-remote-text-action'
										title={t('Clear selection')}
										onClick={() => setSelectedKeys(new Set())}
									>
										{t('Clear')}
									</button>
									<span className='ui-note'>
										{selected.length} {t('selected')}
									</span>
									<button
										type='button'
										className='ui-icon-button'
										data-variant='subtle'
										data-size='xs'
										title={t('Restore selected')}
										aria-label={t('Restore selected')}
										disabled={
											restorable.length === 0 ||
											restorable.some((p) =>
												busyRemoteIds.has(storageProjectKey(p)),
											)
										}
										onClick={() => {
											onRestoreMultiple(restorable);
											setSelectedKeys(new Set());
										}}
									>
										<FolderImportIcon />
									</button>
									<button
										type='button'
										className='ui-icon-button'
										data-variant='subtle'
										data-size='xs'
										title={t('Disconnect selected')}
										aria-label={t('Disconnect selected')}
										disabled={
											disconnectable.length === 0 ||
											disconnectable.some((p) =>
												busyRemoteIds.has(storageProjectKey(p)),
											)
										}
										onClick={() => {
											onDisconnectRemote(disconnectable);
											setSelectedKeys(new Set());
										}}
									>
										<UnlinkIcon />
									</button>
									<button
										type='button'
										className='ui-icon-button'
										data-variant='subtle'
										data-size='xs'
										title={t('Delete selected from remote storage')}
										aria-label={t('Delete selected from remote storage')}
										disabled={
											removable.length === 0 ||
											removable.some((p) =>
												busyRemoteIds.has(storageProjectKey(p)),
											)
										}
										onClick={() => onRemoveRemote(removable)}
									>
										<TrashIcon />
									</button>
								</div>
							)}
							{storageLoading && (
								<div
									className='project-panel-loading-row ui-note'
									role='status'
								>
									<span className='loading-spinner' aria-hidden='true' />
									{t('Loading projects...')}
								</div>
							)}
							{visibleProjects.length === 0 ? (
								storageLoading ? null : (
									<div className='project-panel-empty-row ui-note'>
										{t('No remote projects match')}
									</div>
								)
							) : (
								<StoredProjectList
									projects={visibleProjects}
									localProjects={localProjects}
									providerNames={providerNames}
									ownedProviderIds={ownedProviderIds}
									busyIds={busyRemoteIds}
									selectionMode={selectionMode}
									selectedKeys={selectedKeys}
									onSelect={(key, checked) =>
										setSelectedKeys((current) => {
											const next = new Set(current);
											if (checked) next.add(key);
											else next.delete(key);
											return next;
										})
									}
									onRestore={onRestoreExternalProject}
									onOpenLocal={onOpenLocal}
									onReconnect={onReconnectRemote}
									onDisconnect={onDisconnectRemote}
									onRemoveRemote={onRemoveRemote}
								/>
							)}
						</div>
					)}
				</section>
			</ResizablePanel>
		</ResizablePanelGroup>
	);
};

export default ProjectPanelSections;
