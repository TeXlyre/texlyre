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
	trackChanges: boolean;
}

export const defaultEditorSettings: EditorSettings = {
	fontSize: 'base',
	fontFamily: 'monospace',
	showLineNumbers: true,
	syntaxHighlighting: true,
	autoSaveEnabled: false,
	autoSaveDelay: 2000,
	highlightTheme: 'auto',
	vimMode: false,
	spellCheck: true,
	trackChanges: true,
};

export const fontSizeMap: Record<FontSize, string> = {
	xs: '10px',
	sm: '12px',
	base: '14px',
	lg: '16px',
	xl: '18px',
	'2xl': '20px',
	'3xl': '24px',
};

export const fontFamilyMap: Record<FontFamily, string> = {
	monospace:
		"ui-monospace, 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', 'Noto Sans Mono', 'Droid Sans Mono', 'Consolas', monospace",
	serif: "ui-serif, 'Times New Roman', 'Times', serif",
	'sans-serif':
		"ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif",
	// These will fallback to system monospace fonts when offline
	'jetbrains-mono':
		"'JetBrains Mono', ui-monospace, 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace",
	'fira-code':
		"'Fira Code', ui-monospace, 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace",
	'source-code-pro':
		"'Source Code Pro', ui-monospace, 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace",
	inconsolata:
		"'Inconsolata', ui-monospace, 'SF Mono', 'Monaco', 'Roboto Mono', monospace",
};
