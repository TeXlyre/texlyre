// src/components/project/ProjectCard.tsx
import type React from "react";

import type { Project } from "../../types/projects.ts";
import ProjectBackupControls from "../backup/ProjectBackupControls";
import { EditIcon, FolderIcon, StarIcon, TrashIcon } from "../common/Icons.tsx";

interface ProjectCardProps {
	project: Project;
	onOpen: (project: Project) => void;
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
	onEdit,
	onDelete,
	onToggleFavorite,
	isSelectionMode = false,
	isSelected = false,
	onSelectionChange,
}) => {
	const formatDate = (timestamp: number): string => {
		return new Date(timestamp).toLocaleDateString();
	};

	const handleSelectionChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		e.stopPropagation();
		if (onSelectionChange) {
			onSelectionChange(project.id, e.target.checked);
		}
	};

	const handleCardClick = () => {
		if (isSelectionMode && onSelectionChange) {
			onSelectionChange(project.id, !isSelected);
		} else {
			onOpen(project);
		}
	};

	return (
		<div
			className={`project-card ${isSelectionMode ? "selection-mode" : ""} ${isSelected ? "selected" : ""}`}
			onClick={handleCardClick}
			style={{
				cursor: isSelectionMode ? "pointer" : "default",
				border: isSelected
					? "2px solid var(--accent-color, #007bff)"
					: undefined,
				backgroundColor: isSelected
					? "rgba(var(--accent-color-rgb, 0, 123, 255), 0.1)"
					: undefined,
			}}
		>
			{isSelectionMode && (
				<div
					className="selection-checkbox"
					style={{
						position: "absolute",
						top: "0.5rem",
						left: "0.5rem",
						zIndex: 1,
					}}
				>
					<input
						type="checkbox"
						checked={isSelected}
						onChange={handleSelectionChange}
						onClick={(e) => e.stopPropagation()}
					/>
				</div>
			)}

			{!isSelectionMode && <ProjectBackupControls projectId={project.id} />}

			<div className="project-card-header">
				<h3
					className="project-title"
					onClick={(e) => {
						if (!isSelectionMode) {
							e.stopPropagation();
							onOpen(project);
						}
					}}
					style={{ marginLeft: isSelectionMode ? "2rem" : "0" }}
				>
					{project.name}
				</h3>

				{!isSelectionMode && (
					<button
						className={`favorite-button ${project.isFavorite ? "favorited" : ""}`}
						onClick={(e) => {
							e.stopPropagation();
							onToggleFavorite(project.id);
						}}
						title={
							project.isFavorite ? "Remove from favorites" : "Add to favorites"
						}
					>
						<StarIcon filled={project.isFavorite} />
					</button>
				)}
			</div>

			<p className="project-description">
				{project.description || "No description provided"}
			</p>

			<div className="project-meta">
				<span>Created: {formatDate(project.createdAt)}</span>
				<span>Updated: {formatDate(project.updatedAt)}</span>
			</div>

			{!isSelectionMode && (
				<div className="project-actions">
					<button
						className="action-button primary"
						onClick={(e) => {
							e.stopPropagation();
							onOpen(project);
						}}
						title="Open Project"
					>
						<FolderIcon />
						Open
					</button>
					<button
						className="action-button"
						onClick={(e) => {
							e.stopPropagation();
							onEdit(project);
						}}
						title="Edit Project"
					>
						<EditIcon />
						Edit
					</button>
					<button
						className="action-button danger"
						onClick={(e) => {
							e.stopPropagation();
							onDelete(project);
						}}
						title="Delete Project"
					>
						<TrashIcon />
						Delete
					</button>
				</div>
			)}

			<div className="project-tags">
				{project.tags.map((tag, index) => (
					<span key={index} className="project-tag">
						{tag}
					</span>
				))}
			</div>
		</div>
	);
};

export default ProjectCard;
