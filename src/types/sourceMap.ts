// src/types/sourceMap.ts
export type SourceMapClickMode = 'single' | 'double' | 'triple';

export interface SourceMapRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface SourceMapForwardResult {
    page: number;
    rects: SourceMapRect[];
}

export interface SourceMapReverseResult {
    file: string;
    line: number;
    column?: number;
}

export interface SourceMapHighlight {
    page: number;
    rects: SourceMapRect[];
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
    reverseClickMode: SourceMapClickMode;
    forwardClickMode: SourceMapClickMode;
    showFloatingButtons: boolean;
    reverseClickEnabled: boolean;
    forwardClickEnabled: boolean;
    updateReverseClickMode: (mode: SourceMapClickMode) => void;
    updateForwardClickMode: (mode: SourceMapClickMode) => void;
    updateShowFloatingButtons: (show: boolean) => void;
    updateReverseClickEnabled: (enabled: boolean) => void;
    updateForwardClickEnabled: (enabled: boolean) => void;
}