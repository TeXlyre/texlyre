// src/contexts/CommentContext.tsx
import type React from "react";
import { type ReactNode, createContext, useCallback, useState, useEffect } from "react";

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

	const getCommentById = useCallback((commentId: string) => {
		return comments.find(comment => comment.id === commentId) || null;
	}, [comments]);

	const scrollToComment = useCallback((commentId: string) => {
		console.log('Looking for comment item with data-comment-id:', commentId);
		const commentElement = document.querySelector(`.comment-item[data-comment-id="${commentId}"]`);
		console.log('Found element:', commentElement);

		if (commentElement) {
			console.log('Scrolling to element');
			commentElement.scrollIntoView({
				behavior: "smooth",
				block: "center"
			});

			commentElement.classList.add("highlight-comment");
			setTimeout(() => {
				commentElement.classList.remove("highlight-comment");
			}, 2000);
		} else {
			console.log('Comment item not found - is the comment panel open?');
		}
	}, []);

	useEffect(() => {
		const handleGetCommentById = (event: Event) => {
			const customEvent = event as CustomEvent;
			const { commentId } = customEvent.detail;
			const comment = getCommentById(commentId);

			document.dispatchEvent(
				new CustomEvent("comment-data-response", {
					detail: { commentId, comment },
				})
			);
		};

		const handleScrollToComment = (event: Event) => {
			const customEvent = event as CustomEvent;
			const { commentId } = customEvent.detail;
			console.log('Scrolling to comment:', commentId); // Debug log
			scrollToComment(commentId);
		};

		document.addEventListener("get-comment-by-id", handleGetCommentById);
		document.addEventListener("scroll-to-comment", handleScrollToComment);

		return () => {
			document.removeEventListener("get-comment-by-id", handleGetCommentById);
			document.removeEventListener("scroll-to-comment", handleScrollToComment);
		};
	}, [getCommentById, scrollToComment]);

	const toggleComments = () => {
		setShowComments(!showComments);
	};

	const addComment = (content: string): CommentRaw => {
		if (!user) return { openTag: "", closeTag: "", commentId: "" };

		const rawComment = commentService.addComment(content, user.username);

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

	const resolveComment = (commentId: string) => {
		if (!user) return;

		const comment = comments.find((c) => c.id === commentId);
		if (!comment) return;

		const updatedComment = {
			...comment,
			resolved: !comment.resolved,
		};
		const rawComment = commentService.resolveComment(updatedComment);

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
				resolveComment,
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
