import type { EditorView } from '@codemirror/view';
import type { DetectedLink } from './LinkDetector';
import { fileStorageService } from '../../../services/FileStorageService';

export class LinkNavigator {
    private currentFilePath: string = '';
    private pendingNavigation: { filePath: string; line: number } | null = null;

    setCurrentFilePath(filePath: string): void {
        this.currentFilePath = filePath;
    }

    async navigate(view: EditorView, link: DetectedLink): Promise<void> {
        switch (link.type) {
            case 'url':
                this.navigateToUrl(link.value);
                break;
            case 'file':
                await this.navigateToFile(link.value);
                break;
            case 'doi':
                this.navigateToDoi(link.value);
                break;
            case 'bibentry':
                await this.navigateToBibEntry(link.value);
                break;
        }
    }

    private navigateToUrl(url: string): void {
        let finalUrl = url.trim();
        if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
            finalUrl = 'https://' + finalUrl;
        }
        window.open(finalUrl, '_blank');
    }

    private async navigateToFile(filePath: string): Promise<void> {
        try {
            const resolvedPath = this.resolveFilePath(filePath);
            const allFiles = await fileStorageService.getAllFiles(false);

            const targetFile = allFiles.find(file =>
                file.path === resolvedPath ||
                file.path.endsWith(resolvedPath)
            );

            if (targetFile) {
                document.dispatchEvent(
                    new CustomEvent('navigate-to-compiled-file', {
                        detail: { filePath: targetFile.path }
                    })
                );
            } else {
                console.warn(`File not found: ${resolvedPath}`);
            }
        } catch (error) {
            console.error('Error navigating to file:', error);
        }
    }

    private navigateToDoi(doi: string): void {
        let cleanDoi = doi.trim();

        if (cleanDoi.startsWith('http://dx.doi.org/') || cleanDoi.startsWith('https://dx.doi.org/')) {
            cleanDoi = cleanDoi.replace(/^https?:\/\/dx\.doi\.org\//, 'https://doi.org/');
        } else if (!cleanDoi.startsWith('http://') && !cleanDoi.startsWith('https://')) {
            cleanDoi = `https://doi.org/${cleanDoi}`;
        }

        window.open(cleanDoi, '_blank');
    }

    private async navigateToBibEntry(key: string): Promise<void> {
        try {
            const allFiles = await fileStorageService.getAllFiles(false);
            const bibFiles = allFiles.filter(file =>
                file.name.endsWith('.bib') && !file.isDeleted
            );

            for (const bibFile of bibFiles) {
                const content = typeof bibFile.content === 'string'
                    ? bibFile.content
                    : new TextDecoder().decode(bibFile.content);

                const entryPattern = new RegExp(`@\\w+\\{\\s*${key}\\s*,`, 'i');
                const match = entryPattern.exec(content);

                if (match) {
                    const beforeMatch = content.substring(0, match.index);
                    const lines = beforeMatch.split('\n');
                    const lineNumber = lines.length + 1;

                    this.pendingNavigation = {
                        filePath: bibFile.path,
                        line: lineNumber
                    };

                    const handleEditorReady = (event: Event) => {
                        const customEvent = event as CustomEvent;
                        const { fileId } = customEvent.detail;

                        if (this.pendingNavigation) {
                            fileStorageService.getFile(fileId).then((file) => {
                                if (file && file.path === this.pendingNavigation!.filePath) {
                                    setTimeout(() => {
                                        document.dispatchEvent(
                                            new CustomEvent('codemirror-goto-line', {
                                                detail: {
                                                    line: this.pendingNavigation!.line,
                                                    fileId: fileId
                                                }
                                            })
                                        );
                                        this.pendingNavigation = null;
                                    }, 100);
                                }
                            });
                        }

                        document.removeEventListener('editor-ready', handleEditorReady);
                    };

                    document.addEventListener('editor-ready', handleEditorReady);

                    document.dispatchEvent(
                        new CustomEvent('navigate-to-compiled-file', {
                            detail: {
                                filePath: bibFile.path
                            }
                        })
                    );
                    return;
                }
            }

            console.warn(`Bibliography entry not found: ${key}`);
        } catch (error) {
            console.error('Error navigating to bib entry:', error);
        }
    }

    private resolveFilePath(filePath: string): string {
        if (filePath.startsWith('/')) {
            return filePath;
        }

        if (!this.currentFilePath) {
            return '/' + filePath;
        }

        const currentDir = this.currentFilePath.substring(
            0,
            this.currentFilePath.lastIndexOf('/')
        );

        return currentDir + '/' + filePath;
    }
}