// src/services/TypstStatisticsService.ts
import type { FileNode } from '../types/files';
import { fileStorageService } from './FileStorageService';
import { isTemporaryFile, isTypstFile } from '../utils/fileUtils';
import { cleanContent } from '../utils/fileCommentUtils';
import type { DocumentStatistics, StatisticsOptions } from '../types/statistics';
import { TypstCompilerEngine } from '../extensions/typst.ts/TypstCompilerEngine';

const RESOURCE_EXT = /\.(mp4|webm|ogv|mov|mp3|ogg|oga|opus|wav|flac|m4a|png|jpg|jpeg|gif|webp|svg|pdf|bib|bibtex|cls|sty|dataurl|toml|csv|json|yml|yaml|xml|html|txt|md|markdown|cbor|typ|typst)$/i;

const WORDOMETER_IMPORT = '#import "@preview/wordometer:0.1.5": word-count, total-words, word-count-of';

const OUTPUT_BLOCK = `#pagebreak(weak: true)
#context {
  let total = total-words
  let headings = query(heading)
  let heading_words = 0
  for h in headings {
    let h_count = word-count-of(h.body)
    heading_words += h_count.words
  }
  [WORDOMETER_OUTPUT_START TOTAL_WORDS: #total HEADING_WORDS: #heading_words WORDOMETER_OUTPUT_END]
}`;

