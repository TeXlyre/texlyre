// src/types/typst.ts

export type TypstOutputFormat = 'pdf' | 'svg' | 'canvas' | 'canvas-pdf';

export interface TypstPdfOptions {
    pdfStandard?: string;
    pdfTags?: boolean;
    creationTimestamp?: number;
}

export interface TypstCompileResult {
    status: number;
    log: string;
    format: TypstOutputFormat;
    pdf?: Uint8Array;
    svg?: string;
    canvas?: Uint8Array;
}

export interface TypstContextType {
    isCompiling: boolean;
    compileError: string | null;
    compiledPdf: Uint8Array | null;
    compiledSvg: string | null;
    compiledCanvas: Uint8Array | null;
    compileLog: string;
    currentFormat: TypstOutputFormat;
    setCurrentFormat: (format: TypstOutputFormat) => void;
    compileDocument: (mainFileName: string, format?: TypstOutputFormat, pdfOptions?: TypstPdfOptions) => Promise<void>;
    stopCompilation: () => void;
    toggleOutputView: () => void;
    currentView: 'log' | 'output';
    clearCache: () => void;
    triggerAutoCompile: () => void;
    activeCompiler: string | null;
    exportDocument: (
        mainFileName: string,
        options?: { format?: TypstOutputFormat; includeLog?: boolean; pdfOptions?: TypstPdfOptions }
    ) => Promise<void>;
}