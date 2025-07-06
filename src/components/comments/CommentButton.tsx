// src/components/comments/CommentButton.tsx
import type React from "react";

import { useComments } from "../../hooks/useComments";

interface CommentButtonProps {
	position: { x: number; y: number };
	selection: { start: number; end: number };
	onCommentAdded: () => void;
}

const CommentButton: React.FC<CommentButtonProps> = ({
	position,
	selection,
	onCommentAdded,
}) => {
	const { addComment } = useComments();

	const handleClick = () => {
		const content = prompt("Add a comment:");
		if (content) {
			addComment(content);
			onCommentAdded();
		}
	};

	return (
		<div
			className="comment-button"
			style={{
				position: "absolute",
				left: `${position.x}px`,
				top: `${position.y}px`,
			}}
			onClick={handleClick}
		>
			Add Comment
		</div>
	);
};

export default CommentButton;
