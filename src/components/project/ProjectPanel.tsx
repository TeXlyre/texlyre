// src/components/project/ProjectPanel.tsx
import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { t } from '@/i18n';
import { useProperties } from '../../hooks/useProperties';
import { useWheelScroll } from '../../hooks/useWheelScroll';
import { typesetterRegistryService } from '../../services/TypesetterRegistryService';
import type { Project } from '../../types/projects';
import type { StorageDashboardProject } from '../../types/storage';
import { ImportIcon, NewProjectIcon } from '../common/Icons';
import ProjectPanelSections, {
	PROJECT_PANEL_MIN_SECTION_SIZE,
} from './ProjectPanelSections';

const DEFAULT_SECTION_SIZES = { favorites: 30, recent: 35, external: 35 };

interface ProjectPanelProps {
	onCreateProject: () => void;
	onImportProject: () => void;
	onSearch: (query: string) => void;
	onFilterByTag: (tag: string) => void;
	onFilterByType: (type: string) => void;
	onFilterByGroup: (group: string) => void;
	onOpenProject?: (project: Project) => void;
	onRestoreExternalProject: (project: StorageDashboardProject) => void;
	projects: Project[];
	externalProjects: StorageDashboardProject[];
	providerNames: Record<string, string>;
	ownedProviderIds: Set<string>;
	busyRemoteIds: Set<string>;
	onRefreshRemote: () => void;
	onReconnectRemote: (project: StorageDashboardProject) => void;
	onRestoreMultiple: (projects: StorageDashboardProject[]) => void;
	onDisconnectRemote: (projects: StorageDashboardProject[]) => void;
	onRemoveRemote: (projects: StorageDashboardProject[]) => void;
	availableTags: string[];
	availableTypes: string[];
	availableGroups: string[];
}

