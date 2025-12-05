import type { EditorView } from '@codemirror/view';
import { EditorView as CMEditorView } from '@codemirror/view';
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
            case 'reference':
                if (link.fileType === 'typst') {
                    await this.navigateToTypstReference(view, link.value);
                } else {
                    await this.navigateToReference(view, link.value, link.fileType);
                }
                break;
        }
    }

    private async navigateToTypstReference(view: EditorView, label: string): Promise<void> {
        const foundLabel = await this.findTypstLabel(view, label);

        if (foundLabel) {
            if (foundLabel.inCurrentFile) {
                view.dispatch({
                    selection: { anchor: foundLabel.position, head: foundLabel.position + foundLabel.length },
                    effects: [CMEditorView.scrollIntoView(foundLabel.position, { y: 'center' })]
                });
                view.focus();
            } else if (foundLabel.filePath) {
                this.navigateToFileAndLine(foundLabel.filePath, foundLabel.line);
            }
            return;
        }

        await this.navigateToBibEntry(label);
    }

    private async findTypstLabel(view: EditorView, label: string): Promise<{
        inCurrentFile: boolean;
        position?: number;
        length?: number;
        filePath?: string;
        line?: number;
    } | null> {
        const currentContent = view.state.doc.toString();
        const labelPattern = new RegExp(`<${this.escapeRegex(label)}>(?!\\s*\\))`, 'g');

        const match = labelPattern.exec(currentContent);
        if (match) {
            return {
                inCurrentFile: true,
                position: match.index,
                length: match[0].length
            };
        }

        try {
            const allFiles = await fileStorageService.getAllFiles(false);
            const typstFiles = allFiles.filter(file =>
                (file.name.endsWith('.typ') || file.name.endsWith('.typst')) && !file.isDeleted
            );

            for (const file of typstFiles) {
                if (file.path === this.currentFilePath) continue;

                const content = typeof file.content === 'string'
                    ? file.content
                    : new TextDecoder().decode(file.content);

                const match = labelPattern.exec(content);
                if (match) {
                    const beforeMatch = content.substring(0, match.index);
                    const lines = beforeMatch.split('\n');
                    const lineNumber = lines.length + 1;

                    return {
                        inCurrentFile: false,
                        filePath: file.path,
                        line: lineNumber
                    };
                }
            }
        } catch (error) {
            console.error('Error searching for Typst label:', error);
        }

        return null;
    }

    private navigateToFileAndLine(filePath: string, lineNumber: number): void {
        this.pendingNavigation = {
            filePath,
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
                    filePath
                }
            })
        );
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

                const entryPattern = new RegExp(`@\\w+\\{\\s*${this.escapeRegex(key)}\\s*,`, 'i');
                const match = entryPattern.exec(content);

                if (match) {
                    const beforeMatch = content.substring(0, match.index);
                    const lines = beforeMatch.split('\n');
                    const lineNumber = lines.length + 1;

                    this.navigateToFileAndLine(bibFile.path, lineNumber);
                    return;
                }
            }

            console.warn(`Bibliography entry not found: ${key}`);
        } catch (error) {
            console.error('Error navigating to bib entry:', error);
        }
    }

    private async navigateToReference(view: EditorView, label: string, fileType: 'latex' | 'typst' | 'bib'): Promise<void> {
        const currentContent = view.state.doc.toString();

        const labelPattern = fileType === 'latex'
            ? new RegExp(`\\\\label\\{\\s*${this.escapeRegex(label)}\\s*\\}`, 'g')
            : new RegExp(`<${this.escapeRegex(label)}>(?!\\s*\\))`, 'g');

        const match = labelPattern.exec(currentContent);

        if (match) {
            const position = match.index;

            view.dispatch({
                selection: { anchor: position, head: position + match[0].length },
                effects: [CMEditorView.scrollIntoView(position, { y: 'center' })]
            });
            view.focus();
            return;
        }

        try {
            const allFiles = await fileStorageService.getAllFiles(false);
            const fileExtensions = fileType === 'latex' ? ['.tex', '.latex'] : ['.typ', '.typst'];
            const relevantFiles = allFiles.filter(file =>
                fileExtensions.some(ext => file.name.endsWith(ext)) && !file.isDeleted
            );

            for (const file of relevantFiles) {
                if (file.path === this.currentFilePath) continue;

                const content = typeof file.content === 'string'
                    ? file.content
                    : new TextDecoder().decode(file.content);

                const match = labelPattern.exec(content);

                if (match) {
                    const beforeMatch = content.substring(0, match.index);
                    const lines = beforeMatch.split('\n');
                    const lineNumber = lines.length + 1;

                    this.navigateToFileAndLine(file.path, lineNumber);
                    return;
                }
            }

            console.warn(`Label not found: ${label}`);
        } catch (error) {
            console.error('Error navigating to reference:', error);
        }
    }

    private escapeRegex(str: string): string {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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