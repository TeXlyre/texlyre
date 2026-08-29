// src/types/editor.ts
export type FontFamily =
	| 'monospace'
	| 'serif'
	| 'sans-serif'
	| 'fira-code'
	| 'dejavu-mono'
	| 'libertinus-mono'
	| 'new-computer-modern'
	| 'ibm-plex-serif'
	| 'ibm-plex-sans'
	| 'literata';

export type FontSize = number;

export type EditorKeymapMode = 'vim' | 'helix' | 'emacs' | null;

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
	languageTooltips: boolean;
	languageDiagnostics: boolean;
	languageSymbolHighlights: boolean;
	autoSaveEnabled: boolean;
	autoSaveDelay: number;
	highlightTheme: HighlightTheme;
	keymapMode: EditorKeymapMode;
	spellCheck: boolean;
	mathLiveEnabled: boolean;
	mathLivePreviewMode: 'hover-cursor' | 'hover' | 'cursor' | 'never';
	language: string;
	textDirection: 'auto' | 'ltr' | 'rtl';
}
