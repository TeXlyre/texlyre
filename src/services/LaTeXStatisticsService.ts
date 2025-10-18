// src/services/LaTeXStatisticsService.ts
import { WasmToolsEngine } from '../extensions/wasm-tools/WasmToolsEngine';
import type { FileNode } from '../types/files';
import { fileStorageService } from './FileStorageService';
import { fileCommentProcessor } from '../utils/fileCommentProcessor';
import type { DocumentStatistics, StatisticsOptions, FileStatistics } from '../types/statistics';

class LaTeXStatisticsService {
    private engine: WasmToolsEngine | null = null;

    private getEngine(): WasmToolsEngine {
        if (!this.engine) {
            this.engine = new WasmToolsEngine();
        }
        return this.engine;
    }

    async getStatistics(
        mainFilePath: string,
        fileTree: FileNode[],
        options: StatisticsOptions
    ): Promise<DocumentStatistics> {
        const engine = this.getEngine();

        const allFiles = this.collectFiles(fileTree);
        const normalizedPath = mainFilePath.replace(/^\/+/, '');

        const mainFile = allFiles.find(f =>
            f.path === mainFilePath ||
            f.path === `/${normalizedPath}` ||
            f.path.replace(/^\/+/, '') === normalizedPath ||
            f.name === normalizedPath ||
            f.path.endsWith(`/${normalizedPath}`)
        );

        if (!mainFile) {
            throw new Error(`Main file not found: ${mainFilePath}`);
        }

        if (!mainFile.content) {
            const storedFile = await fileStorageService.getFile(mainFile.id);
            if (!storedFile?.content) {
                throw new Error('Main file content not found');
            }
            mainFile.content = storedFile.content;
        }

        const mainContent = await this.getCleanContent(mainFile);
        const mainFileName = mainFile.name || normalizedPath.split('/').pop() || 'main.tex';
        const includedFiles = options.includeFiles
            ? await this.extractIncludedFiles(mainContent, allFiles)
            : [];

        const result = await engine.count(mainContent, options, includedFiles);

        if (!result.success) {
            throw new Error(result.error || 'Statistics generation failed');
        }

        return this.parseStatistics(result.output!, options.merge, mainFileName);
    }

    private collectFiles(nodes: FileNode[]): FileNode[] {
        const files: FileNode[] = [];
        const traverse = (nodeList: FileNode[]) => {
            for (const node of nodeList) {
                if (node.type === 'file') files.push(node);
                if (node.children) traverse(node.children);
            }
        };
        traverse(nodes);
        return files;
    }

    private async getCleanContent(file: FileNode): Promise<string> {
        let content: string;

        if (file.content) {
            content = typeof file.content === 'string'
                ? file.content
                : new TextDecoder().decode(file.content);
        } else {
            const storedFile = await fileStorageService.getFile(file.id);
            if (!storedFile?.content) throw new Error('File content not found');

            content = typeof storedFile.content === 'string'
                ? storedFile.content
                : new TextDecoder().decode(storedFile.content);
        }

        return fileCommentProcessor.cleanContent(content) as string;
    }

    private async extractIncludedFiles(
        content: string,
        allFiles: FileNode[]
    ): Promise<Array<{ path: string; content: string }>> {
        const includePattern = /\\(?:input|include)\{([^}]+)\}/g;
        const files: Array<{ path: string; content: string }> = [];
        let match;

        while ((match = includePattern.exec(content)) !== null) {
            let filename = match[1];
            if (!filename.endsWith('.tex')) filename += '.tex';

            const file = allFiles.find(f =>
                f.path === filename ||
                f.path === `/${filename}` ||
                f.path.endsWith(`/${filename}`)
            );

            if (file) {
                const cleanContent = await this.getCleanContent(file);
                files.push({ path: filename, content: cleanContent });
            }
        }

