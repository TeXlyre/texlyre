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

        const mainContent = await this.getCleanContent(mainFile);

        if (!mainContent || mainContent.trim().length === 0) {
            throw new Error('Main file content is empty');
        }

        return await this.wordmeterCount(mainFile, allFiles, options, mainContent);
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

        const result = await engine.compile(
            `/${normalizedMainPath}`,
            sources,
            'canvas'
        );

        if (!result.output) {
            throw new Error('Statistics compilation produced no output');
        }

        const htmlOutput = typeof result.output === 'string'
            ? result.output
            : new TextDecoder().decode(result.output as Uint8Array);

        return this.parseWordmeterOutput(htmlOutput, mainFile.name, options.verbose);
    }

    private injectWordometer(content: string): string {
        const lines = content.split('\n');

        let lastImportIndex = -1;
        let hasWordometerImport = false;

        for (let i = 0; i < lines.length; i++) {
            const trimmed = lines[i].trim();
            if (trimmed.startsWith('#import')) {
                lastImportIndex = i;
                if (trimmed.includes('@preview/wordometer')) {
                    hasWordometerImport = true;
                }
            }
        }

        if (!hasWordometerImport) {
            const insertIndex = lastImportIndex >= 0 ? lastImportIndex + 1 : 0;
            lines.splice(insertIndex, 0, '#import "@preview/wordometer:0.1.5": word-count, total-words, word-count-of');
            lastImportIndex = insertIndex;
        } else {
            for (let i = 0; i < lines.length; i++) {
                const trimmed = lines[i].trim();
                if (trimmed.includes('@preview/wordometer') && !trimmed.includes('word-count-of')) {
                    lines[i] = lines[i].replace('total-words', 'total-words, word-count-of');
                    break;
                }
            }
        }

        const hasShowWordCount = content.includes('#show: word-count');
        if (!hasShowWordCount) {
            const insertIndex = lastImportIndex + 1;
            lines.splice(insertIndex, 0, '', '#show: word-count');
        }

        let modified = lines.join('\n');

        const hasOutputBlock = modified.includes('WORDOMETER_OUTPUT_START');
        if (!hasOutputBlock) {
            modified += `\n\n#pagebreak()
#context {
  let total = total-words
  let headings = query(heading)
  
  let heading_words = 0
  for h in headings {
    let h_count = word-count-of(h.body)
    heading_words += h_count.words
  }
  
  [WORDOMETER_OUTPUT_START]
  [TOTAL_WORDS: #total]
  [HEADING_WORDS: #heading_words]
  [WORDOMETER_OUTPUT_END]
}`;
        }

        return modified;
    }

    private parseWordmeterOutput(
        output: string,
        mainFileName: string,
        verbose?: number
    ): DocumentStatistics {
        const stats: DocumentStatistics = {
            words: 0,
            headers: 0,
            captions: 0,
            mathInline: 0,
            mathDisplay: 0,
        };

        const parser = new DOMParser();
        const doc = parser.parseFromString(output, 'text/html');

        const allTextNodes: string[] = [];
        const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
        let node;
        while (node = walker.nextNode()) {
            const text = node.textContent?.trim();
            if (text) {
                allTextNodes.push(text);
            }
        }

        const fullText = allTextNodes.join(' ');

        const totalMatch = fullText.match(/TOTAL_WORDS:\s*(\d+)/);
        const headingWordsMatch = fullText.match(/HEADING_WORDS:\s*(\d+)/);

        const total = totalMatch ? parseInt(totalMatch[1], 10) : 0;
        const headingWords = headingWordsMatch ? parseInt(headingWordsMatch[1], 10) : 0;

        stats.headers = headingWords;
        stats.captions = 0;
        stats.mathInline = 0;
        stats.mathDisplay = 0;
        stats.words = total - stats.headers;

        let rawOutputText = `File: ${mainFileName}\n`;
        rawOutputText += `Words in text: ${stats.words}\n`;
        rawOutputText += `Headers: ${stats.headers}\n`;
        rawOutputText += `Captions: ${stats.captions}\n`;
        rawOutputText += `Math inline: ${stats.mathInline}\n`;
        rawOutputText += `Math display: ${stats.mathDisplay}\n`;
        rawOutputText += `\nTotal: ${total}\n`;

        if (verbose && verbose > 0) {
            rawOutputText += '\n\n=== Extracted Text ===\n';
            rawOutputText += fullText;
            rawOutputText += '\n\n=== Rendered HTML Output ===\n';
            rawOutputText += output;
            rawOutputText += '\n=== End of Output ===';
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