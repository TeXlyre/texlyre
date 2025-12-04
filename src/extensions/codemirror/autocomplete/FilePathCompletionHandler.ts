// src/extensions/codemirror/autocomplete/FilePathCompletionHandler.ts
import type { CompletionContext, CompletionResult } from '@codemirror/autocomplete';

import { filePathCacheService } from '../../../services/FilePathCacheService';
import { filePathCacheField } from '../PathAndBibAutocompleteExtension';
import { latexCommandPatterns, typstCommandPatterns } from './patterns';

export class FilePathCompletionHandler {
    initialize() {
    }

    destroy() {
    }

    private findLatexCommand(context: CompletionContext): { command: string; partial: string; fileTypes: string } | null {
        const line = context.state.doc.lineAt(context.pos);
        const lineText = line.text;
        const posInLine = context.pos - line.from;

        for (const { pattern, fileTypes } of latexCommandPatterns) {
            const matches = Array.from(lineText.matchAll(new RegExp(pattern.source, 'g')));

            for (const match of matches) {
                const matchStart = match.index!;
                const braceStart = lineText.indexOf('{', matchStart);
                const braceEnd = lineText.indexOf('}', braceStart);

                if (braceStart !== -1 && posInLine > braceStart && (braceEnd === -1 || posInLine <= braceEnd)) {
                    const partial = lineText.substring(braceStart + 1, posInLine);
                    return { command: match[1], partial, fileTypes };
                }
            }
        }

        return null;
    }

    private findTypstCommand(context: CompletionContext): { command: string; partial: string; fileTypes: string } | null {
        const line = context.state.doc.lineAt(context.pos);
        const lineText = line.text.substring(0, context.pos - line.from);

        for (const { pattern, fileTypes, commands } of typstCommandPatterns) {
            const match = lineText.match(pattern);

            if (match) {
                const quoteStart = match.index! + match[0].length - 1;
                const partial = lineText.substring(quoteStart + 1);
                return { command: commands[0], partial, fileTypes };
            }
        }

        return null;
    }

    private isInTypstFile(currentFilePath: string): boolean {
        return currentFilePath?.endsWith('.typ') || currentFilePath?.endsWith('.typst') || false;
    }

    getCompletions(context: CompletionContext, currentFilePath: string): CompletionResult | null {
        const isCurrentlyInTypstFile = this.isInTypstFile(currentFilePath);
        const commandInfo = isCurrentlyInTypstFile
            ? this.findTypstCommand(context)
            : this.findLatexCommand(context);

        if (!commandInfo) return null;

        const cache = context.state.field(filePathCacheField, false);
        if (!cache || cache.files.length === 0) return null;

        const { partial, fileTypes } = commandInfo;

        let candidates: string[];
        switch (fileTypes) {
            case 'images':
                candidates = cache.imageFiles;
                break;
            case 'tex':
                candidates = cache.texFiles;
                break;
            case 'typst':
                candidates = cache.typstFiles || [];
                break;
            case 'bib':
                candidates = cache.bibFiles;
                break;
            case 'data':
                candidates = cache.allFiles.filter(path =>
                    /\.(csv|json|yaml|yml|toml)$/i.test(path)
                );
                break;
            case 'all':
            default:
                candidates = cache.allFiles;
                break;
        }

        const options = candidates
            .map(filePath => {
                const relativePath = isCurrentlyInTypstFile
                    ? filePathCacheService.getTypstRelativePath(currentFilePath, filePath)
                    : filePathCacheService.getLatexRelativePath(currentFilePath, filePath);
                const fileName = filePath.substring(filePath.lastIndexOf('/') + 1);

                const displayPath = (() => {
                    if (isCurrentlyInTypstFile) {
                        return relativePath;
                    }

                    if (fileTypes === 'bib' && relativePath.endsWith('.bib')) {
                        return relativePath.slice(0, -4);
                    }

                    if (fileTypes === 'tex' && relativePath.endsWith('.tex')) {
                        return relativePath.slice(0, -4);
                    }

                    return relativePath;
                })();

                return {
                    fullPath: filePath,
                    relativePath: displayPath,
                    fileName,
                };
            })
            .filter(({ relativePath }) =>
                !partial || relativePath.toLowerCase().includes(partial.toLowerCase())
            )
            .sort((a, b) => {
                const aStartsWith = a.relativePath.toLowerCase().startsWith(partial.toLowerCase());
                const bStartsWith = b.relativePath.toLowerCase().startsWith(partial.toLowerCase());
                if (aStartsWith && !bStartsWith) return -1;
                if (!aStartsWith && bStartsWith) return 1;

                const lenDiff = a.relativePath.length - b.relativePath.length;
                if (lenDiff !== 0) return lenDiff;

                return a.relativePath.localeCompare(b.relativePath);
            })
            .slice(0, 20)
            .map(({ relativePath, fileName, fullPath }) => ({
                label: relativePath,
                detail: fileName !== relativePath ? fileName : undefined,
                info: fullPath,
                apply: relativePath,
                boost: partial && relativePath.toLowerCase().startsWith(partial.toLowerCase()) ? 10 : 0,
            }));

        if (options.length === 0) return null;

        const line = context.state.doc.lineAt(context.pos);
        const lineText = line.text;
        const posInLine = context.pos - line.from;

        let partialStart = posInLine;
        const patterns = isCurrentlyInTypstFile ? typstCommandPatterns : latexCommandPatterns;

        for (const { pattern } of patterns) {
            const matches = Array.from(lineText.matchAll(new RegExp(pattern.source, 'g')));

            for (const match of matches) {
                if (match.index === undefined) continue;

                const openChar = isCurrentlyInTypstFile ? '"' : '{';
                const openPos = lineText.indexOf(openChar, match.index);
                if (openPos !== -1 && posInLine > openPos) {
                    const closeChar = isCurrentlyInTypstFile ? '"' : '}';
                    const closePos = lineText.indexOf(closeChar, openPos + 1);
                    if (closePos === -1 || posInLine <= closePos) {
                        partialStart = line.from + openPos + 1;
                        break;
                    }
                }
            }
            if (partialStart !== posInLine) break;
        }

        return {
            from: partialStart,
            options,
            validFor: isCurrentlyInTypstFile ? /^[^\"]*/ : /^[^}]*/,
        };
    }
}