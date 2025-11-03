// src/components/project/ProjectList.tsx
import { t } from "@/i18n";
import type React from 'react';
import { useEffect, useState } from 'react';

import type { Project } from '../../types/projects';
import { ExportIcon, GridIcon, ImportIcon, ListIcon, TrashIcon } from '../common/Icons';
import ProjectCard from './ProjectCard';

interface ProjectListProps {
	projects: Project[];
	onOpenProject: (project: Project) => void;
	onOpenProjectDefault: (project: Project) => void;
	onEditProject: (project: Project) => void;
	onDeleteProject: (project: Project) => void;
	onToggleFavorite: (projectId: string) => void;
	onExportSelected?: (selectedIds: string[]) => void;
	onDeleteSelected?: (projectIds: string[]) => Promise<void>;
	onToggleViewMode?: () => void;
	viewMode?: 'grid' | 'list';
	itemsPerPage?: number;
}

const ProjectList: React.FC<ProjectListProps> = ({
	projects,
	onOpenProject,
	onOpenProjectDefault,
	onEditProject,
	onDeleteProject,
	onToggleFavorite,
	onExportSelected,
	onDeleteSelected,
	onToggleViewMode,
	viewMode = 'grid',
	itemsPerPage = 8
}) => {
	const [currentPage, setCurrentPage] = useState(1);
	const [sortBy, setSortBy] = useState<'name' | 'createdAt' | 'updatedAt'>(
		'updatedAt'
	);
	const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
	const [displayedProjects, setDisplayedProjects] = useState<Project[]>([]);
	const [selectedProjects, setSelectedProjects] = useState<Set<string>>(
		new Set()
	);
	const [isSelectionMode, setIsSelectionMode] = useState(false);
	const totalPages = Math.ceil(projects.length / itemsPerPage);

	useEffect(() => {
		// Sort projects
		const sortedProjects = [...projects].sort((a, b) => {
			if (sortBy === 'name') {
				return sortDirection === 'asc' ?
					a.name.localeCompare(b.name) :
					b.name.localeCompare(a.name);
			}
			return sortDirection === 'asc' ?
				a[sortBy] - b[sortBy] :
				b[sortBy] - a[sortBy];
		});

		const startIndex = (currentPage - 1) * itemsPerPage;
		const paginatedProjects = sortedProjects.slice(
			startIndex,
			startIndex + itemsPerPage
		);

		setDisplayedProjects(paginatedProjects);
	}, [projects, currentPage, sortBy, sortDirection, itemsPerPage]);

	const handleSortChange = (newSortBy: 'name' | 'createdAt' | 'updatedAt') => {
		if (sortBy === newSortBy) {
			setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
		} else {
			setSortBy(newSortBy);
			setSortDirection('desc');
		}
		setCurrentPage(1);
	};

	const handleNextPage = () => {
		if (currentPage < totalPages) {
			setCurrentPage(currentPage + 1);
		}
	};

	const handlePrevPage = () => {
		if (currentPage > 1) {
			setCurrentPage(currentPage - 1);
		}
	};

	const handleProjectSelection = (projectId: string, isSelected: boolean) => {
		const newSelected = new Set(selectedProjects);
		if (isSelected) {
			newSelected.add(projectId);
		} else {
			newSelected.delete(projectId);
		}
		setSelectedProjects(newSelected);
	};

	const handleSelectAll = () => {
		if (selectedProjects.size === projects.length) {
			setSelectedProjects(new Set());
		} else {
			setSelectedProjects(new Set(projects.map((p) => p.id)));
		}
	};

	const handleExportSelected = () => {
		if (selectedProjects.size > 0 && onExportSelected) {
			onExportSelected(Array.from(selectedProjects));
		}
	};

	const handleShowDeleteModal = () => {
		if (selectedProjects.size > 0 && onDeleteSelected) {
			onDeleteSelected(Array.from(selectedProjects));
		}
	};

	const handleEnterSelectionMode = () => {
		setIsSelectionMode(true);
		setSelectedProjects(new Set());
	};

	const handleExitSelectionMode = () => {
		setIsSelectionMode(false);
		setSelectedProjects(new Set());
	};

	return (
		<div className="project-list-container">
			<div className="project-list-header">
				<div className="project-sort-controls">
					<span>{t('Sort by:')}</span>
					<button
						className={`sort-button ${sortBy === 'name' ? 'active' : ''}`}
						onClick={() => handleSortChange('name')}>{t('Name')}

						{sortBy === 'name' && (sortDirection === 'asc' ? '↑' : '↓')}
					</button>
					<button
						className={`sort-button ${sortBy === 'createdAt' ? 'active' : ''}`}
						onClick={() => handleSortChange('createdAt')}>{t('Created')}

						{' '}
						{sortBy === 'createdAt' && (sortDirection === 'asc' ? '↑' : '↓')}
					</button>
					<button
						className={`sort-button ${sortBy === 'updatedAt' ? 'active' : ''}`}
						onClick={() => handleSortChange('updatedAt')}>{t('Updated')}

						{' '}
						{sortBy === 'updatedAt' && (sortDirection === 'asc' ? '↑' : '↓')}
					</button>
					<button
						className="sort-button"
						onClick={onToggleViewMode}
						title={`Switch to ${viewMode === 'grid' ? 'list' : 'grid'} view`}>

						{viewMode === 'grid' ? <ListIcon /> : <GridIcon />}
					</button>
				</div>

				<div
					className="project-selection-controls"
					style={{ marginTop: '0.5rem' }}>

					{!isSelectionMode ?
						<button
							className="button secondary smaller"
							onClick={handleEnterSelectionMode}
							disabled={projects.length === 0}>{t('Select Projects')}


						</button> :

						<div
							style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>

							<button
								className="button secondary smaller"
								onClick={handleSelectAll}>

								{selectedProjects.size === projects.length
									? t('Deselect All')
									: t('Select All')}
							</button>
							<button
								className="button primary smaller"
								onClick={handleExportSelected}
								disabled={selectedProjects.size === 0}>

								<ExportIcon />{t('Export (')}
								{selectedProjects.size})
							</button>
							<button
								className="button danger smaller"
								onClick={handleShowDeleteModal}
								disabled={selectedProjects.size === 0 || !onDeleteSelected}
								title={`Delete ${selectedProjects.size} selected project${selectedProjects.size === 1 ? '' : 's'}`}>

								<TrashIcon />{t('Delete (')}
								{selectedProjects.size})
							</button>
							<button
								className="button secondary smaller"
								onClick={handleExitSelectionMode}>{t('Cancel')}


							</button>
						</div>
					}
				</div>
			</div>

			<div style={{ flex: 1, overflow: 'auto', padding: '1rem' }}>
				{displayedProjects.length === 0 ?
					<div className="no-projects">
						<p>{t('No projects found matching the current criteria')}</p>
						{!isSelectionMode &&
							<p>{t('To create a new project, click the')}
								{" ''+'' "}
								<strong>{t('New Project')}</strong>{t('button or')}<ImportIcon />{' '}
								<strong>{t('Import')}</strong>{t('an existing one.')}
							</p>
						}
					</div> :

					<div className={`projects-${viewMode}`}>
						{displayedProjects.map((project) =>
							<ProjectCard
								key={project.id}
								project={project}
								onOpen={onOpenProject}
								onOpenDefault={onOpenProjectDefault}
								onEdit={onEditProject}
								onDelete={onDeleteProject}
								onToggleFavorite={onToggleFavorite}
								isSelectionMode={isSelectionMode}
								isSelected={selectedProjects.has(project.id)}
								onSelectionChange={handleProjectSelection} />

						)}
					</div>
				}
			</div>

			{totalPages > 1 &&
				<div
					className="pagination-controls"
					style={{
						padding: '0.5rem',
						borderTop: '1px solid var(--accent-border, #333)'
					}}>

					<button
						className="pagination-button"
						onClick={handlePrevPage}
						disabled={currentPage === 1}>{t('Previous')}


					</button>
					<span className="pagination-info">{t('Page {currentPage} of {totalPages}', { currentPage, totalPages })}
					</span>
					<button
						className="pagination-button"
						onClick={handleNextPage}
						disabled={currentPage === totalPages}>{t('Next')}


					</button>
				</div>
			}
		</div>);

};

export default ProjectList;