// src/components/project/ProjectList.tsx
import { t } from '@/i18n';
import { Trans } from 'react-i18next';
import type React from 'react';
import { useEffect, useState, useRef } from 'react';

import type { Project } from '../../types/projects';
import { useProperties } from '../../hooks/useProperties';
import {
	ExportIcon,
	GridIcon,
	ImportIcon,
	ListIcon,
	TrashIcon,
} from '../common/Icons';
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
	viewMode: externalViewMode = 'grid',
	itemsPerPage: maxItemsPerPage = 12,
}) => {
	const { getProperty, setProperty, registerProperty } = useProperties();
	const propertiesRegistered = useRef(false);
	const [propertiesLoaded, setPropertiesLoaded] = useState(false);

	const [currentPage, setCurrentPage] = useState(1);
	const [sortBy, setSortBy] = useState<'name' | 'createdAt' | 'updatedAt'>(
		'updatedAt',
	);
	const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
	const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
	const [displayedProjects, setDisplayedProjects] = useState<Project[]>([]);
	const [selectedProjects, setSelectedProjects] = useState<Set<string>>(
		new Set(),
	);
	const [isSelectionMode, setIsSelectionMode] = useState(false);
	const gridRef = useRef<HTMLDivElement>(null);
	const [columns, setColumns] = useState(1);
	const itemsPerPage = maxItemsPerPage - (maxItemsPerPage % columns);
	const totalPages = Math.ceil(projects.length / itemsPerPage);

	/* biome-ignore lint/correctness/useExhaustiveDependencies(displayedProjects.length): The rendered item count intentionally retriggers CSS grid column measurement. */
	useEffect(() => {
		const grid = gridRef.current;
		if (!grid) return;

		const update = () =>
			setColumns(getComputedStyle(grid).gridTemplateColumns.split(' ').length);

		update();
		const observer = new ResizeObserver(update);
		observer.observe(grid);
		return () => observer.disconnect();
	}, [displayedProjects.length]);

	useEffect(() => {
		if (propertiesRegistered.current) return;
		propertiesRegistered.current = true;

		registerProperty({
			id: 'project-list-sort-by',
			category: 'UI',
			subcategory: 'Projects',
			defaultValue: 'updatedAt',
		});

		registerProperty({
			id: 'project-list-sort-direction',
			category: 'UI',
			subcategory: 'Projects',
			defaultValue: 'desc',
		});

		registerProperty({
			id: 'project-list-view-mode',
			category: 'UI',
			subcategory: 'Projects',
			defaultValue: 'grid',
		});
	}, [registerProperty]);

	useEffect(() => {
		if (propertiesLoaded) return;

		const storedSortBy = getProperty('project-list-sort-by');
		const storedSortDirection = getProperty('project-list-sort-direction');
		const storedViewMode = getProperty('project-list-view-mode');

		if (storedSortBy !== undefined) {
			setSortBy(storedSortBy as 'name' | 'createdAt' | 'updatedAt');
		}

		if (storedSortDirection !== undefined) {
			setSortDirection(storedSortDirection as 'asc' | 'desc');
		}

		if (storedViewMode !== undefined) {
			setViewMode(storedViewMode as 'grid' | 'list');
		}

		setPropertiesLoaded(true);
	}, [getProperty, propertiesLoaded]);

	useEffect(() => {
		const sortedProjects = [...projects].sort((a, b) => {
			if (sortBy === 'name') {
				return sortDirection === 'asc'
					? a.name.localeCompare(b.name)
					: b.name.localeCompare(a.name);
			}
			return sortDirection === 'asc'
				? a[sortBy] - b[sortBy]
				: b[sortBy] - a[sortBy];
		});

		const startIndex = (currentPage - 1) * itemsPerPage;
		const paginatedProjects = sortedProjects.slice(
			startIndex,
			startIndex + itemsPerPage,
		);

		setDisplayedProjects(paginatedProjects);
	}, [projects, currentPage, sortBy, sortDirection, itemsPerPage]);

	const handleSortChange = (newSortBy: 'name' | 'createdAt' | 'updatedAt') => {
		if (sortBy === newSortBy) {
			const newDirection = sortDirection === 'asc' ? 'desc' : 'asc';
			setSortDirection(newDirection);
			setProperty('project-list-sort-direction', newDirection);
		} else {
			setSortBy(newSortBy);
			setSortDirection('desc');
			setProperty('project-list-sort-by', newSortBy);
			setProperty('project-list-sort-direction', 'desc');
		}
		setCurrentPage(1);
	};

	/* biome-ignore lint/correctness/useExhaustiveDependencies: Reset page whenever projects change.*/
	useEffect(() => {
		setCurrentPage(1);
	}, [projects]);

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

	const handleToggleViewMode = () => {
		const newViewMode = viewMode === 'grid' ? 'list' : 'grid';
		setViewMode(newViewMode);
		setProperty('project-list-view-mode', newViewMode);
		if (onToggleViewMode) {
			onToggleViewMode();
		}
	};

	return (
		<div className='ui-panel' data-height='full' data-role='project-list'>
			<div className='ui-panel-header' data-role='project-list'>
				<div className='ui-toolbar' data-gap='sm'>
					<span>{t('Sort by:')}</span>
					<button
						type='button'
						className={`button ${sortBy === 'name' ? 'active' : ''}`}
						onClick={() => handleSortChange('name')}
					>
						{t('Name')}

						{sortBy === 'name' && (sortDirection === 'asc' ? '↑' : '↓')}
					</button>
					<button
						type='button'
						className={`button ${sortBy === 'createdAt' ? 'active' : ''}`}
						onClick={() => handleSortChange('createdAt')}
					>
						{t('Created')}{' '}
						{sortBy === 'createdAt' && (sortDirection === 'asc' ? '↑' : '↓')}
					</button>
					<button
						type='button'
						className={`button ${sortBy === 'updatedAt' ? 'active' : ''}`}
						onClick={() => handleSortChange('updatedAt')}
					>
						{t('Updated')}{' '}
						{sortBy === 'updatedAt' && (sortDirection === 'asc' ? '↑' : '↓')}
					</button>
					<button
						type='button'
						className='button '
						onClick={handleToggleViewMode}
						title={t('Switch to {viewMode}', {
							viewMode: viewMode === 'grid' ? t('List View') : t('Grid View'),
						})}
					>
						{viewMode === 'grid' ? <ListIcon /> : <GridIcon />}
					</button>
				</div>

				<div className='ui-actions'>
					{!isSelectionMode ? (
						<button
							type='button'
							className='button secondary '
							onClick={handleEnterSelectionMode}
							disabled={projects.length === 0}
						>
							{t('Select Projects')}
						</button>
					) : (
						<div className='ui-actions'>
							<button
								type='button'
								className='button secondary '
								onClick={handleSelectAll}
							>
								{selectedProjects.size === projects.length
									? t('Deselect All')
									: t('Select All')}
							</button>
							<button
								type='button'
								className='button primary '
								onClick={handleExportSelected}
								disabled={selectedProjects.size === 0}
							>
								<ExportIcon />
								{t('Export (')}
								{selectedProjects.size})
							</button>
							<button
								type='button'
								className='button danger '
								onClick={handleShowDeleteModal}
								disabled={selectedProjects.size === 0 || !onDeleteSelected}
								title={`Delete ${selectedProjects.size} selected project${selectedProjects.size === 1 ? '' : 's'}`}
							>
								<TrashIcon />
								{t('Delete (')}
								{selectedProjects.size})
							</button>
							<button
								type='button'
								className='button secondary '
								onClick={handleExitSelectionMode}
							>
								{t('Cancel')}
							</button>
						</div>
					)}
				</div>
			</div>

			<div className='ui-panel-content' data-overflow='y' data-padding='sm'>
				{displayedProjects.length === 0 ? (
					<div className='ui-empty-state'>
						<p>{t('No projects found matching the current criteria')}</p>
						{!isSelectionMode && (
							<p>
								<Trans
									i18nKey="To create a new project, click the '+' <strong>New Project</strong> button or <icon /> <strong>Import</strong> an existing one."
									components={{
										strong: <strong />,
										icon: (
											<>
												{' '}
												<ImportIcon />{' '}
											</>
										),
									}}
								/>
							</p>
						)}
					</div>
				) : (
					<div
						ref={gridRef}
						className={
							viewMode === 'list' ? 'projects-list ui-list' : 'projects-grid'
						}
						data-gap={viewMode === 'list' ? 'xs' : undefined}
					>
						{displayedProjects.map((project) => (
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
								onSelectionChange={handleProjectSelection}
							/>
						))}
					</div>
				)}
			</div>

			{totalPages > 1 && (
				<div className='ui-pagination' data-justify='center'>
					<button
						type='button'
						className='button '
						onClick={handlePrevPage}
						disabled={currentPage === 1}
					>
						{t('← Prev')}
					</button>
					<span className='ui-meta'>
						{t('Page {currentPage} of {totalPages}', {
							currentPage,
							totalPages,
						})}
					</span>
					<button
						type='button'
						className='button '
						onClick={handleNextPage}
						disabled={currentPage === totalPages}
					>
						{t('Next →')}
					</button>
				</div>
			)}
		</div>
	);
};

export default ProjectList;
