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

export type HighlightTheme =
	| 'auto'
	| 'light'
	| 'dark'
	| 'abcdef'
	| 'abyss'
	| 'androidstudio'
	| 'andromeda'
	| 'atomone'
	| 'aura'
	| 'basicLight'
	| 'basicDark'
	| 'bbedit'
	| 'bespin'
	| 'copilot'
	| 'darcula'
	| 'dracula'
	| 'duotoneDark'
	| 'duotoneLight'
	| 'eclipse'
	| 'githubLight'
	| 'githubDark'
	| 'gruvboxDark'
	| 'kimbie'
	| 'materialDark'
	| 'materialLight'
	| 'monokai'
	| 'monokaiDimmed'
	| 'noctisLilac'
	| 'nord'
	| 'okaidia'
	| 'quietlight'
	| 'red'
	| 'solarizedLight'
	| 'solarizedDark'
	| 'sublime'
	| 'tokyoNight'
	| 'tokyoNightStorm'
	| 'tokyoNightDay'
	| 'tomorrowNightBlue'
	| 'vscodeDark'
	| 'vscodeLight'
	| 'whiteLight'
	| 'whiteDark'
	| 'xcodeDark'
	| 'xcodeLight';

export interface EditorSettings {
	fontSize: FontSize;
	fontFamily: FontFamily;
	showLineNumbers: boolean;
	syntaxHighlighting: boolean;
	autoSaveEnabled: boolean;
	autoSaveDelay: number;
	highlightTheme: HighlightTheme;
	vimMode: boolean;
	spellCheck: boolean;
	mathLiveEnabled: boolean;
	mathLivePreviewMode: 'hover-cursor' | 'hover' | 'cursor' | 'never';
	language: string;
}