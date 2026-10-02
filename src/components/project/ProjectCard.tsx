// Updated src/components/project/ProjectCard.tsx
import type React from 'react';
import { useRef, useState, useEffect } from 'react';

import { t } from '@/i18n';
import { formatDate, formatLastModified } from '@/utils/dateUtils.ts';
import { pluginRegistry } from '../../plugins/PluginRegistry';
import type { Project } from '../../types/projects.ts';
import ProjectBackupControls from '../backup/ProjectBackupControls';
import {
	EditIcon,
	FolderIcon,
	FolderOpenIcon,
	StarIcon,
	TrashIcon,
	ChevronDownIcon,
	FileTextIcon,
	FileIcon,
} from '../common/Icons.tsx';
import { typesetterRegistryService } from '../../services/TypesetterRegistryService';
import TypesetterInfo from '../common/TypesetterInfo';

interface ProjectCardProps {
	project: Project;
	onOpen: (project: Project) => void;
	onOpenDefault: (project: Project) => void;
	onEdit: (project: Project) => void;
	onDelete: (project: Project) => void;
	onToggleFavorite: (projectId: string) => void;
	isSelectionMode?: boolean;
	isSelected?: boolean;
	onSelectionChange?: (projectId: string, isSelected: boolean) => void;
}

const ProjectCard: React.FC<ProjectCardProps> = ({
	project,
	onOpen,
	onOpenDefault,
	onEdit,
	onDelete,
	onToggleFavorite,
	isSelectionMode = false,
	isSelected = false,
	onSelectionChange,
}) => {
	const [isOpenDropdownOpen, setIsOpenDropdownOpen] = useState(false);
	const openDropdownRef = useRef<HTMLDivElement>(null);

	const handleSelectionChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		e.stopPropagation();
		if (onSelectionChange) {
			onSelectionChange(project.id, e.target.checked);
		}
	};

	const handleCardClick = (e: React.MouseEvent<HTMLDivElement>) => {
		if ((e.target as HTMLElement).closest('button, input, a')) {
			return;
		}

		if (isSelectionMode && onSelectionChange) {
			onSelectionChange(project.id, !isSelected);
		}
	};

	const handleDefaultOpen = (e: React.MouseEvent) => {
		e.stopPropagation();
		onOpenDefault(project);
		setIsOpenDropdownOpen(false);
	};

	const handleProjectOpen = (e: React.MouseEvent) => {
		e.stopPropagation();
		onOpen(project);
		setIsOpenDropdownOpen(false);
	};

	const toggleOpenDropdown = (e: React.MouseEvent) => {
		e.stopPropagation();
		setIsOpenDropdownOpen(!isOpenDropdownOpen);
	};

	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (
				openDropdownRef.current &&
				!openDropdownRef.current.contains(event.target as Node)
			) {
				setIsOpenDropdownOpen(false);
			}
		};

		document.addEventListener('mousedown', handleClickOutside);
		return () => {
			document.removeEventListener('mousedown', handleClickOutside);
		};
	}, []);

	const getViewerIcon = (fileName?: string): React.ComponentType => {
		if (!fileName) return FileIcon;
		return pluginRegistry.getViewerForFile(fileName)?.icon ?? FileIcon;
	};

	const renderOpenIcon = (
		Icon: React.ComponentType,
		isCollaborative = false,
	) => (
		<span className='file-icon'>
			<Icon />
			{isCollaborative && <span className='file-linked-indicator'>•</span>}
		</span>
	);

	const getDropdownDisplayText = () => {
		if (project.lastOpenedFilePath) {
			const fileName =
				project.lastOpenedFilePath.split('/').pop() || t('Unknown file');
			return t('Last: {fileName}', { fileName });
		} else if (project.lastOpenedDocId) {
			return t('Last: Document {docId}', {
				docId: `${project.lastOpenedDocId.slice(0, 8)}...`,
			});
		}
		return t('Open Project');
	};

	const getDropdownContent = () => {
		const displayText = getDropdownDisplayText();
		if (project.lastOpenedFilePath) {
			const fileName = project.lastOpenedFilePath.split('/').pop();
			const FileViewerIcon = getViewerIcon(fileName);
			return (
				<>
					{renderOpenIcon(FileViewerIcon, !!project.lastOpenedDocId)}
					<span>{displayText}</span>
				</>
			);
		} else if (project.lastOpenedDocId) {
			return (
				<>
					{renderOpenIcon(FileTextIcon, true)}
					<span>{displayText}</span>
				</>
			);
		}
		return (
			<>
				<FolderIcon />
				<span>{displayText}</span>
			</>
		);
	};

	return (
		<div
			className='ui-card'
			data-role='project'
			data-padding='md'
			data-hover={isSelectionMode ? undefined : 'lift'}
			data-interactive={isSelectionMode ? 'true' : undefined}
			data-selected={isSelected ? 'true' : undefined}
			onClick={handleCardClick}
		>
			{isSelectionMode && (
				<div className='selection-checkbox'>
					<input
						type='checkbox'
						checked={isSelected}
						onChange={handleSelectionChange}
						onClick={(e) => e.stopPropagation()}
					/>
				</div>
			)}

			{!isSelectionMode && <ProjectBackupControls projectId={project.id} />}

			<div className='ui-toolbar' data-justify='between'>
				<h3
					className='ui-panel-title'
					data-size='body'
					onClick={(e) => {
						if (!isSelectionMode) {
							e.stopPropagation();
							onOpenDefault(project);
						}
					}}
				>
					{project.name}
				</h3>

				<div
					className='ui-toolbar-actions'
					data-role='project-header-actions'
					data-gap='sm'
				>
					<div className='ui-badge' data-variant='label'>
						<TypesetterInfo
							type={project.type}
							provider={typesetterRegistryService.resolve(
								project.type,
								project.compilerId,
							)}
						/>
					</div>
					{project.isDiskLinked && (
						<span
							className='ui-icon'
							data-tone='accent'
							title={t('Mirrored with a folder on your device')}
						>
							<FolderOpenIcon />
						</span>
					)}
					{!isSelectionMode && (
						<button
							type='button'
							className='ui-icon-button'
							data-variant='subtle'
							data-tone={project.isFavorite ? 'warning' : undefined}
							data-size='sm'
							onClick={(e) => {
								e.stopPropagation();
								onToggleFavorite(project.id);
							}}
							title={
								project.isFavorite
									? t('Remove from favorites')
									: t('Add to favorites')
							}
						>
							<StarIcon filled={project.isFavorite} />
						</button>
					)}
				</div>
			</div>

			<p className='project-card-description'>
				{project.description || t('No description provided')}
			</p>

			<div
				className='ui-meta'
				data-role='project-meta'
				data-layout='row'
				data-justify='between'
			>
				<span title={formatDate(project.createdAt)}>
					{t('Created: {createdAt}', {
						createdAt: formatDate(project.createdAt),
					})}
				</span>
				<span title={formatDate(project.updatedAt)}>
					{t('Last Modified: {lastModified}', {
						lastModified: formatLastModified(project.updatedAt),
					})}
				</span>
			</div>

			{!isSelectionMode && (
				<div
					className='ui-toolbar-actions'
					data-role='project-actions'
					data-gap='sm'
				>
					<div
						className='ui-menu-anchor'
						data-role='project-open'
						data-width='content'
						ref={openDropdownRef}
					>
						<div
							className='ui-button-group ui-split-button'
							data-variant='joined'
						>
							<button
								type='button'
								className='button primary ui-split-main'
								onClick={handleDefaultOpen}
								title={getDropdownDisplayText()}
								aria-label={getDropdownDisplayText()}
							>
								<FolderIcon />
								<span className='project-open-label'>{t('Open')}</span>
							</button>
							<button
								type='button'
								className='button primary ui-split-toggle'
								onClick={toggleOpenDropdown}
								title={t('Open Options')}
							>
								<ChevronDownIcon />
							</button>
						</div>
						{isOpenDropdownOpen && (
							<div className='ui-menu' data-position='below'>
								<div className='ui-menu-item' onClick={handleDefaultOpen}>
									{getDropdownContent()}
								</div>
								<div className='ui-menu-item' onClick={handleProjectOpen}>
									<FolderIcon />
									<span>{t('Open Project')}</span>
								</div>
							</div>
						)}
					</div>
					<button
						type='button'
						className='button'
						onClick={(e) => {
							e.stopPropagation();
							onEdit(project);
						}}
						title={t('Edit Project')}
					>
						<EditIcon />
					</button>
					<button
						type='button'
						className='button danger'
						onClick={(e) => {
							e.stopPropagation();
							onDelete(project);
						}}
						title={t('Delete Project')}
					>
						<TrashIcon />
					</button>
				</div>
			)}

			<div className='ui-tags' data-role='project-tags'>
				{project.tags?.map((tag, index) => (
					<span key={index} className='ui-badge' data-variant='tag'>
						{tag}
					</span>
				))}
			</div>
		</div>
	);
};

export default ProjectCard;
