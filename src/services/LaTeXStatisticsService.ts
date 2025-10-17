import { WebPerlRunner, TexCount } from 'wasm-latex-tools';
import type { FileNode } from '../types/files';
import { fileStorageService } from './FileStorageService';
import { fileCommentProcessor } from '../utils/fileCommentProcessor';
import type { DocumentStatistics } from '../types/statistics';

class LaTeXStatisticsService {
    private runner: WebPerlRunner | null = null;
    private texCount: TexCount | null = null;
    private initPromise: Promise<void> | null = null;

    private async ensureInitialized(): Promise<void> {
        if (this.texCount) return;

        if (!this.initPromise) {
            this.initPromise = this.initialize();
        }

        return this.initPromise;
    }

    private async initialize(): Promise<void> {
        const basePath = window.location.origin + window.location.pathname.replace(/\/$/, '');

        this.runner = new WebPerlRunner({
            webperlBasePath: `${basePath}/core/webperl`,
            perlScriptsPath: `${basePath}/core/perl`,
            verbose: false
        });

        await this.runner.initialize();
        this.texCount = new TexCount(this.runner, false);
    }

    async getStatistics(mainFilePath: string, fileTree: FileNode[]): Promise<DocumentStatistics> {
        await this.ensureInitialized();

        const allFiles = this.collectFiles(fileTree);
        const normalizedPath = mainFilePath.replace(/^\/+/, '');

        // Try multiple matching strategies
        const mainFile = allFiles.find(f =>
            f.path === mainFilePath ||
            f.path === `/${normalizedPath}` ||
            f.path.replace(/^\/+/, '') === normalizedPath ||
            f.name === normalizedPath ||
            f.path.endsWith(`/${normalizedPath}`)
        );

        if (!mainFile) {
            console.error('Available files:', allFiles.map(f => ({ path: f.path, name: f.name })));
            console.error('Looking for:', { mainFilePath, normalizedPath });
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
        const includedFiles = await this.extractIncludedFiles(mainContent, allFiles);

        const result = await this.texCount!.count({
            input: mainContent,
            sum: true,
            includeFiles: includedFiles.length > 0,
            additionalFiles: includedFiles
        });

        if (!result.success) {
            throw new Error(result.error || 'Statistics generation failed');
        }

        return this.parseStatistics(result.output);
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

    private parseStatistics(output: string): DocumentStatistics {
        const stats: DocumentStatistics = {
            words: 0,
            headers: 0,
            captions: 0,
            mathInline: 0,
            mathDisplay: 0
        };

        const lines = output.split('\n');
        for (const line of lines) {
            if (line.includes('Words in text:')) {
                stats.words = parseInt(line.split(':')[1]?.trim() || '0', 10);
            } else if (line.includes('Words in headers:')) {
                stats.headers = parseInt(line.split(':')[1]?.trim() || '0', 10);
            } else if (line.includes('Words in float captions:')) {
                stats.captions = parseInt(line.split(':')[1]?.trim() || '0', 10);
            } else if (line.includes('Number of math inlines:')) {
                stats.mathInline = parseInt(line.split(':')[1]?.trim() || '0', 10);
            } else if (line.includes('Number of math displayed:')) {
                stats.mathDisplay = parseInt(line.split(':')[1]?.trim() || '0', 10);
            } else if (line.includes('Files:')) {
                stats.files = parseInt(line.split(':')[1]?.trim() || '0', 10);
            }
        }

        return stats;
    }
}

export const latexStatisticsService = new LaTeXStatisticsService();