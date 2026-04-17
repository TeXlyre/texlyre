// src/types/sourceMap.ts
export interface SourceMapForwardResult {
    page: number;
    x: number;
    y: number;
    width?: number;
    height?: number;
}

export interface SourceMapReverseResult {
    file: string;
    line: number;
    column?: number;
}

export interface SourceMapHighlight {
    page: number;
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface SourceMapData {
    forward(file: string, line: number, column?: number): SourceMapForwardResult | null;
    reverse(page: number, x: number, y: number): SourceMapReverseResult | null;
}

export interface SourceMapService {
    isAvailable(): boolean;
    forward(file: string, line: number, column?: number): SourceMapForwardResult | null;
    reverse(page: number, x: number, y: number): SourceMapReverseResult | null;
    clear(): void;
}

export interface SourceMapContextType {
    isAvailable: boolean;
    currentHighlight: SourceMapHighlight | null;
    forwardSync: (file: string, line: number, column?: number) => void;
    reverseSync: (page: number, x: number, y: number) => void;
    clearHighlight: () => void;
}