        return files;
    }

    private parseStatistics(output: string, merged: boolean, mainFileName: string): DocumentStatistics {
        const stats: DocumentStatistics = {
            words: 0,
            headers: 0,
            captions: 0,
            mathInline: 0,
            mathDisplay: 0,
            rawOutput: output.replace(/\bmain\.tex\b/g, mainFileName)
        };

        const lines = output.split('\n');
        const fileStatsMap = new Map<string, FileStatistics>();
        let currentFileStat: FileStatistics | null = null;
        let inVerboseOutput = false;
        let inFileSummary = false;
        let inTotalSummary = false;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            if (line.startsWith('Total')) {
                continue;
            }

            const briefMatch = line.match(/^(\d+):\s+(?:File|Included file):\s+(.+)$/);
            if (briefMatch) {
                const wordCount = parseInt(briefMatch[1], 10);
                let filename = briefMatch[2].trim();
                if (filename === 'main.tex') {
                    filename = mainFileName;
                }

                const fileStat: FileStatistics = {
                    filename,
                    words: wordCount,
                    headers: 0,
                    captions: 0,
                    mathInline: 0,
                    mathDisplay: 0,
                    numHeaders: 0,
                    numFloats: 0
                };

                fileStatsMap.set(filename, fileStat);
                continue;
            }

            if (line.startsWith('File: ') || line.startsWith('Included file: ')) {
                if (currentFileStat && (inFileSummary || !inVerboseOutput)) {
                    if (currentFileStat.words > 0 || currentFileStat.headers > 0 || currentFileStat.captions > 0) {
                        fileStatsMap.set(currentFileStat.filename, currentFileStat);
                    }
                }

                const fileMatch = line.match(/^(?:File|Included file):\s+(.+)$/);
                let filename = fileMatch ? fileMatch[1].trim() : '';
                if (filename === 'main.tex') {
                    filename = mainFileName;
                }

                currentFileStat = {
                    filename,
                    words: 0,
                    headers: 0,
                    captions: 0,
                    mathInline: 0,
                    mathDisplay: 0,
                    numHeaders: 0,
                    numFloats: 0
                };

                if (line.includes('[')) {
                    inVerboseOutput = true;
                    inFileSummary = false;
                } else {
                    inVerboseOutput = false;
                    inFileSummary = true;
                }
                inTotalSummary = false;
            } else if (line.includes('Encoding:')) {
                inVerboseOutput = false;
                if (currentFileStat) {
                    inFileSummary = true;
                }
            } else if (line.includes('Sum of files:') || line.includes('File(s) total:')) {
                if (currentFileStat && inFileSummary) {
                    if (currentFileStat.words > 0 || currentFileStat.headers > 0 || currentFileStat.captions > 0) {
                        fileStatsMap.set(currentFileStat.filename, currentFileStat);
                    }
                }
                currentFileStat = null;
                inFileSummary = false;
                inVerboseOutput = false;
                inTotalSummary = true;
            } else if (line.includes('Subcounts:') || line.includes('Format/colour codes')) {
                if (currentFileStat && inFileSummary) {
                    if (currentFileStat.words > 0 || currentFileStat.headers > 0 || currentFileStat.captions > 0) {
                        fileStatsMap.set(currentFileStat.filename, currentFileStat);
                    }
                }
                currentFileStat = null;
                inFileSummary = false;
                inVerboseOutput = false;
                inTotalSummary = false;
            }

            if (line.includes('Words in text:')) {
                const value = parseInt(line.split(':')[1]?.trim() || '0', 10);
                if (inFileSummary && currentFileStat) {
                    currentFileStat.words = value;
                } else if (inTotalSummary || (!inVerboseOutput && !inFileSummary)) {
                    stats.words = value;
                }
            } else if (line.includes('Words in headers:')) {
                const value = parseInt(line.split(':')[1]?.trim() || '0', 10);
                if (inFileSummary && currentFileStat) {
                    currentFileStat.headers = value;
                } else if (inTotalSummary || (!inVerboseOutput && !inFileSummary)) {
                    stats.headers = value;
                }
            } else if (line.includes('Words outside text') || line.includes('Words in float captions:')) {
                const value = parseInt(line.split(':')[1]?.trim() || '0', 10);
                if (inFileSummary && currentFileStat) {
                    currentFileStat.captions = value;
                } else if (inTotalSummary || (!inVerboseOutput && !inFileSummary)) {
                    stats.captions = value;
                }
            } else if (line.includes('Number of math inlines:')) {
                const value = parseInt(line.split(':')[1]?.trim() || '0', 10);
                if (inFileSummary && currentFileStat) {
                    currentFileStat.mathInline = value;
                } else if (inTotalSummary || (!inVerboseOutput && !inFileSummary)) {
                    stats.mathInline = value;
                }
            } else if (line.includes('Number of math displayed:')) {
                const value = parseInt(line.split(':')[1]?.trim() || '0', 10);
                if (inFileSummary && currentFileStat) {
                    currentFileStat.mathDisplay = value;
                } else if (inTotalSummary || (!inVerboseOutput && !inFileSummary)) {
                    stats.mathDisplay = value;
                }
            } else if (line.includes('Number of headers:')) {
                const value = parseInt(line.split(':')[1]?.trim() || '0', 10);
                if (inFileSummary && currentFileStat) {
                    currentFileStat.numHeaders = value;
                } else if (inTotalSummary || (!inVerboseOutput && !inFileSummary)) {
                    stats.numHeaders = value;
                }
            } else if (line.includes('Number of floats/tables/figures:')) {
                const value = parseInt(line.split(':')[1]?.trim() || '0', 10);
                if (inFileSummary && currentFileStat) {
                    currentFileStat.numFloats = value;
                } else if (inTotalSummary || (!inVerboseOutput && !inFileSummary)) {
                    stats.numFloats = value;
                }
            } else if (line.includes('Files:')) {
                stats.files = parseInt(line.split(':')[1]?.trim() || '0', 10);
            }
        }

        if (currentFileStat && inFileSummary) {
            if (currentFileStat.words > 0 || currentFileStat.headers > 0 || currentFileStat.captions > 0) {
                fileStatsMap.set(currentFileStat.filename, currentFileStat);
            }
        }

        const fileStats = Array.from(fileStatsMap.values());

        if (fileStats.length > 0) {
            const totalWords = fileStats.reduce((sum, file) => sum + file.words, 0);
            const totalHeaders = fileStats.reduce((sum, file) => sum + file.headers, 0);
            const totalCaptions = fileStats.reduce((sum, file) => sum + file.captions, 0);
            const totalMathInline = fileStats.reduce((sum, file) => sum + file.mathInline, 0);
            const totalMathDisplay = fileStats.reduce((sum, file) => sum + file.mathDisplay, 0);
            const totalNumHeaders = fileStats.reduce((sum, file) => sum + file.numHeaders, 0);
            const totalNumFloats = fileStats.reduce((sum, file) => sum + file.numFloats, 0);

            if (stats.words === 0) stats.words = totalWords;
            if (stats.headers === 0) stats.headers = totalHeaders;
            if (stats.captions === 0) stats.captions = totalCaptions;
            if (stats.mathInline === 0) stats.mathInline = totalMathInline;
            if (stats.mathDisplay === 0) stats.mathDisplay = totalMathDisplay;
            if (!stats.numHeaders) stats.numHeaders = totalNumHeaders;
            if (!stats.numFloats) stats.numFloats = totalNumFloats;
        }

        if (!merged && fileStats.length > 0) {
            stats.fileStats = fileStats;
        }

        return stats;
    }

    terminate(): void {
        if (this.engine) {
            this.engine.terminate();
            this.engine = null;
        }
    }
}

export const latexStatisticsService = new LaTeXStatisticsService();