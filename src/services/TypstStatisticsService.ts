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

        let mainContent = await this.getCleanContent(mainFile);

        if (!mainContent || mainContent.trim().length === 0) {
            throw new Error('Main file content is empty');
        }

        let allContent = mainContent;

        if (options.includeFiles) {
            const includedFiles = await this.extractIncludedFiles(mainContent, allFiles);
            for (const file of includedFiles) {
                allContent += '\n' + file.content;
            }
        }

        const usesTemplateFramework = this.detectTemplateFramework(mainContent);

        if (usesTemplateFramework) {
            console.log('[TypstStatisticsService] Template framework detected, using manual word counting');
            return this.manualWordCount(allContent, mainFile.name, options.verbose);
        } else {
            console.log('[TypstStatisticsService] No template framework detected, using wordometer');
            return await this.wordmeterCount(mainFile, allFiles, options, mainContent);
        }
    }

    private detectTemplateFramework(content: string): boolean {
        const templatePatterns = [
            /@preview\/touying/,
            /@preview\/polylux/,
            /@preview\/charged-ieee/,
            /themes\.metropolis/,
            /themes\.university/,
        ];

        return templatePatterns.some(pattern => pattern.test(content));
    }

    private async wordmeterCount(
        mainFile: FileNode,
        allFiles: FileNode[],
        options: StatisticsOptions,
        mainContent: string
    ): Promise<DocumentStatistics> {
        const engine = this.getCompilerEngine();
        const sources = await this.prepareSources(mainFile, allFiles, options.includeFiles, mainContent);

        const modifiedMainContent = this.injectWordometer(mainContent);
        const normalizedMainPath = mainFile.path.replace(/^\/+/, '');
        sources[`/${normalizedMainPath}`] = modifiedMainContent;

        try {
            const result = await engine.compile(
                `/${normalizedMainPath}`,
                sources,
                'svg'
            );

            if (!result.output) {
                throw new Error('Statistics compilation produced no output');
            }

            const rawOutput = typeof result.output === 'string'
                ? result.output
                : new TextDecoder().decode(result.output as Uint8Array);

            return this.parseWordmeterOutput(rawOutput, mainFile.name, mainContent, options.verbose);
        } catch (error) {
            console.warn('[TypstStatisticsService] Wordometer failed, falling back to manual count:', error);
            return this.manualWordCount(mainContent, mainFile.name, options.verbose);
        }
    }

    private manualWordCount(content: string, fileName: string, verbose?: number): DocumentStatistics {
        const contentBlocks = this.extractContentBlocks(content);
        const allText = contentBlocks.join(' ');

        const headingMatches = content.match(/^=+\s+.+$/gm) || [];
        const mathInlineMatches = content.match(/\$[^$\n]+\$/g) || [];
        const mathDisplayMatches = content.match(/\$\$[\s\S]+?\$\$/g) || [];

        let cleanedText = allText
            .replace(/\$[^$]+\$/g, ' ')
            .replace(/\$\$[\s\S]+?\$\$/g, ' ')
            .replace(/#[\w-]+\([^)]*\)/g, ' ')
            .replace(/image\([^)]+\)/g, ' ')
            .replace(/<[^>]+>/g, ' ')
            .replace(/[{}()]/g, ' ')
            .replace(/[*_`~^]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        const words = cleanedText.split(/\s+/).filter(word =>
            word.length > 0 && /[a-zA-Z0-9\u4e00-\u9fff]/.test(word)
        );

        const stats: DocumentStatistics = {
            words: words.length,
            headers: headingMatches.length,
            captions: 0,
            mathInline: mathInlineMatches.length,
            mathDisplay: mathDisplayMatches.length,
        };

        let rawOutputText = `File: ${fileName}\n`;
        rawOutputText += `Words in text: ${stats.words}\n`;
        rawOutputText += `Headers: ${stats.headers}\n`;
        rawOutputText += `Math inline: ${stats.mathInline}\n`;
        rawOutputText += `Math display: ${stats.mathDisplay}\n`;
        rawOutputText += `\nTotal: ${stats.words}\n`;
        rawOutputText += `\n(Note: Counted manually due to template framework usage)`;

        if (verbose && verbose > 0) {
            rawOutputText += '\n\n=== Content Being Analyzed ===\n';
            rawOutputText += content;
            rawOutputText += '\n\n=== Extracted Text ===\n';
            rawOutputText += cleanedText;
            rawOutputText += '\n=== End of Content ===';
        }

        stats.rawOutput = rawOutputText;

        return stats;
    }

    private extractContentBlocks(text: string): string[] {
        const blocks: string[] = [];
        let depth = 0;
        let currentBlock = '';

        for (let i = 0; i < text.length; i++) {
            const char = text[i];

            if (char === '[') {
                if (depth === 0) {
                    currentBlock = '';
                }
                depth++;
                if (depth > 1) {
                    currentBlock += char;
                }
            } else if (char === ']') {
                depth--;
                if (depth === 0) {
                    blocks.push(currentBlock);
                    currentBlock = '';
                } else if (depth > 0) {
                    currentBlock += char;
                }
            } else if (depth > 0) {
                currentBlock += char;
            }
        }

        const headingMatches = text.matchAll(/^(=+)\s+(.+)$/gm);
        for (const match of headingMatches) {
            blocks.push(match[2]);
        }

        return blocks;
    }

    private injectWordometer(content: string): string {
        const hasWordometer = content.includes('@preview/wordometer');

        let modified = content;

        const lines = modified.split('\n');
        let lastImportIndex = -1;
        let firstShowIndex = -1;

        for (let i = 0; i < lines.length; i++) {
            const trimmed = lines[i].trim();
            if (trimmed.startsWith('#import')) {
                lastImportIndex = i;
            } else if (trimmed.startsWith('#show:') && firstShowIndex === -1) {
                firstShowIndex = i;
            }
        }

        if (!hasWordometer) {
            const insertIndex = lastImportIndex + 1;
            lines.splice(insertIndex, 0, '#import "@preview/wordometer:0.1.5": word-count, total-words');
            if (firstShowIndex >= insertIndex) {
                firstShowIndex++;
            }
        }

        const hasShowWordCount = modified.includes('#show: word-count');
        if (!hasShowWordCount) {
            if (firstShowIndex === -1) {
                const insertIndex = lastImportIndex + 1;
                if (hasWordometer) {
                    lines.splice(insertIndex, 0, '', '#show: word-count');
                } else {
                    lines.splice(insertIndex + 1, 0, '', '#show: word-count');
                }
            } else {
                lines.splice(firstShowIndex, 0, '#show: word-count', '');
            }
        }

        modified = lines.join('\n');

        const hasOutputBlock = modified.includes('WORDOMETER_OUTPUT_START');
        if (!hasOutputBlock) {
            modified += `\n\n#pagebreak()

#context [
  WORDOMETER_OUTPUT_START
  
  Total words: #total-words
  
  WORDOMETER_OUTPUT_END
]`;
        }

        return modified;
    }

    private parseWordmeterOutput(
        output: string,
        mainFileName: string,
        cleanedContent?: string,
        verbose?: number
    ): DocumentStatistics {
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
            throw new Error('Could not find wordometer output markers');
        }

        const relevantOutput = output.substring(startIdx + startMarker.length, endIdx).trim();
        const totalWordsMatch = relevantOutput.match(/Total words:\s*(\d+)/);

        if (totalWordsMatch) {
            stats.words = parseInt(totalWordsMatch[1], 10);
        }

        let rawOutputText = `File: ${mainFileName}\nWords in text: ${stats.words}\n\nTotal: ${stats.words}`;

        if (verbose && verbose > 0 && cleanedContent) {
            rawOutputText += '\n\n=== Content Being Analyzed ===\n';
            rawOutputText += cleanedContent;
            rawOutputText += '\n=== End of Content ===';
        }

        stats.rawOutput = rawOutputText;

        return stats;
    }

    private async prepareSources(
        mainFile: FileNode,
        allFiles: FileNode[],
        includeFiles: boolean,
        mainContent: string
    ): Promise<Record<string, string | Uint8Array>> {
        const sources: Record<string, string | Uint8Array> = {};

        if (includeFiles) {
            const includedFiles = await this.extractIncludedFiles(mainContent, allFiles);

            for (const file of includedFiles) {
                const normalizedPath = file.path.replace(/^\/+/, '');
                sources[`/${normalizedPath}`] = file.content;
            }
        }

        const resourceFiles = allFiles.filter(f =>
            f.type === 'file' &&
            !f.isDeleted &&
            !f.path.startsWith('/.texlyre_') &&
            f.path !== mainFile.path &&
            f.path.match(/\.(png|jpg|jpeg|gif|svg|pdf|bib|cls|sty|toml|yaml|yml|typ)$/i)
        );

        for (const file of resourceFiles) {
            try {
                const content = await this.getFileContent(file);
                if (content) {
                    const normalizedPath = file.path.replace(/^\/+/, '');
                    if (typeof content === 'string') {
                        sources[`/${normalizedPath}`] = content;
                    } else {
                        sources[`/${normalizedPath}`] = new Uint8Array(content);
                    }
                }
            } catch (error) {
                console.warn(`Failed to load resource file ${file.path}:`, error);
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

    private async getRawContent(file: FileNode): Promise<string> {
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

        return content;
    }

    private async getCleanContent(file: FileNode): Promise<string> {
        const content = await this.getRawContent(file);
        const cleaned = cleanContent(content);
        return typeof cleaned === 'string' ? cleaned : new TextDecoder().decode(cleaned);
    }

    private async getFileContent(file: FileNode): Promise<ArrayBuffer | string | null> {
        if (file.content !== undefined) {
            return file.content;
        }
        try {
            const storedFile = await fileStorageService.getFile(file.id);
            return storedFile?.content || null;
        } catch (error) {
            console.warn(`Failed to retrieve content for ${file.path}:`, error);
            return null;
        }
    }

    terminate(): void {
        if (this.compilerEngine) {
            this.compilerEngine.terminate();
            this.compilerEngine = null;
        }
    }
}

export const typstStatisticsService = new TypstStatisticsService();