// src/types/lsp.ts
import type { TransportConfig } from '@chelys/types/transport';

export const SEMANTIC_TOKEN_TYPES = [
	'namespace',
	'type',
	'class',
	'enum',
	'interface',
	'struct',
	'typeParameter',
	'parameter',
	'variable',
	'property',
	'enumMember',
	'event',
	'function',
	'method',
	'macro',
	'keyword',
	'modifier',
	'comment',
	'string',
	'number',
	'regexp',
	'operator',
	'decorator',
];

export const SEMANTIC_TOKEN_MODIFIERS = [
	'declaration',
	'definition',
	'readonly',
	'static',
	'deprecated',
	'abstract',
	'async',
	'modification',
	'documentation',
	'defaultLibrary',
];

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

export interface LSPServerConfig {
	transport: 'tcp' | 'websocket' | 'stdio';
	host?: string;
	port?: number;
	command?: string;
	args?: string[];
	url?: string;
	cwd?: string;
	env?: Record<string, string>;
	settings?: Record<string, any>;
}

export interface LSPConfigBlock {
	id: string;
	name: string;
	enabled: boolean;
	icon?: string;
	fileExtensions: string[];
	languageIdMap?: Record<string, string>;
	transportConfig: TransportConfig;
	clientConfig: string;
}
