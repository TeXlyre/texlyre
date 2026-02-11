// src/types/editor.ts
export type FontFamily =
	| 'monospace'
	| 'serif'
	| 'sans-serif'
	| 'jetbrains-mono'
	| 'fira-code'
	| 'source-code-pro'
	| 'inconsolata';

export type FontSize = 'xs' | 'sm' | 'base' | 'lg' | 'xl' | '2xl' | '3xl';

export interface EditorSettings {
	fontSize: FontSize;
	fontFamily: FontFamily;
	showLineNumbers: boolean;
	syntaxHighlighting: boolean;
	autoSaveEnabled: boolean;
	autoSaveDelay: number;
	highlightTheme: 'auto' | 'light' | 'dark';
	vimMode: boolean;
	spellCheck: boolean;
	mathLiveEnabled: boolean;
	mathLivePreviewMode: 'hover' | 'always' | 'never';
	language: string;
}