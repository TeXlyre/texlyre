// src/components/project/ProjectPanelSections.tsx
import type React from 'react';

import { t } from '@/i18n';
import type { Project } from '../../types/projects';
import type { StorageDashboardProject } from '../../types/storage';
import { formatLastModified } from '../../utils/dateUtils';
import { ChevronDownIcon, ChevronRightIcon, StarIcon } from '../common/Icons';
import ResizablePanel, { ResizablePanelGroup } from '../common/ResizablePanel';
import StoredProjectList from './StoredProjectList';

export const PROJECT_PANEL_MIN_SECTION_SIZE = 12;

interface ProjectSectionHeaderProps {
	title: string;
	count: number;
	collapsed: boolean;
	onToggle: () => void;
}

const ProjectSectionHeader: React.FC<ProjectSectionHeaderProps> = ({
	title,
	count,
	collapsed,
	onToggle,
}) => (
	<div className='project-panel-outline-heading ui-section-header ui-explorer-heading'>
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
	</div>
);

type SectionSizes = {
	favorites: number;
	recent: number;
	external: number;
};

interface ProjectPanelSectionsProps {
	favoriteProjects: Project[];
	recentProjects: Project[];
	externalProjects: StorageDashboardProject[];
	sectionSizes: SectionSizes;
	favoritesCollapsed: boolean;
	recentCollapsed: boolean;
	externalCollapsed: boolean;
	restoringExternalProjects: Set<string>;
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
	sectionSizes,
	favoritesCollapsed,
	recentCollapsed,
	externalCollapsed,
	restoringExternalProjects,
	onSizesChangeEnd,
	onToggleFavorites,
	onToggleRecent,
	onToggleExternal,
	onOpenProject,
	onRestoreExternalProject,
}) => (
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
				/>
				{!externalCollapsed && (
					<div className='project-panel-section-body'>
						{externalProjects.length === 0 ? (
							<div className='project-panel-empty-row ui-note'>
								{t('No remote-only projects')}
							</div>
						) : (
							<StoredProjectList
								projects={externalProjects}
								busyIds={restoringExternalProjects}
								onRestore={onRestoreExternalProject}
							/>
						)}
					</div>
				)}
			</section>
		</ResizablePanel>
	</ResizablePanelGroup>
);

export default ProjectPanelSections;
