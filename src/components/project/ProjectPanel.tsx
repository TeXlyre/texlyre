// src/components/project/ProjectPanel.tsx
import type React from 'react';
import { useState } from 'react';

import { t } from '@/i18n';
import { compilerRegistryService } from '../../services/CompilerRegistryService';
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
		<div className='file-explorer'>
			<div className='file-explorer-header'>
				<h3>{t('Projects')}</h3>
				<div className='file-explorer-actions'>
					<button
						className='action-btn'
						title={t('New Project')}
						onClick={onCreateProject}
					>
						<NewProjectIcon />
					</button>
					<button
						className='action-btn'
						title={t('Import Projects')}
						onClick={onImportProject}
					>
						<ImportIcon />
					</button>
				</div>
			</div>
			<div className='project-search-container'>
				<input
					type='text'
					placeholder={t('Search projects...')}
					value={searchQuery}
					onChange={(event) => {
						setSearchQuery(event.target.value);
						onSearch(event.target.value);
					}}
					className='search-input'
				/>
				{searchQuery && (
					<button
						aria-label={t('Clear search')}
						className='clear-search-button'
						onClick={() => {
							setSearchQuery('');
							onSearch('');
						}}
						title={t('Clear search')}
					>
						<span aria-hidden='true'>×</span>
					</button>
				)}
				<select
					value={selectedTag}
					onChange={(event) => {
						setSelectedTag(event.target.value);
						onFilterByTag(event.target.value);
					}}
					className='tag-filter'
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
					className='type-filter'
				>
					<option value=''>{t('All types')}</option>
					{availableTypes.map((type) => (
						<option key={type} value={type}>
							{compilerRegistryService.getForProjectType(type)?.label ?? type}
						</option>
					))}
				</select>
				{/* <select value={selectedGroup} onChange={(event) => { setSelectedGroup(event.target.value); onFilterByGroup(event.target.value); }} className='type-filter'>
					<option value=''>{t('All groups')}</option>
					{availableGroups.map((group) => <option key={group} value={group}>{compilerRegistryService.getProjectGroupLabel(group)}</option>)}
				</select> */}
				{favoriteProjects.length > 0 && (
					<div className='project-quick-list'>
						<h4>{t('Favorites')}</h4>
						<div className='quick-list-container'>
							{favoriteProjects.map((project) => (
								<div
									key={project.id}
									className='quick-project-item'
									onClick={() => onOpenProject?.(project)}
									title={project.description}
								>
									<StarIcon /> {project.name}
								</div>
							))}
						</div>
					</div>
				)}
				<div className='project-quick-list'>
					<h4>{t('Recent')}</h4>
					<div className='quick-list-container'>
						{recentProjects.map((project) => (
							<div
								key={project.id}
								className='quick-project-item quick-project-item-recent'
								onClick={() => onOpenProject?.(project)}
								title={project.description}
							>
								<span className='quick-project-name'>{project.name}</span>
								<span className='quick-project-time'>
									{formatLastModified(project.updatedAt)}
								</span>
							</div>
						))}
					</div>
				</div>
			</div>
		</div>
	);
};

export default ProjectPanel;
