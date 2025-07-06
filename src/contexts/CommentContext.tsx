// src/contexts/CommentContext.tsx
import type React from "react";
import { type ReactNode, createContext, useCallback, useState } from "react";

import { useAuth } from "../hooks/useAuth";
import { commentService } from "../services/CommentService";
import type {
	Comment,
	CommentContextType,
	CommentRaw,
} from "../types/comments";

export const CommentContext = createContext<CommentContextType | null>(null);

interface CommentProviderProps {
	children: ReactNode;
	editorContent: string;
	onUpdateContent: (content: string) => void;
}

export const CommentProvider: React.FC<CommentProviderProps> = ({
	children,
	editorContent,
	onUpdateContent,
}) => {
	const [comments, setComments] = useState<Comment[]>([]);
	const [showComments, setShowComments] = useState<boolean>(false);
	const { user } = useAuth();

	const toggleComments = () => {
		setShowComments(!showComments);
	};

	const addComment = (content: string): CommentRaw => {
		if (!user) return { openTag: "", closeTag: "", commentId: "" };

		const rawComment = commentService.addComment(content, user.username);

		// Show comments panel when adding a new comment
		setShowComments(true);
		return rawComment;
	};

	const addResponse = (commentId: string, content: string): void => {
		if (!user) return;

		const comment = comments.find((c) => c.id === commentId);
		if (!comment) return;

		const responses = comment?.responses || [];
		const updatedResponses = commentService.addResponse(
			responses,
			content,
			user.username,
		);

		const updatedComment = {
			...comment,
			responses: updatedResponses,
		};
		const rawComment = commentService.updateCommentResponses(updatedComment);
		const event = new CustomEvent("comment-response-added", {
			detail: {
				commentId,
				updatedComment,
				rawComment,
			},
		});
		document.dispatchEvent(event);
	};

	const deleteComment = (commentId: string) => {
		const comment = comments.find((c) => c.id === commentId);
		if (!comment) return;

		if (
			comment.openTagStart !== undefined &&
			comment.openTagEnd !== undefined &&
			comment.closeTagStart !== undefined &&
			comment.closeTagEnd !== undefined
		) {
			const event = new CustomEvent("comment-delete", {
				detail: {
					commentId,
					openTagStart: comment.openTagStart,
					openTagEnd: comment.openTagEnd,
					closeTagStart: comment.closeTagStart,
					closeTagEnd: comment.closeTagEnd,
				},
			});
			document.dispatchEvent(event);
		}
	};

	const deleteResponse = (commentId: string, responseId: string) => {
		if (!user) return;

		const comment = comments.find((c) => c.id === commentId);
		if (!comment) return;

		const updatedResponses = commentService.deleteResponse(
			comment.responses,
			responseId,
		);
		const updatedComment = {
			...comment,
			responses: updatedResponses,
		};
		const rawComment = commentService.updateCommentResponses(updatedComment);

		if (
			comment.openTagStart !== undefined &&
			comment.openTagEnd !== undefined &&
			comment.closeTagStart !== undefined &&
			comment.closeTagEnd !== undefined
		) {
			const event = new CustomEvent("comment-update", {
				detail: {
					commentId,
					openTagStart: comment.openTagStart,
					openTagEnd: comment.openTagEnd,
					closeTagStart: comment.closeTagStart,
					closeTagEnd: comment.closeTagEnd,
					rawComment: rawComment,
				},
			});
			document.dispatchEvent(event);
		}
	};

	const getCommentAtPosition = (position: number) => {
		for (const comment of comments) {
			if (
				position >= comment.startPosition &&
				position <= comment.endPosition
			) {
				return comment;
			}
		}
		return null;
	};

	const parseComments = commentService.parseComments;

	const updateComments = useCallback((editorContent: string) => {
		const parsedComments = commentService.parseComments(editorContent);
		setComments(parsedComments);
	}, []);

	return (
		<CommentContext.Provider
			value={{
				comments,
				updateComments,
				addComment,
				addResponse,
				deleteComment,
				deleteResponse,
				showComments,
				toggleComments,
				parseComments,
				getCommentAtPosition,
			}}
		>
			{children}
		</CommentContext.Provider>
	);
};
