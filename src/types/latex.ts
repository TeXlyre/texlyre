// src/types/latex.ts
declare global {
	interface Window {
		PdfTeXEngine: any;
		XeTeXEngine: any;
		ENGINE_PATH?: string;
		onPdfTeXEngineReady?: () => void;
	}
}

export interface LaTeXContextType {
	isCompiling: boolean;
	compileError: string | null;
	compiledPdf: Uint8Array | null;
	clearCache: () => Promise<void>;
	compileWithClearCache: (mainFileName: string) => Promise<void>;
	compileLog: string;
	compileDocument: (mainFileName: string) => Promise<void>;
	stopCompilation: () => void;
	toggleOutputView: () => void;
	currentView: 'log' | 'pdf';
	logIndicator: 'idle' | 'warn' | 'error' | 'success';
	latexEngine: 'pdftex' | 'xetex' | 'luatex';
	activeCompiler: string | null;
	setLatexEngine: (engine: 'pdftex' | 'xetex' | 'luatex') => Promise<void>;
	triggerAutoCompile: () => void;
	exportDocument: (
		mainFileName: string,
		options?: {
			engine?: 'pdftex' | 'xetex' | 'luatex';
			format?: 'pdf' | 'dvi';
			includeLog?: boolean;
			includeDvi?: boolean;
			includeBbl?: boolean;
		}
	) => Promise<void>;
}
