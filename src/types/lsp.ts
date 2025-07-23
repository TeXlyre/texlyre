// src/plugins/lsp.ts
export interface LSPPosition {
	line: number;
	character: number;
}

export interface LSPRange {
	start: LSPPosition;
	end: LSPPosition;
}

export interface LSPTextDocument {
	uri: string;
	languageId?: string;
	version?: number;
	text?: string;
}

export interface LSPCompletionItem {
	label: string;
	kind?: number;
	detail?: string;
	documentation?: string;
	sortText?: string;
	filterText?: string;
	insertText?: string;
	insertTextFormat?: number;
	textEdit?: {
		range: LSPRange;
		newText: string;
	};
	additionalTextEdits?: Array<{
		range: LSPRange;
		newText: string;
	}>;
}

export interface LSPCompletionList {
	isIncomplete: boolean;
	items: LSPCompletionItem[];
}

export interface LSPRequest {
	id?: string | number;
	method: string;
	params?: any;
}

export interface LSPResponse {
	id?: string | number;
	result?: any;
	error?: {
		code: number;
		message: string;
		data?: any;
	};
}

export interface LSPNotification {
	method: string;
	params?: any;
}