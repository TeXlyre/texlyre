// src/components/projects/ProjectToolbar.tsx
import type React from "react";
import { useState } from "react";

import type { Project } from "../../types/projects";
import { ImportIcon, PlusIcon, StarIcon } from "../common/Icons";

interface ProjectToolbarProps {
	onCreateProject: () => void;
	onImportProject: () => void;
	onSearch: (query: string) => void;
	onFilterByTag: (tag: string) => void;
	onOpenProject?: (project: Project) => void;
	projects: Project[];
	availableTags: string[];
}

const ProjectToolbar: React.FC<ProjectToolbarProps> = ({
	onCreateProject,
	onImportProject,
	onSearch,
	onFilterByTag,
	onOpenProject,
	projects,
	availableTags,
}) => {
	const [searchQuery, setSearchQuery] = useState("");
	const [selectedTag, setSelectedTag] = useState<string>("");

	const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const query = e.target.value;
		setSearchQuery(query);
		onSearch(query);
	};

	const handleClearSearch = () => {
		setSearchQuery("");
		onSearch("");
	};

	const handleTagChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
		const tag = e.target.value;
		setSelectedTag(tag);
		onFilterByTag(tag);
	};

	const favoriteProjects = projects.filter((p) => p.isFavorite).slice(0, 5);
	const recentProjects = [...projects]
		.sort((a, b) => b.updatedAt - a.updatedAt)
		.slice(0, 5);

	const handleProjectClick = (project: Project) => {
		if (onOpenProject) {
			onOpenProject(project);
		}
	};

	const formatLastModified = (timestamp: number) => {
		const date = new Date(timestamp);
		const now = new Date();
		const diffMs = now.getTime() - date.getTime();
		const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

		if (diffDays === 0) return "Today";
		if (diffDays === 1) return "Yesterday";
		if (diffDays < 7) return `${diffDays} days ago`;
		return date.toLocaleDateString();
	};

	return (
		<div className="file-explorer">
			<div className="file-explorer-header">
				<h3>Projects</h3>
				<div className="file-explorer-actions">
					<button
						className="action-btn"
						title="New Project"
						onClick={onCreateProject}
					>
						<PlusIcon />
					</button>
					<button
						className="action-btn"
						title="Import Projects"
						onClick={onImportProject}
					>
						<ImportIcon />
					</button>
				</div>
			</div>

			<div className="project-search-container">
				<input
					type="text"
					placeholder="Search projects..."
					value={searchQuery}
					onChange={handleSearchChange}
					className="search-input"
				/>
				{searchQuery && (
					<button className="clear-search-button" onClick={handleClearSearch}>
						×
					</button>
				)}

				<select
					value={selectedTag}
					onChange={handleTagChange}
					className="tag-filter"
				>
					<option value="">All tags</option>
					{availableTags.map((tag, index) => (
						<option key={index} value={tag}>
							{tag}
						</option>
					))}
				</select>

				{favoriteProjects.length > 0 && (
					<div className="project-quick-list">
						<h4>Favorites</h4>
						<div className="quick-list-container">
							{favoriteProjects.map((project) => (
								<div
									key={project.id}
									className="quick-project-item"
									onClick={() => handleProjectClick(project)}
									title={project.description}
								>
									<StarIcon /> {project.name}
								</div>
							))}
						</div>
					</div>
				)}

				<div className="project-quick-list">
					<h4>Recent</h4>
					<div className="quick-list-container">
						{recentProjects.map((project) => (
							<div
								key={project.id}
								className="quick-project-item quick-project-item-recent"
								onClick={() => handleProjectClick(project)}
								title={project.description}
							>
								<span className="quick-project-name">{project.name}</span>
								<span className="quick-project-time">
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

export default ProjectToolbar;
