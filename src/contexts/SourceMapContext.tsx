// src/contexts/SourceMapContext.tsx
import type React from 'react';
import { type ReactNode, createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

import { LaTeXContext } from './LaTeXContext';
import { TypstContext } from './TypstContext';
import { fileStorageService } from '../services/FileStorageService';
import { latexSourceMapService } from '../services/LaTeXSourceMapService';
// import { typstSourceMapService } from '../services/TypstSourceMapService';
import type { SourceMapContextType, SourceMapHighlight, SourceMapService } from '../types/sourceMap';

export const SourceMapContext = createContext<SourceMapContextType | null>(null);

interface SourceMapProviderProps {
    children: ReactNode;
}

export const SourceMapProvider: React.FC<SourceMapProviderProps> = ({ children }) => {
    const latexContext = useContext(LaTeXContext);
    const typstContext = useContext(TypstContext);
    const [isAvailable, setIsAvailable] = useState(false);
    const [currentHighlight, setCurrentHighlight] = useState<SourceMapHighlight | null>(null);
    const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const pageDimensionsRef = useRef<Map<number, { width: number; height: number }>>(new Map());

    const activeCompiler = latexContext?.activeCompiler || typstContext?.activeCompiler || null;

    const getActiveService = useCallback((): SourceMapService | null => {
        if (activeCompiler === 'latex') return latexSourceMapService;
        // if (activeCompiler === 'typst') return typstSourceMapService;
        return null;
    }, [activeCompiler]);

    useEffect(() => {
        const update = () => {
            const service = getActiveService();
            setIsAvailable(service?.isAvailable() ?? false);
        };
        update();
        const unsubLatex = latexSourceMapService.addListener(update);
        // const unsubTypst = typstSourceMapService.addListener(update);

        return () => {
            unsubLatex();
            // unsubTypst();
        };
    }, [getActiveService]);

    useEffect(() => {
        const handleDimensions = (e: Event) => {
            const detail = (e as CustomEvent).detail as {
                dimensions: Map<number, { width: number; height: number }>;
            };
            if (detail?.dimensions) {
                pageDimensionsRef.current = detail.dimensions;
            }
        };
        document.addEventListener('canvas-renderer-dimensions', handleDimensions);
        return () => document.removeEventListener('canvas-renderer-dimensions', handleDimensions);
    }, []);

    const scheduleHighlightClear = useCallback(() => {
        if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
        highlightTimerRef.current = setTimeout(() => setCurrentHighlight(null), 2000);
    }, []);

    const forwardSync = useCallback((file: string, line: number, column?: number) => {
        const service = getActiveService();
        if (!service) return;

        const result = service.forward(file, line, column);
        if (!result) return;

        setCurrentHighlight({
            page: result.page,
            rects: result.rects,
        });
        scheduleHighlightClear();

        document.dispatchEvent(
            new CustomEvent('canvas-renderer-navigate', {
                detail: { page: result.page },
            }),
        );
    }, [getActiveService, scheduleHighlightClear]);

    const reverseSync = useCallback(async (page: number, x: number, y: number) => {
        const service = getActiveService();
        if (!service) return;

        const result = service.reverse(page, x, y);
        if (!result) return;

        try {
            const allFiles = await fileStorageService.getAllFiles(false, false, false);
            const normalized = result.file.replace(/^\.?\/+/, '');

            const targetFile = allFiles.find((file) =>
                !file.isDeleted && (
                    file.path === result.file ||
                    file.path === `/${normalized}` ||
                    file.path.endsWith(`/${normalized}`) ||
                    file.name === normalized.split('/').pop()
                )
            );

            if (!targetFile) {
                console.warn(`[SourceMapContext] Target file not found: ${result.file}`);
                return;
            }

            document.dispatchEvent(new CustomEvent('navigate-to-compiled-file', {
                detail: { filePath: targetFile.path },
            }));

            setTimeout(() => {
                document.dispatchEvent(new CustomEvent('codemirror-goto-line', {
                    detail: {
                        line: result.line,
                        fileId: targetFile.id,
                        filePath: targetFile.path
                    },
                }));
            }, 150);
        } catch (error) {
            console.error('[SourceMapContext] Reverse sync navigation failed:', error);
        }
    }, [getActiveService]);

    const clearHighlight = useCallback(() => {
        if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
        setCurrentHighlight(null);
    }, []);

    return (
        <SourceMapContext.Provider
            value={{
                isAvailable,
                currentHighlight,
                forwardSync,
                reverseSync,
                clearHighlight
            }}>
            {children}
        </SourceMapContext.Provider>
    );
};