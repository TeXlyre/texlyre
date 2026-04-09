// src/services/LaTeXSourceMapService.ts
import type { SourceMapData, SourceMapForwardResult, SourceMapReverseResult, SourceMapService } from '../types/sourceMap';
import { parseSynctex } from '../utils/latexSynctexParser';

class LaTeXSourceMapService implements SourceMapService {
    private data: SourceMapData | null = null;
    private listeners: Set<() => void> = new Set();

    loadFromBytes(bytes: Uint8Array): void {
        try {
            this.data = parseSynctex(bytes);
            this.notifyListeners();
        } catch (error) {
            console.error('[LaTeXSourceMapService] Failed to parse synctex:', error);
            this.data = null;
            this.notifyListeners();
        }
    }

    isAvailable(): boolean {
        return this.data !== null;
    }

    forward(file: string, line: number, column?: number): SourceMapForwardResult | null {
        return this.data?.forward(file, line, column) ?? null;
    }

    reverse(page: number, x: number, y: number): SourceMapReverseResult | null {
        return this.data?.reverse(page, x, y) ?? null;
    }

    clear(): void {
        this.data = null;
        this.notifyListeners();
    }

    addListener(listener: () => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    private notifyListeners(): void {
        this.listeners.forEach((listener) => listener());
    }
}

export const latexSourceMapService = new LaTeXSourceMapService();