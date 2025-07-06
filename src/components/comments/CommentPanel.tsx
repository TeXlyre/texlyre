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
	const [activeTab, setActiveTab] = useState<"list" | "inline">("list");
	const [searchQuery, setSearchQuery] = useState("");
	const [filteredComments, setFilteredComments] = useState(comments);

	useEffect(() => {
		if (searchQuery.trim() === "") {
			setFilteredComments(comments);
		} else {
			const query = searchQuery.toLowerCase();
			setFilteredComments(
				comments.filter(
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
	}, [searchQuery, comments]);

	if (!showComments) {
		return null;
	}

	return (
		<div
			className={`comment-panel ${className} ${activeTab === "inline" ? "inline-mode" : ""}`}
		>
			<div className="comment-panel-header">
				<h3>Comments</h3>
				<div className="view-tabs">
					<button
						className={`tab-button ${activeTab === "list" ? "active" : ""}`}
						onClick={() => setActiveTab("list")}
					>
						List
					</button>
					<button
						className={`tab-button ${activeTab === "inline" ? "active" : ""}`}
						onClick={() => setActiveTab("inline")}
					>
						Inline
					</button>
				</div>
				<button className="close-button" onClick={toggleComments}>
					×
				</button>
			</div>

			{activeTab === "list" && (
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
			)}

			<div className="comment-panel-content">
				{filteredComments.length === 0 ? (
					<div className="no-comments">
						{searchQuery
							? "No comments found matching the search criteria"
							: "No comments yet."}
					</div>
				) : (
					<div className={`comments-${activeTab}`}>
						{filteredComments.map((comment) => (
							<CommentItem
								key={comment.id}
								comment={comment}
								view={activeTab}
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
