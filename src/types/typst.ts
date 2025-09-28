// src/types/typst.ts
export type TypstOutputFormat = "pdf" | "svg";

export interface TypstCompileResult {
    pdf?: Uint8Array;
    svg?: string;
    status: number;
    log: string;
    format: TypstOutputFormat;
}
export interface TypstContextType {
    isCompiling: boolean;
    compileError: string | null;
    compiledPdf: Uint8Array | null;
    compiledSvg: string | null;
    compileLog: string;
    currentFormat: TypstOutputFormat;
    setCurrentFormat: (format: TypstOutputFormat) => void;
    compileDocument: (mainFileName: string, format?: TypstOutputFormat) => Promise<void>;
    stopCompilation: () => void;
    toggleOutputView: () => void;
    currentView: "log" | "output";
    clearCache: () => void;
    triggerAutoCompile: () => void;
    activeCompiler: string | null;
}