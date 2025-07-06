// src/types/cursor.ts
export interface CursorPosition {
	userId: string;
	username?: string;
	documentId: number;
	position: number;
	isAtEnd?: boolean;
	timestamp?: number;
	cursorString?: string;
}

export interface CursorContextType {
	updateCursor: (documentId: number, position: number) => void;
	syncCursorPosition: (documentId: number) => number | undefined;
	getCursors: (documentId: number) => CursorPosition[];
}
