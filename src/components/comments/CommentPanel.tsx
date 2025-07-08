// src/components/comments/CommentPanel.tsx
import type React from "react";
import { useEffect, useState } from "react";

import { useComments } from "../../hooks/useComments";
import CommentItem from "./CommentItem";

interface CommentPanelProps {
	className?: string;
	onLineClick?: (line: number) => void;
}

const CommentPanel: React.FC<CommentPanelProps> = ({
	className = "",
	onLineClick,
}) => {
	const { comments, showComments, toggleComments } = useComments();
	const [activeTab, setActiveTab] = useState<"list" | "resolved">("list");
	const [searchQuery, setSearchQuery] = useState("");
	const [filteredComments, setFilteredComments] = useState(comments);

	useEffect(() => {
		const commentsToFilter = activeTab === "resolved"
			? comments.filter(comment => comment.resolved)
			: comments.filter(comment => !comment.resolved);

		if (searchQuery.trim() === "") {
			setFilteredComments(commentsToFilter);
		} else {
			const query = searchQuery.toLowerCase();
			setFilteredComments(
				commentsToFilter.filter(
					(comment) =>
						comment.content.toLowerCase().includes(query) ||
						comment.user.toLowerCase().includes(query) ||
						comment.responses.some(
							(response) =>
								response.content.toLowerCase().includes(query) ||
								response.user.toLowerCase().includes(query),
						),
				),
			);
		}
	}, [searchQuery, comments, activeTab]);

	if (!showComments) {
		return null;
	}

	return (
		<div
			className={`comment-panel ${className}`}
		>
			<div className="comment-panel-header">
				<h3>Comments</h3>
				<div className="view-tabs">
					<button
						className={`tab-button ${activeTab === "list" ? "active" : ""}`}
						onClick={() => setActiveTab("list")}
					>
						Active
					</button>
					<button
						className={`tab-button ${activeTab === "resolved" ? "active" : ""}`}
						onClick={() => setActiveTab("resolved")}
					>
						Resolved
					</button>
				</div>
				<button className="close-button" onClick={toggleComments}>
					×
				</button>
			</div>

			<div className="comment-search">
				<input
					type="text"
					placeholder="Search comments..."
					value={searchQuery}
					onChange={(e) => setSearchQuery(e.target.value)}
				/>
				{searchQuery && (
					<button
						className="clear-search-button"
						onClick={() => setSearchQuery("")}
					>
						×
					</button>
				)}
			</div>

			<div className="comment-panel-content">
				{filteredComments.length === 0 ? (
					<div className="no-comments">
						{searchQuery
							? "No comments found matching the search criteria"
							: activeTab === "resolved"
								? "No resolved comments yet."
								: "No active comments."}
					</div>
				) : (
					<div className={`comments-${activeTab}`}>
						{filteredComments.map((comment) => (
							<CommentItem
								key={comment.id}
								comment={comment}
								view="list"
								onLineClick={onLineClick}
							/>
						))}
					</div>
				)}
			</div>
		</div>
	);
};

export default CommentPanel;