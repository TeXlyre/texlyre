// src/components/comments/CommentToggleButton.tsx
import type React from "react";

import { useComments } from "../../hooks/useComments";

interface CommentToggleButtonProps {
	className?: string;
}

const CommentToggleButton: React.FC<CommentToggleButtonProps> = ({
	className = "",
}) => {
	const { toggleComments, showComments, comments } = useComments();

	// We want the button to always be visible, even when showComments is true
	return (
		<button
			className={`comment-toggle-button ${className} ${showComments ? "active" : ""}`}
			onClick={toggleComments}
			title={showComments ? "Hide comments" : "Show comments"}
		>
			Show Comments {comments.length > 0 ? `(${comments.length})` : ""}
		</button>
	);
};

export default CommentToggleButton;
