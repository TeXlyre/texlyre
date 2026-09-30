// src/components/project/ProjectPanel.tsx
import type React from 'react';
import { useState } from 'react';

import { t } from '@/i18n';
import { useWheelScroll } from '../../hooks/useWheelScroll';
import { typesetterRegistryService } from '../../services/TypesetterRegistryService';
import type { Project } from '../../types/projects';
import { formatLastModified } from '../../utils/dateUtils';
import { ImportIcon, NewProjectIcon, StarIcon } from '../common/Icons';

interface ProjectPanelProps {
	onCreateProject: () => void;
	onImportProject: () => void;
	onSearch: (query: string) => void;
	onFilterByTag: (tag: string) => void;
	onFilterByType: (type: string) => void;
	onFilterByGroup: (group: string) => void;
	onOpenProject?: (project: Project) => void;
	projects: Project[];
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
	projects,
	availableTags,
	availableTypes,
	availableGroups,
}) => {
	const headerActionsRef = useWheelScroll<HTMLDivElement>();
	const [searchQuery, setSearchQuery] = useState('');
	const [selectedTag, setSelectedTag] = useState('');
	const [selectedType, setSelectedType] = useState('');
	// const [selectedGroup, setSelectedGroup] = useState('');
	const favoriteProjects = projects
		.filter((project) => project.isFavorite)
		.slice(0, 5);
	const recentProjects = [...projects]
		.sort((a, b) => b.updatedAt - a.updatedAt)
		.slice(0, 5);

	return (
		<div className='file-explorer' data-role='project-panel'>
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
				className='ui-stack'
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
				{favoriteProjects.length > 0 && (
					<section className='ui-stack' data-gap='xs'>
						<h4 className='ui-meta'>{t('Favorites')}</h4>
						<div className='ui-list' data-gap='xs' data-scroll='medium'>
							{favoriteProjects.map((project) => (
								<div
									key={project.id}
									className='ui-list-item'
									data-interactive='true'
									data-border='none'
									data-surface='secondary'
									data-align='center'
									data-gap='xs'
									data-padding='xs'
									onClick={() => onOpenProject?.(project)}
									title={project.description}
								>
									<span className='ui-icon' data-tone='warning'>
										<StarIcon />
									</span>
									<span>{project.name}</span>
								</div>
							))}
						</div>
					</section>
				)}
				<section className='ui-stack' data-gap='xs'>
					<h4 className='ui-meta'>{t('Recent')}</h4>
					<div className='ui-list' data-gap='xs' data-scroll='medium'>
						{recentProjects.map((project) => (
							<div
								key={project.id}
								className='ui-list-item'
								data-interactive='true'
								data-border='none'
								data-surface='secondary'
								data-align='center'
								data-justify='between'
								data-padding='xs'
								onClick={() => onOpenProject?.(project)}
								title={project.description}
							>
								<span className='ui-list-content' data-grow='true'>
									{project.name}
								</span>
								<span className='ui-meta'>
									{formatLastModified(project.updatedAt)}
								</span>
							</div>
						))}
					</div>
				</section>
			</div>
		</div>
	);
};

export default ProjectPanel;
