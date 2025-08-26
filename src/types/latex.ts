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
	currentView: "log" | "pdf";
	latexEngine: "pdftex" | "xetex" | "luatex";
	setLatexEngine: (engine: "pdftex" | "xetex" | "luatex") => Promise<void>;
	triggerAutoCompile: () => void;
}
