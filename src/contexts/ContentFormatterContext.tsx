// src/contexts/ContentFormatterContext.tsx
import type React from 'react';
import { createContext, ReactNode, useCallback, useState } from 'react';
import { nanoid } from 'nanoid';

import { contentFormatterService, LatexFormatOptions, TypstFormatOptions } from '../services/ContentFormatterService';

interface ContentFormatterContextType {
    isFormatting: boolean;
    formatLatex: (content: string, options: LatexFormatOptions) => Promise<string | null>;
    formatTypst: (content: string, options: TypstFormatOptions) => Promise<string | null>;
    latexOptions: LatexFormatOptions;
    setLatexOptions: (options: LatexFormatOptions) => void;
    typstOptions: TypstFormatOptions;
    setTypstOptions: (options: TypstFormatOptions) => void;
}

export const ContentFormatterContext = createContext<ContentFormatterContextType | undefined>(undefined);

interface ContentFormatterProviderProps {
    children: ReactNode;
}

export const ContentFormatterProvider: React.FC<ContentFormatterProviderProps> = ({ children }) => {
    const [isFormatting, setIsFormatting] = useState(false);
    const [latexOptions, setLatexOptions] = useState<LatexFormatOptions>({
        wrap: true,
        wraplen: 80,
        tabsize: 1,
        usetabs: true
    });
    const [typstOptions, setTypstOptions] = useState<TypstFormatOptions>({
        lineWidth: 80,
        indentWidth: 2,
        reorderImportItems: true,
        wrapText: false
    });

    const formatLatex = useCallback(async (
        content: string,
        formatOptions: LatexFormatOptions
    ): Promise<string | null> => {
        if (isFormatting) return null;

        setIsFormatting(true);
        const operationId = `format-latex-${nanoid()}`;

        try {
            contentFormatterService.showLoadingNotification('Formatting LaTeX content...', operationId);

            const result = await contentFormatterService.formatLatex(content, formatOptions);

            if (result.success && result.output) {
                contentFormatterService.showSuccessNotification('Content formatted successfully', {
                    operationId,
                    duration: 2000
                });
                return result.output;
            }

            contentFormatterService.showErrorNotification(
                result.error || 'Formatting failed',
                { operationId, duration: 3000 }
            );
            return null;
        } catch (error) {
            contentFormatterService.showErrorNotification(
                `Formatting error: ${error instanceof Error ? error.message : 'Unknown error'}`,
                { operationId, duration: 3000 }
            );
            return null;
        } finally {
            setIsFormatting(false);
        }
    }, [isFormatting]);

    const formatTypst = useCallback(async (
        content: string,
        formatOptions: TypstFormatOptions
    ): Promise<string | null> => {
        if (isFormatting) return null;

        setIsFormatting(true);
        const operationId = `format-typst-${nanoid()}`;

        try {
            contentFormatterService.showLoadingNotification('Formatting Typst content...', operationId);

            const result = await contentFormatterService.formatTypst(content, formatOptions);

            if (result.success && result.output) {
                contentFormatterService.showSuccessNotification('Content formatted successfully', {
                    operationId,
                    duration: 2000
                });
                return result.output;
            }

            contentFormatterService.showErrorNotification(
                result.error || 'Formatting failed',
                { operationId, duration: 3000 }
            );
            return null;
        } catch (error) {
            contentFormatterService.showErrorNotification(
                `Formatting error: ${error instanceof Error ? error.message : 'Unknown error'}`,
                { operationId, duration: 3000 }
            );
            return null;
        } finally {
            setIsFormatting(false);
        }
    }, [isFormatting]);

    return (
        <ContentFormatterContext.Provider
            value={{
                isFormatting,
                formatLatex,
                formatTypst,
                latexOptions,
                setLatexOptions,
                typstOptions,
                setTypstOptions
            }}
        >
            {children}
        </ContentFormatterContext.Provider>
    );
};