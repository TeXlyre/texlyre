// src/types/documents.ts
import type { ChatMessage } from './chat';

export interface Document {
	id: string;
	content: string;
	name: string;
}

export interface DocumentList {
	documents: Document[];
	currentDocId: string;
	cursors: unknown[];
	chatMessages?: ChatMessage[];
	projectMetadata?: {
		name: string;
		description: string;
		type?: 'latex' | 'typst';
		mainFile?: string;
		latexEngine?: 'pdftex' | 'xetex' | 'luatex';
		typstEngine?: string;
		typstOutputFormat?: 'pdf' | 'svg' | 'canvas';
		latexAutoCompileOnSave?: boolean;
		typstAutoCompileOnSave?: boolean;
	};
}
