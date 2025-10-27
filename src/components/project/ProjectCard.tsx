// Updated src/components/project/ProjectCard.tsx
import { t } from "@/i18n";
import type React from 'react';
import { useRef, useState, useEffect } from 'react';

import type { Project } from '../../types/projects.ts';
import ProjectBackupControls from '../backup/ProjectBackupControls';
import { EditIcon, FolderIcon, StarIcon, TrashIcon, ChevronDownIcon, FileTextIcon, FileIcon } from '../common/Icons.tsx';
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
  onSelectionChange
}) => {
  const [isOpenDropdownOpen, setIsOpenDropdownOpen] = useState(false);
  const openDropdownRef = useRef<HTMLDivElement>(null);

  const formatDate = (timestamp: number): string => {
    return new Date(timestamp).toLocaleDateString();
  };

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
      !openDropdownRef.current.contains(event.target as Node))
      {
        setIsOpenDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const getDropdownDisplayText = () => {
    if (project.lastOpenedFilePath) {
      const fileName = project.lastOpenedFilePath.split('/').pop() || 'Unknown file';
      return `Last: ${fileName}`;
    } else if (project.lastOpenedDocId) {
      return `Last: Document ${project.lastOpenedDocId.slice(0, 8)}...`;
    }
    return 'Open Project';
  };

  const getDropdownContent = () => {
    const displayText = getDropdownDisplayText();
    if (project.lastOpenedFilePath) {
      return (
        <>
					<FileIcon />
					<span>{displayText}</span>
				</>);

    } else if (project.lastOpenedDocId) {
      return (
        <>
					<FileTextIcon />
					<span>{displayText}</span>
				</>);

    }
    return (
      <>
				<FolderIcon />
				<span>{displayText}</span>
			</>);

  };

  return (
    <div
      className={`project-card ${isSelectionMode ? 'selection-mode' : ''} ${isSelected ? 'selected' : ''}`}
      onClick={handleCardClick}>

			{isSelectionMode &&
      <div className="selection-checkbox">
					<input
          type="checkbox"
          checked={isSelected}
          onChange={handleSelectionChange}
          onClick={(e) => e.stopPropagation()} />

				</div>
      }

			{!isSelectionMode && <ProjectBackupControls projectId={project.id} />}

			<div className="project-card-header">
				<h3
          className={`project-title ${isSelectionMode ? 'selection-mode' : ''}`}
          onClick={(e) => {
            if (!isSelectionMode) {
              e.stopPropagation();
              onOpenDefault(project);
            }
          }}>

					{project.name}
				</h3>

				<div className="project-card-header-actions">
					<div className="project-type-info">
						<TypesetterInfo type={project.type} />
					</div>
					{!isSelectionMode &&
          <button
            className={`favorite-button ${project.isFavorite ? 'favorited' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite(project.id);
            }}
            title={
            project.isFavorite ? 'Remove from favorites' : 'Add to favorites'
            }>

							<StarIcon filled={project.isFavorite} />
						</button>
          }
				</div>
			</div>

			<p className="project-description">
				{project.description || 'No description provided'}
			</p>

			<div className="project-meta">
				<span>{t('Created:')}{formatDate(project.createdAt)}</span>
				<span>{t('Last Modified:')}{formatDate(project.updatedAt)}</span>
			</div>

			{!isSelectionMode &&
      <div className="project-actions">
					<div className="project-open-buttons" ref={openDropdownRef}>
						<div className="open-button-group">
							<button
              className="action-button primary open-button"
              onClick={handleDefaultOpen}
              title={getDropdownDisplayText()}>

								<FolderIcon />{t('Open')}

            </button>
							<button
              className="action-button primary dropdown-toggle"
              onClick={toggleOpenDropdown}
              title={t('Open Options')}>

								<ChevronDownIcon />
							</button>
						</div>
						{isOpenDropdownOpen &&
          <div className="open-dropdown">
								<div className="open-dropdown-item" onClick={handleDefaultOpen}>
									{getDropdownContent()}
								</div>
								<div className="open-dropdown-item" onClick={handleProjectOpen}>
									<FolderIcon />
									<span>{t('Open Project')}</span>
								</div>
							</div>
          }
					</div>
					<button
          className="action-button"
          onClick={(e) => {
            e.stopPropagation();
            onEdit(project);
          }}
          title={t('Edit Project')}>

						<EditIcon />
					</button>
					<button
          className="action-button danger"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(project);
          }}
          title={t('Delete Project')}>

						<TrashIcon />
					</button>
				</div>
      }

			<div className="project-tags">
				{project.tags.map((tag, index) =>
        <span key={index} className="project-tag">
						{tag}
					</span>
        )}
			</div>
		</div>);

};

export default ProjectCard;