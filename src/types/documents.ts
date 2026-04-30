// src/types/documents.ts
import type { ChatMessage } from './chat';
import type { TypstPdfOptions, TypstOutputFormat } from './typst';
import type { LaTeXEngine, LaTeXOutputFormat } from './latex';

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
		latexEngine?: LaTeXEngine;
		typstEngine?: string;
		latexOutputFormat?: LaTeXOutputFormat;
		typstOutputFormat?: TypstOutputFormat;
		latexAutoCompileOnSave?: boolean;
		typstAutoCompileOnSave?: boolean;
		typstPdfOptions?: TypstPdfOptions;
	};
}
