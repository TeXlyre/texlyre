// src/contexts/CommentContext.tsx
import type React from 'react';
import {
	type ReactNode,
	createContext,
	useCallback,
	useEffect,
	useRef,
	useState,
} from 'react';

import { useAuth } from '../hooks/useAuth';
import { useProperties } from '../hooks/useProperties';
import { commentService } from '../services/CommentService';
import { fileStorageService } from '../services/FileStorageService';
import type {
	Comment,
	CommentContextType,
	CommentRaw,
} from '../types/comments';
import { createNamedLogger } from '@/logging';

const moduleLog = createNamedLogger('CommentContext');

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
	const [propertiesLoaded, setPropertiesLoaded] = useState(false);
	const { user } = useAuth();
	const {
		isReady: arePropertiesReady,
		getProperty,
		setProperty,
		registerProperty,
	} = useProperties();
	const propertiesRegistered = useRef(false);

	useEffect(() => {
		if (propertiesRegistered.current) return;
		propertiesRegistered.current = true;

		registerProperty({
			id: 'comment-panel-visible',
			category: 'UI',
			subcategory: 'Editor',
			defaultValue: false,
		});
	}, [registerProperty]);

	useEffect(() => {
		if (!arePropertiesReady || propertiesLoaded) return;

		const projectId = fileStorageService.getCurrentProjectId();
		if (projectId) {
			setShowComments(
				getProperty('comment-panel-visible', {
					scope: 'project',
					projectId,
				}) === true,
			);
		}

		setPropertiesLoaded(true);
	}, [arePropertiesReady, propertiesLoaded, getProperty]);

	useEffect(() => {
		if (!propertiesLoaded) return;

		const projectId = fileStorageService.getCurrentProjectId();
		if (!projectId) return;

		setProperty('comment-panel-visible', showComments, {
			scope: 'project',
			projectId,
		});
	}, [showComments, propertiesLoaded, setProperty]);

	const getCommentById = useCallback(
		(commentId: string) => {
			return comments.find((comment) => comment.id === commentId) || null;
		},
		[comments],
	);

	const scrollToComment = useCallback((commentId: string) => {
		const commentElement = document.querySelector(
			`.comment-item[data-comment-id="${commentId}"]`,
		);

		if (commentElement) {
			commentElement.scrollIntoView({
				behavior: 'smooth',
				block: 'center',
			});

			commentElement.classList.add('highlight-comment');
			setTimeout(() => {
				commentElement.classList.remove('highlight-comment');
			}, 2000);
		} else {
			moduleLog.info('Comment item not found - is the comment panel open?');
		}
	}, []);

	useEffect(() => {
		const handleGetCommentById = (event: Event) => {
			const customEvent = event as CustomEvent;
			const { commentId } = customEvent.detail;
			const comment = getCommentById(commentId);

			document.dispatchEvent(
				new CustomEvent('comment-data-response', {
					detail: { commentId, comment },
				}),
			);
		};

		const handleScrollToComment = (event: Event) => {
			const customEvent = event as CustomEvent;
			const { commentId } = customEvent.detail;
			scrollToComment(commentId);
		};

		document.addEventListener('get-comment-by-id', handleGetCommentById);
		document.addEventListener('scroll-to-comment', handleScrollToComment);

		return () => {
			document.removeEventListener('get-comment-by-id', handleGetCommentById);
			document.removeEventListener('scroll-to-comment', handleScrollToComment);
		};
	}, [getCommentById, scrollToComment]);

	const toggleComments = () => {
		setShowComments(!showComments);
	};

	const addComment = (content: string): CommentRaw => {
		if (!user) return { openTag: '', closeTag: '', commentId: '' };

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
		const event = new CustomEvent('comment-response-added', {
			detail: {
				commentId,
				updatedComment,
				rawComment,
			},
		});
		document.dispatchEvent(event);
	};

	const deleteComment = (commentId: string) => {
		if (!comments.some((c) => c.id === commentId)) return;

		document.dispatchEvent(
			new CustomEvent('comment-delete', { detail: { commentId } }),
		);
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

		document.dispatchEvent(
			new CustomEvent('comment-update', {
				detail: { commentId, rawComment },
			}),
		);
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

		document.dispatchEvent(
			new CustomEvent('comment-update', {
				detail: { commentId, rawComment },
			}),
		);
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
