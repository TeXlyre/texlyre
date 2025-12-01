// src/types/compilation.ts
export interface CompilationOptions {
    renderOutput?: boolean;
    saveToStorage?: boolean;
    returnOutput?: boolean;
}

export interface ExportOptions {
    format?: 'pdf' | 'dvi' | 'svg' | 'canvas';
    includeLog?: boolean;
    includeAuxiliaryFiles?: boolean;
}