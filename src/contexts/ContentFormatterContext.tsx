// src/contexts/ContentFormatterContext.tsx
import type React from 'react';
import { createContext, ReactNode, useCallback, useState, useEffect, useRef } from 'react';
import { nanoid } from 'nanoid';

import { contentFormatterService, LatexFormatOptions, TypstFormatOptions } from '../services/ContentFormatterService';
import { useProperties } from '../hooks/useProperties';
import { useSettings } from '../hooks/useSettings';

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
    const { getProperty, setProperty, registerProperty } = useProperties();
    const { registerSetting, getSetting } = useSettings();
    const [isFormatting, setIsFormatting] = useState(false);
    const propertiesRegistered = useRef(false);
    const settingsRegistered = useRef(false);
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

    useEffect(() => {
        if (settingsRegistered.current) return;
        settingsRegistered.current = true;

        const initialLatexNotifications =
            (getSetting('formatter-latex-notifications')?.value as boolean) ?? true;
        const initialTypstNotifications =
            (getSetting('formatter-typst-notifications')?.value as boolean) ?? true;

        registerSetting({
            id: 'formatter-latex-notifications',
            category: 'Viewers',
            subcategory: 'Text Editor',
            type: 'checkbox',
            label: 'Show LaTeX formatting notifications',
            description: 'Display notifications for LaTeX content formatting activities',
            defaultValue: initialLatexNotifications,
        });

        registerSetting({
            id: 'formatter-typst-notifications',
            category: 'Viewers',
            subcategory: 'Text Editor',
            type: 'checkbox',
            label: 'Show Typst formatting notifications',
            description: 'Display notifications for Typst content formatting activities',
            defaultValue: initialTypstNotifications,
        });
    }, [registerSetting, getSetting]);

    useEffect(() => {
        if (propertiesRegistered.current) return;
        propertiesRegistered.current = true;

        registerProperty({
            id: 'formatter-latex-wrap',
            category: 'UI',
            subcategory: 'Formatter',
            defaultValue: true,
        });

        registerProperty({
            id: 'formatter-latex-wraplen',
            category: 'UI',
            subcategory: 'Formatter',
            defaultValue: 80,
        });

        registerProperty({
            id: 'formatter-latex-tabsize',
            category: 'UI',
            subcategory: 'Formatter',
            defaultValue: 1,
        });

        registerProperty({
            id: 'formatter-latex-usetabs',
            category: 'UI',
            subcategory: 'Formatter',
            defaultValue: true,
        });

        registerProperty({
            id: 'formatter-typst-linewidth',
            category: 'UI',
            subcategory: 'Formatter',
            defaultValue: 80,
        });

        registerProperty({
            id: 'formatter-typst-indentwidth',
            category: 'UI',
            subcategory: 'Formatter',
            defaultValue: 2,
        });

        registerProperty({
            id: 'formatter-typst-reorderimportitems',
            category: 'UI',
            subcategory: 'Formatter',
            defaultValue: true,
        });

        registerProperty({
            id: 'formatter-typst-wraptext',
            category: 'UI',
            subcategory: 'Formatter',
            defaultValue: false,
        });
    }, [registerProperty]);

    useEffect(() => {
        const storedLatexWrap = getProperty('formatter-latex-wrap');
        const storedLatexWraplen = getProperty('formatter-latex-wraplen');
        const storedLatexTabsize = getProperty('formatter-latex-tabsize');
        const storedLatexUsetabs = getProperty('formatter-latex-usetabs');
        const storedTypstLineWidth = getProperty('formatter-typst-linewidth');
        const storedTypstIndentWidth = getProperty('formatter-typst-indentwidth');
        const storedTypstReorderImportItems = getProperty('formatter-typst-reorderimportitems');
        const storedTypstWrapText = getProperty('formatter-typst-wraptext');

        if (storedLatexWrap !== undefined || storedLatexWraplen !== undefined ||
            storedLatexTabsize !== undefined || storedLatexUsetabs !== undefined) {
            setLatexOptions({
                wrap: storedLatexWrap !== undefined ? Boolean(storedLatexWrap) : true,
                wraplen: storedLatexWraplen !== undefined ? Number(storedLatexWraplen) : 80,
                tabsize: storedLatexTabsize !== undefined ? Number(storedLatexTabsize) : 1,
                usetabs: storedLatexUsetabs !== undefined ? Boolean(storedLatexUsetabs) : true
            });
        }

        if (storedTypstLineWidth !== undefined || storedTypstIndentWidth !== undefined ||
            storedTypstReorderImportItems !== undefined || storedTypstWrapText !== undefined) {
            setTypstOptions({
                lineWidth: storedTypstLineWidth !== undefined ? Number(storedTypstLineWidth) : 80,
                indentWidth: storedTypstIndentWidth !== undefined ? Number(storedTypstIndentWidth) : 2,
                reorderImportItems: storedTypstReorderImportItems !== undefined ? Boolean(storedTypstReorderImportItems) : true,
                wrapText: storedTypstWrapText !== undefined ? Boolean(storedTypstWrapText) : false
            });
        }
    }, [getProperty]);

    const handleSetLatexOptions = useCallback((options: LatexFormatOptions) => {
        setLatexOptions(options);
        setProperty('formatter-latex-wrap', options.wrap);
        setProperty('formatter-latex-wraplen', options.wraplen);
        setProperty('formatter-latex-tabsize', options.tabsize);
        setProperty('formatter-latex-usetabs', options.usetabs);
    }, [setProperty]);

    const handleSetTypstOptions = useCallback((options: TypstFormatOptions) => {
        setTypstOptions(options);
        setProperty('formatter-typst-linewidth', options.lineWidth);
        setProperty('formatter-typst-indentwidth', options.indentWidth);
        setProperty('formatter-typst-reorderimportitems', options.reorderImportItems);
        setProperty('formatter-typst-wraptext', options.wrapText);
    }, [setProperty]);

    const formatLatex = useCallback(async (
        content: string,
        formatOptions: LatexFormatOptions
    ): Promise<string | null> => {
        if (isFormatting) return null;

        setIsFormatting(true);
        const operationId = `format-latex-${nanoid()}`;

        try {
            contentFormatterService.showLoadingNotification('Formatting LaTeX content...', operationId, 'latex');

            const result = await contentFormatterService.formatLatex(content, formatOptions);

            if (result.success && result.output) {
                contentFormatterService.showSuccessNotification('Content formatted successfully', {
                    operationId,
                    duration: 2000,
                    type: 'latex'
                });
                return result.output;
            }

            contentFormatterService.showErrorNotification(
                result.error || 'Formatting failed',
                { operationId, duration: 3000, type: 'latex' }
            );
            return null;
        } catch (error) {
            contentFormatterService.showErrorNotification(
                `Formatting error: ${error instanceof Error ? error.message : 'Unknown error'}`,
                { operationId, duration: 3000, type: 'latex' }
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
            contentFormatterService.showLoadingNotification('Formatting Typst content...', operationId, 'typst');

            const result = await contentFormatterService.formatTypst(content, formatOptions);

            if (result.success && result.output) {
                contentFormatterService.showSuccessNotification('Content formatted successfully', {
                    operationId,
                    duration: 2000,
                    type: 'typst'
                });
                return result.output;
            }

            contentFormatterService.showErrorNotification(
                result.error || 'Formatting failed',
                { operationId, duration: 3000, type: 'typst' }
            );
            return null;
        } catch (error) {
            contentFormatterService.showErrorNotification(
                `Formatting error: ${error instanceof Error ? error.message : 'Unknown error'}`,
                { operationId, duration: 3000, type: 'typst' }
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
                setLatexOptions: handleSetLatexOptions,
                typstOptions,
                setTypstOptions: handleSetTypstOptions
            }}
        >
            {children}
        </ContentFormatterContext.Provider>
    );
};