const ProjectPanel: React.FC<ProjectPanelProps> = ({
	onCreateProject,
	onImportProject,
	onSearch,
	onFilterByTag,
	onFilterByType,
	onFilterByGroup,
	onOpenProject,
	onRestoreExternalProject,
	projects,
	externalProjects,
	providerNames,
	ownedProviderIds,
	busyRemoteIds,
	onRefreshRemote,
	onReconnectRemote,
	onRestoreMultiple,
	onDisconnectRemote,
	onRemoveRemote,
	availableTags,
	availableTypes,
	availableGroups,
}) => {
	const { getProperty, setProperty, registerProperty } = useProperties();
	const headerActionsRef = useWheelScroll<HTMLDivElement>();
	const propertiesRegistered = useRef(false);
	const [propertiesLoaded, setPropertiesLoaded] = useState(false);
	const [searchQuery, setSearchQuery] = useState('');
	const [selectedTag, setSelectedTag] = useState('');
	const [selectedType, setSelectedType] = useState('');
	// const [selectedGroup, setSelectedGroup] = useState('');
	const [favoritesCollapsed, setFavoritesCollapsed] = useState(false);
	const [recentCollapsed, setRecentCollapsed] = useState(false);
	const [externalCollapsed, setExternalCollapsed] = useState(false);
	const [sectionSizes, setSectionSizes] = useState(DEFAULT_SECTION_SIZES);

	const favoriteProjects = projects
		.filter((project) => project.isFavorite)
		.slice(0, 5);
	const recentProjects = [...projects]
		.sort((a, b) => b.updatedAt - a.updatedAt)
		.slice(0, 5);

	useEffect(() => {
		if (propertiesRegistered.current) return;
		propertiesRegistered.current = true;
		for (const [id, defaultValue] of [
			['project-panel-favorites-collapsed', false],
			['project-panel-recent-collapsed', false],
			['project-panel-external-collapsed', false],
			['project-panel-favorites-percent', DEFAULT_SECTION_SIZES.favorites],
			['project-panel-recent-percent', DEFAULT_SECTION_SIZES.recent],
			['project-panel-external-percent', DEFAULT_SECTION_SIZES.external],
		] as const) {
			registerProperty({
				id: id as string,
				category: 'UI',
				subcategory: 'Layout',
				defaultValue,
			});
		}
	}, [registerProperty]);

	useEffect(() => {
		if (propertiesLoaded) return;
		const storedFavoritesCollapsed = getProperty(
			'project-panel-favorites-collapsed',
		);
		const storedRecentCollapsed = getProperty('project-panel-recent-collapsed');
		const storedExternalCollapsed = getProperty(
			'project-panel-external-collapsed',
		);
		if (storedFavoritesCollapsed !== undefined) {
			setFavoritesCollapsed(Boolean(storedFavoritesCollapsed));
		}
		if (storedRecentCollapsed !== undefined) {
			setRecentCollapsed(Boolean(storedRecentCollapsed));
		}
		if (storedExternalCollapsed !== undefined) {
			setExternalCollapsed(Boolean(storedExternalCollapsed));
		}

		const nextSizes = { ...DEFAULT_SECTION_SIZES };
		for (const [key, propertyId] of [
			['favorites', 'project-panel-favorites-percent'],
			['recent', 'project-panel-recent-percent'],
			['external', 'project-panel-external-percent'],
		] as const) {
			const stored = Number(getProperty(propertyId));
			if (Number.isFinite(stored) && stored >= PROJECT_PANEL_MIN_SECTION_SIZE) {
				nextSizes[key] = stored;
			}
		}
		setSectionSizes(nextSizes);
		setPropertiesLoaded(true);
	}, [getProperty, propertiesLoaded]);

	const toggleFavorites = () => {
		const next = !favoritesCollapsed;
		setFavoritesCollapsed(next);
		setProperty('project-panel-favorites-collapsed', next);
	};

	const toggleRecent = () => {
		const next = !recentCollapsed;
		setRecentCollapsed(next);
		setProperty('project-panel-recent-collapsed', next);
	};

	const toggleExternal = () => {
		const next = !externalCollapsed;
		setExternalCollapsed(next);
		setProperty('project-panel-external-collapsed', next);
	};

	const persistSectionSizes = useCallback(
		(sizes: Record<string, number>) => {
			if (sizes.favorites !== undefined) {
				setProperty('project-panel-favorites-percent', sizes.favorites);
			}
			if (sizes.recent !== undefined) {
				setProperty('project-panel-recent-percent', sizes.recent);
			}
			if (sizes.external !== undefined) {
				setProperty('project-panel-external-percent', sizes.external);
			}
		},
		[setProperty],
	);

	return (
		<div className='file-explorer project-panel' data-role='project-panel'>
			<div className='ui-panel-header' data-role='explorer' data-position='top'>
				<h3 className='ui-panel-title' data-size='body' data-shrink='true'>
					{t('Projects')}
				</h3>
				<div
					className='ui-toolbar-actions scroll-x'
					data-gap='sm'
					data-active-style='filled'
					ref={headerActionsRef}
				>
					<button
						type='button'
						className='ui-icon-button'
						data-variant='subtle'
						title={t('New Project')}
						onClick={onCreateProject}
					>
						<NewProjectIcon />
					</button>
					<button
						type='button'
						className='ui-icon-button'
						data-variant='subtle'
						title={t('Import Projects')}
						onClick={onImportProject}
					>
						<ImportIcon />
					</button>
				</div>
			</div>
			<div
				className='ui-stack project-panel-controls'
				data-role='project-search'
				data-gap='sm'
				data-padding='sm'
			>
				<div className='ui-search-field'>
					<input
						type='text'
						placeholder={t('Search projects...')}
						value={searchQuery}
						onChange={(event) => {
							setSearchQuery(event.target.value);
							onSearch(event.target.value);
						}}
						className='search-input ui-field-control ui-search-control'
					/>
					{searchQuery && (
						<button
							type='button'
							aria-label={t('Clear search')}
							className='ui-search-clear'
							onClick={() => {
								setSearchQuery('');
								onSearch('');
							}}
							title={t('Clear search')}
						>
							<span aria-hidden='true'>×</span>
						</button>
					)}
				</div>
				<select
					value={selectedTag}
					onChange={(event) => {
						setSelectedTag(event.target.value);
						onFilterByTag(event.target.value);
					}}
					className='tag-filter ui-field-control'
				>
					<option value=''>{t('All tags')}</option>
					{availableTags.map((tag) => (
						<option key={tag} value={tag}>
							{tag}
						</option>
					))}
				</select>
				<select
					value={selectedType}
					onChange={(event) => {
						setSelectedType(event.target.value);
						onFilterByType(event.target.value);
					}}
					className='type-filter ui-field-control'
				>
					<option value=''>{t('All types')}</option>
					{availableTypes.map((type) => (
						<option key={type} value={type}>
							{typesetterRegistryService.getForProjectType(type)?.label ?? type}
						</option>
					))}
				</select>
				{/* <select value={selectedGroup} onChange={(event) => { setSelectedGroup(event.target.value); onFilterByGroup(event.target.value); }} className='type-filter ui-field-control'>
					<option value=''>{t('All groups')}</option>
					{availableGroups.map((group) => <option key={group} value={group}>{typesetterRegistryService.getProjectGroupLabel(group)}</option>)}
				</select> */}
			</div>
			<ProjectPanelSections
				favoriteProjects={favoriteProjects}
				recentProjects={recentProjects}
				externalProjects={externalProjects}
				localProjects={projects}
				providerNames={providerNames}
				ownedProviderIds={ownedProviderIds}
				busyRemoteIds={busyRemoteIds}
				onRefreshRemote={onRefreshRemote}
				onOpenLocal={(project) => onOpenProject?.(project)}
				onReconnectRemote={onReconnectRemote}
				onRestoreMultiple={onRestoreMultiple}
				onDisconnectRemote={onDisconnectRemote}
				onRemoveRemote={onRemoveRemote}
				sectionSizes={sectionSizes}
				favoritesCollapsed={favoritesCollapsed}
				recentCollapsed={recentCollapsed}
				externalCollapsed={externalCollapsed}
				onSizesChangeEnd={persistSectionSizes}
				onToggleFavorites={toggleFavorites}
				onToggleRecent={toggleRecent}
				onToggleExternal={toggleExternal}
				onOpenProject={onOpenProject}
				onRestoreExternalProject={onRestoreExternalProject}
			/>
		</div>
	);
};

export default ProjectPanel;