const PRIOR_INJECTION = /\n*#pagebreak\(weak: true\)\s*\n#context \{[\s\S]*?WORDOMETER_OUTPUT_END\][\s\S]*?\}\s*$/g;

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

        const storedFile = await fileStorageService.getFile(mainFile.id);
        if (!storedFile?.content) {
            throw new Error('Main file content not found');
        }

        const mainContent = this.decodeAndClean(storedFile.content);
        if (!mainContent.trim()) {
            throw new Error('Main file content is empty');
        }

        try {
            return await this.runWordometer(mainFile, allFiles, options, mainContent);
        } finally {
            this.terminate();
        }
    }

    private async runWordometer(
        mainFile: FileNode,
        allFiles: FileNode[],
        options: StatisticsOptions,
        mainContent: string
    ): Promise<DocumentStatistics> {
        const sources = await this.prepareSources(mainFile, allFiles, options.includeFiles, mainContent);
        const modifiedSource = this.injectWordometer(mainContent);
        const normalizedMainPath = mainFile.path.replace(/^\/+/, '');
        sources[`/${normalizedMainPath}`] = modifiedSource;

        const result = await this.compileWithDebug(`/${normalizedMainPath}`, sources, modifiedSource, options.verbose);
        const pageText = await this.extractLastPageText(result);
        return this.parseOutput(pageText, mainFile.name, options.verbose, modifiedSource);
    }

    private async compileWithDebug(
        mainPath: string,
        sources: Record<string, string | Uint8Array>,
        modifiedSource: string,
        verbose?: number
    ): Promise<Uint8Array> {
        const engine = this.getCompilerEngine();

        try {
            const result = await engine.compile(mainPath, sources, 'pdf');

            if (!result.output || !(result.output instanceof Uint8Array) || result.output.byteLength === 0) {
                throw new Error('Statistics compilation produced no output');
            }

            return result.output;
        } catch (error) {
            const baseMessage = error instanceof Error ? error.message : String(error);
            throw new Error(this.formatDebugMessage(baseMessage, modifiedSource, verbose));
        }
    }

    private formatDebugMessage(message: string, modifiedSource: string, verbose?: number): string {
        if (!verbose || verbose < 2) return message;
        return `${message}\n\n=== Modified Typst Source (with wordometer injection) ===\n\`\`\`typst\n${modifiedSource}\n\`\`\`\n=== End of Source ===`;
    }

    private injectWordometer(content: string): string {
        const stripped = content.replace(PRIOR_INJECTION, '');
        const lines = stripped.split('\n');

        const scan = this.scanDocument(lines);

        if (scan.existingWordometerIndex >= 0) {
            lines[scan.existingWordometerIndex] = WORDOMETER_IMPORT;
        } else {
            const insertIndex = scan.lastImportIndex >= 0 ? scan.lastImportIndex + 1 : 0;
            lines.splice(insertIndex, 0, WORDOMETER_IMPORT);
            if (scan.lastShowIndex >= insertIndex) scan.lastShowIndex += 1;
            scan.lastImportIndex = insertIndex;
        }

        if (!scan.hasShowWordCount) {
            const anchor = scan.lastShowIndex >= 0
                ? this.findStatementEnd(lines, scan.lastShowIndex)
                : scan.lastImportIndex;
            lines.splice(anchor + 1, 0, '', '#show: word-count');
        }

        lines.push('', OUTPUT_BLOCK, '');
        return lines.join('\n');
    }

    private scanDocument(lines: string[]): {
        lastImportIndex: number;
        lastShowIndex: number;
        existingWordometerIndex: number;
        hasShowWordCount: boolean;
    } {
        let lastImportIndex = -1;
        let lastShowIndex = -1;
        let existingWordometerIndex = -1;
        let hasShowWordCount = false;
        let inRawBlock = false;

        for (let i = 0; i < lines.length; i++) {
            const trimmed = lines[i].trim();

            if (trimmed.startsWith('```')) {
                inRawBlock = !inRawBlock;
                continue;
            }
            if (inRawBlock) continue;

            if (trimmed.startsWith('#import')) {
                lastImportIndex = i;
                if (trimmed.includes('@preview/wordometer')) existingWordometerIndex = i;
            } else if (trimmed.startsWith('#show:') || trimmed.startsWith('#show :')) {
                lastShowIndex = i;
                if (trimmed.includes('word-count')) hasShowWordCount = true;
            }
        }

        return { lastImportIndex, lastShowIndex, existingWordometerIndex, hasShowWordCount };
    }

    private findStatementEnd(lines: string[], startIndex: number): number {
        let depth = 0;

        for (let i = startIndex; i < lines.length; i++) {
            depth += this.netDepth(lines[i]);
            if (depth <= 0) return i;
        }

        return lines.length - 1;
    }

    private netDepth(line: string): number {
        let depth = 0;
        let inString = false;
        let stringChar = '';

        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            const prev = i > 0 ? line[i - 1] : '';

            if (inString) {
                if (ch === stringChar && prev !== '\\') inString = false;
                continue;
            }
            if (ch === '"' || ch === "'") {
                inString = true;
                stringChar = ch;
                continue;
            }
            if (ch === '(' || ch === '[' || ch === '{') depth++;
            else if (ch === ')' || ch === ']' || ch === '}') depth--;
        }

        return depth;
    }

    private async extractLastPageText(pdfBytes: Uint8Array): Promise<string> {
        const pdfjsLib = await import('pdfjs-dist');
        const pdf = await pdfjsLib.getDocument({ data: pdfBytes.slice().buffer }).promise;
        try {
            const page = await pdf.getPage(pdf.numPages);
            const textContent = await page.getTextContent();
            return (textContent.items as Array<{ str?: string }>)
                .map(item => item.str ?? '')
                .join(' ');
        } finally {
            await pdf.destroy();
        }
    }

    private parseOutput(
        output: string,
        mainFileName: string,
        verbose?: number,
        modifiedSource?: string
    ): DocumentStatistics {
        const total = this.matchNumber(output, /TOTAL_WORDS:\s*(\d+)/);
        const headers = this.matchNumber(output, /HEADING_WORDS:\s*(\d+)/);

        const stats: DocumentStatistics = {
            words: Math.max(0, total - headers),
            headers,
            captions: 0,
            mathInline: 0,
            mathDisplay: 0,
        };

        const lines = [
            `File: ${mainFileName}`,
            `Words in text: ${stats.words}`,
            `Headers: ${stats.headers}`,
            `Captions: ${stats.captions}`,
            `Math inline: ${stats.mathInline}`,
            `Math display: ${stats.mathDisplay}`,
            ``,
            `Total: ${total}`,
        ];

        if (verbose && verbose > 0) {
            lines.push('', '=== Extracted Last Page Text ===', output, '=== End of Output ===');
        }
        if (verbose && verbose >= 2 && modifiedSource) {
            lines.push('', '=== Modified Typst Source (with wordometer injection) ===', modifiedSource, '=== End of Source ===');
        }

        stats.rawOutput = lines.join('\n');
        return stats;
    }

    private matchNumber(text: string, pattern: RegExp): number {
        const match = text.match(pattern);
        return match ? parseInt(match[1], 10) : 0;
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
                sources[`/${file.path.replace(/^\/+/, '')}`] = file.content;
            }
        }

        const resourceFiles = allFiles.filter(f =>
            f.type === 'file' &&
            !f.isDeleted &&
            !isTemporaryFile(f.path) &&
            f.path !== mainFile.path &&
            RESOURCE_EXT.test(f.path)
        );

        for (const file of resourceFiles) {
            try {
                const content = await this.getFileContent(file);
                if (!content) continue;
                const key = `/${file.path.replace(/^\/+/, '')}`;
                sources[key] = typeof content === 'string' ? content : new Uint8Array(content);
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

        const visit = async (text: string): Promise<void> => {
            let match;
            while ((match = includePattern.exec(text)) !== null) {
                let filename = match[1];
                if (!isTypstFile(filename)) filename += '.typ';

                if (processedPaths.has(filename)) continue;
                processedPaths.add(filename);

                const file = allFiles.find(f =>
                    f.path === filename ||
                    f.path === `/${filename}` ||
                    f.path.endsWith(`/${filename}`)
                );
                if (!file) continue;

                const storedFile = await fileStorageService.getFile(file.id);
                if (!storedFile?.content) continue;

                const cleaned = this.decodeAndClean(storedFile.content);
                files.push({ path: filename, content: cleaned });
                await visit(cleaned);
            }
        };

        await visit(content);
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

    private decodeAndClean(content: ArrayBuffer | string): string {
        const text = typeof content === 'string' ? content : new TextDecoder().decode(content);
        const cleaned = cleanContent(text);
        return typeof cleaned === 'string' ? cleaned : new TextDecoder().decode(cleaned);
    }

    private async getFileContent(file: FileNode): Promise<ArrayBuffer | string | null> {
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