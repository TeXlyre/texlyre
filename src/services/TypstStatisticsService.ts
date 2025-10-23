// src/services/TypstStatisticsService.ts
import type { FileNode } from '../types/files';
import { fileStorageService } from './FileStorageService';
import { cleanContent } from '../utils/fileCommentUtils';
import type { DocumentStatistics, StatisticsOptions } from '../types/statistics';
import { TypstCompilerEngine } from '../extensions/typst.ts/TypstCompilerEngine';

class TypstStatisticsService {
    private compilerEngine: TypstCompilerEngine | null = null;

    private getCompilerEngine(): TypstCompilerEngine {
        if (!this.compilerEngine) {
            this.compilerEngine = new TypstCompilerEngine();
        }
        return this.compilerEngine;
    }

    async getStatistics(
        mainFilePath: string,
        fileTree: FileNode[],
        options: StatisticsOptions
    ): Promise<DocumentStatistics> {
        const engine = this.getCompilerEngine();

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

        const sources = await this.prepareSources(mainFile, allFiles, options.includeFiles);
        const counterDocument = this.buildCounterDocument(mainFile.name, options.includeFiles);

        sources['/wordometer-counter.typ'] = counterDocument;

        try {
            const result = await engine.compile(
                '/wordometer-counter.typ',
                sources,
                'canvas'
            );

            if (!result.output) {
                throw new Error('Statistics compilation produced no output');
            }

            const rawOutput = typeof result.output === 'string'
                ? result.output
                : new TextDecoder().decode(result.output as Uint8Array);

            return this.parseStatistics(rawOutput, options.merge, mainFile.name);
        } catch (error) {
            throw new Error(`Statistics calculation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    private buildCounterDocument(mainFileName: string, includeFiles: boolean): string {
        const normalizedPath = mainFileName.startsWith('/') ? mainFileName : `/${mainFileName}`;

        return `
#import "@preview/wordometer:0.1.3": word-count, total-words

${includeFiles ? '#show: word-count.with(exclude: none)' : '#show: word-count'}

#include "${normalizedPath}"

#context [
  WORDOMETER_OUTPUT_START
  Total words: #total-words
  WORDOMETER_OUTPUT_END
]
`.trim();
    }

    private async prepareSources(
        mainFile: FileNode,
        allFiles: FileNode[],
        includeFiles: boolean
    ): Promise<Record<string, string | Uint8Array>> {
        const sources: Record<string, string | Uint8Array> = {};

        const mainContent = await this.getCleanContent(mainFile);
        const normalizedMainPath = mainFile.path.replace(/^\/+/, '');
        sources[`/${normalizedMainPath}`] = mainContent;

        if (includeFiles) {
            const includedFiles = await this.extractIncludedFiles(mainContent, allFiles);
            for (const file of includedFiles) {
                const normalizedPath = file.path.replace(/^\/+/, '');
                sources[`/${normalizedPath}`] = file.content;
            }
        }

        return sources;
    }

    private async extractIncludedFiles(
        content: string,
        allFiles: FileNode[]
    ): Promise<Array<{ path: string; content: string }>> {
        const includePattern = /#include\s+"([^"]+)"/g;
        const files: Array<{ path: string; content: string }> = [];
        const processedPaths = new Set<string>();
        let match;

        while ((match = includePattern.exec(content)) !== null) {
            let filename = match[1];

            if (!filename.endsWith('.typ')) {
                filename += '.typ';
            }

            if (processedPaths.has(filename)) continue;
            processedPaths.add(filename);

            const file = allFiles.find(f =>
                f.path === filename ||
                f.path === `/${filename}` ||
                f.path.endsWith(`/${filename}`)
            );

            if (file) {
                const cleanFileContent = await this.getCleanContent(file);
                files.push({ path: filename, content: cleanFileContent });

                const nestedFiles = await this.extractIncludedFiles(cleanFileContent, allFiles);
                for (const nested of nestedFiles) {
                    if (!processedPaths.has(nested.path)) {
                        processedPaths.add(nested.path);
                        files.push(nested);
                    }
                }
            }
        }

        return files;
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

        return cleanContent(content) as string;
    }

    private parseStatistics(output: string, _merged: boolean, mainFileName: string): DocumentStatistics {
        const stats: DocumentStatistics = {
            words: 0,
            headers: 0,
            captions: 0,
            mathInline: 0,
            mathDisplay: 0,
            rawOutput: output
        };

        const startMarker = 'WORDOMETER_OUTPUT_START';
        const endMarker = 'WORDOMETER_OUTPUT_END';

        const startIdx = output.indexOf(startMarker);
        const endIdx = output.indexOf(endMarker);

        if (startIdx === -1 || endIdx === -1) {
            throw new Error('Could not parse wordometer output');
        }

        const relevantOutput = output.substring(startIdx + startMarker.length, endIdx).trim();
        const totalWordsMatch = relevantOutput.match(/Total words:\s*(\d+)/);

        if (totalWordsMatch) {
            stats.words = parseInt(totalWordsMatch[1], 10);
        }

        stats.rawOutput = `File: ${mainFileName}\nWords in text: ${stats.words}\n\nTotal: ${stats.words}`;

        return stats;
    }

    terminate(): void {
        if (this.compilerEngine) {
            this.compilerEngine.terminate();
            this.compilerEngine = null;
        }
    }
}

export const typstStatisticsService = new TypstStatisticsService();