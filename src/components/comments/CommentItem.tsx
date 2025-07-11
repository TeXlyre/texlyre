// src/components/comments/CommentItem.tsx
import type React from "react";
import { useState } from "react";

import { useComments } from "../../hooks/useComments";
import type { Comment } from "../../types/comments";
import { formatDate } from "../../utils/dateUtils";
import { CheckIcon, TrashIcon } from "../common/Icons";

interface CommentItemProps {
	comment: Comment;
	view: "list" | "resolved";
	onLineClick?: (line: number) => void;
}

const CommentItem: React.FC<CommentItemProps> = ({
	comment,
	view,
	onLineClick,
}) => {
	const [newResponse, setNewResponse] = useState("");
	const [isAddingResponse, setIsAddingResponse] = useState(false);
	const { addResponse, deleteComment, deleteResponse, resolveComment } =
		useComments();

	const handleAddResponse = () => {
		if (newResponse.trim()) {
			addResponse(comment.id, newResponse);
			setNewResponse("");
			setIsAddingResponse(false);
		}
	};

	const handleDeleteResponse = (responseId: string) => {
		deleteResponse(comment.id, responseId);
	};

	const handleResolveComment = () => {
		resolveComment(comment.id);
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			handleAddResponse();
		}
	};

	const handleLineClick = (e: React.MouseEvent) => {
		e.stopPropagation();
		if (comment.line) {
			// Check if we're in file mode by looking at the URL
			const currentUrl = window.location.hash;
			const isFileMode = currentUrl.includes("file:");

			const detail: any = { line: comment.line };

			// If we're in file mode, try to add some context
			if (isFileMode) {
				const filePathMatch = currentUrl.match(/file:([^&]+)/);
				if (filePathMatch) {
					detail.filePath = decodeURIComponent(filePathMatch[1]);
				}
			}

			document.dispatchEvent(
				new CustomEvent("codemirror-goto-line", {
					detail,
				}),
			);
		}
	};

	const truncateUsername = (username: string, maxLength = 15) => {
		return username.length > maxLength
			? `${username.substring(0, maxLength)}...`
			: username;
	};

	return (
		<div
			className={`comment-item ${comment.resolved ? "resolved" : ""}`}
			data-comment-id={comment.id}
		>
			<div className="comment-header">
				<div className="comment-author-container">
					<div className="comment-author" title={comment.user}>
						{truncateUsername(comment.user)}
					</div>
					<div className="comment-time">{formatDate(comment.timestamp)}</div>
				</div>
				<div className="comment-header-actions">
					<button
						className="resolve-button"
						onClick={handleResolveComment}
						title={comment.resolved ? "Mark as unresolved" : "Mark as resolved"}
					>
						<CheckIcon />
					</button>
					<button
						className="delete-button"
						onClick={() => deleteComment(comment.id)}
						title="Delete comment"
					>
						<TrashIcon />
					</button>
				</div>
			</div>

			{comment.line && (
				<div className="comment-line-section">
					<button
						className="comment-line-button"
						onClick={handleLineClick}
						title={`Go to line ${comment.line}`}
					>
						Line {comment.line}
					</button>
				</div>
			)}

			<div className="comment-content">{comment.content}</div>

			{comment.responses.length > 0 && (
				<div className="comment-responses">
					{comment.responses.map((response) => (
						<div key={response.id} className="response-item">
							<div className="response-header">
								<div className="response-author-container">
									<div className="response-author" title={response.user}>
										{truncateUsername(response.user)}
									</div>
									<div className="response-time">
										{formatDate(response.timestamp)}
									</div>
								</div>
								<button
									className="delete-button small"
									onClick={() => handleDeleteResponse(response.id)}
									title="Delete response"
								>
									<TrashIcon />
								</button>
							</div>
							<div className="response-content">{response.content}</div>
						</div>
					))}
				</div>
			)}

			{!comment.resolved &&
				(isAddingResponse ? (
					<div className="add-response-form">
						<textarea
							value={newResponse}
							onChange={(e) => setNewResponse(e.target.value)}
							onKeyDown={handleKeyDown}
							placeholder="Type your response..."
							rows={2}
						/>
						<div className="form-actions">
							<button
								className="cancel-button"
								onClick={() => {
									setIsAddingResponse(false);
									setNewResponse("");
								}}
							>
								Cancel
							</button>
							<button
								className="submit-button"
								onClick={handleAddResponse}
								disabled={!newResponse.trim()}
							>
								Submit
							</button>
						</div>
					</div>
				) : (
					<button
						className="add-response-button"
						onClick={() => setIsAddingResponse(true)}
					>
						Add response
					</button>
				))}
		</div>
	);
};

export default CommentItem;
