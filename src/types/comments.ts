// Updated src/types/comments.ts
export interface CommentResponse {
	id: string;
	user: string;
	timestamp: number;
	content: string;
}

export interface Comment {
	id: string;
	user: string;
	timestamp: number;
	content: string;
	responses: CommentResponse[];
	startPosition: number;
	endPosition: number;
	openTagStart?: number;
	openTagEnd?: number;
	closeTagStart?: number;
	closeTagEnd?: number;
	commentedText?: string;
	line?: number;
	resolved: boolean;
}

export interface CommentRaw {
	openTag: string;
	closeTag: string;
	commentId: string;
}

export interface CommentContextType {
	comments: Comment[];
	updateComments: (editorContent: string) => void;
	addComment: (content: string) => CommentRaw;
	addResponse: (commentId: string, content: string) => void;
	deleteComment: (commentId: string) => void;
	deleteResponse: (commentId: string, responseId: string) => void;
	resolveComment: (commentId: string) => void;
	showComments: boolean;
	toggleComments: () => void;
	parseComments: (editorContent: string) => Comment[];
	getCommentAtPosition: (position: number) => Comment | null;
}
