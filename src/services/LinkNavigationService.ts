// src/services/linkNavigationService.ts
import { isBibFile } from '../utils/fileUtils';
import { gotoEditor } from '../utils/editorNavigator';
import { fileStorageService } from './FileStorageService';
import { filePathCacheService } from './FilePathCacheService';

export interface DetectedLink {
	from: number;
	to: number;
	type: 'url' | 'file' | 'doi' | 'bibentry' | 'reference';
	value: string;
	fileType: 'latex' | 'typst' | 'bib' | 'markdown';
}

class LinkNavigationService {
	private currentFilePath = '';

	setCurrentFilePath(filePath: string): void {
		this.currentFilePath = filePath;
	}

	async navigate(link: DetectedLink): Promise<void> {
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

	async canNavigateToFile(filePath: string): Promise<boolean> {
		return !!(await this.findTargetFile(filePath));
	}

	async navigateToBibEntry(key: string): Promise<void> {
		try {
			const cachedFiles = await filePathCacheService.getCachedFiles();
			const bibFiles = filePathCacheService
				.flattenFiles(cachedFiles)
				.filter(
					(file) =>
						file.type === 'file' && isBibFile(file.name) && !file.isDeleted,
				);

			for (const bibFile of bibFiles) {
				const storedFile = await fileStorageService.getFile(bibFile.id);
				if (!storedFile?.content) continue;

				const content =
					typeof storedFile.content === 'string'
						? storedFile.content
						: new TextDecoder().decode(storedFile.content);

				const entryPattern = new RegExp(
					`@\\w+\\{\\s*${this.escapeRegex(key)}\\s*,`,
					'i',
				);
				const match = entryPattern.exec(content);

				if (match) {
					const lineNumber =
						content.substring(0, match.index).split('\n').length + 1;
					this.navigateToFileAndLine(bibFile.path, lineNumber);
					return;
				}
			}

			console.warn(`Bibliography entry not found: ${key}`);
		} catch (error) {
			console.error('Error navigating to bib entry:', error);
		}
	}

	navigateToFileAndLine(filePath: string, lineNumber: number): void {
		const handleEditorReady = (event: Event) => {
			const { fileId } = (event as CustomEvent).detail;
			fileStorageService.getFile(fileId).then((file) => {
				if (file?.path !== filePath) return;
				document.removeEventListener('editor-ready', handleEditorReady);
				gotoEditor({ kind: 'file', fileId }, { line: lineNumber });
			});
		};

		document.addEventListener('editor-ready', handleEditorReady);
		document.dispatchEvent(
			new CustomEvent('navigate-to-compiled-file', { detail: { filePath } }),
		);
	}

	async findFileByRelativePath(filePath: string) {
		return this.findTargetFile(this.stripFileFragment(filePath));
	}

	private async findTargetFile(filePath: string) {
		return filePathCacheService.findFileByPath(this.currentFilePath, filePath);
	}

	private navigateToUrl(url: string): void {
		let finalUrl = url.trim();

		if (this.isSpecialUrl(finalUrl)) {
			window.open(finalUrl, '_blank');
			return;
		}

		if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
			finalUrl = `https://${finalUrl}`;
		}

		window.open(finalUrl, '_blank');
	}

	private async navigateToFile(filePath: string): Promise<void> {
		try {
			const targetFile = await this.findTargetFile(
				this.stripFileFragment(filePath),
			);

			if (targetFile) {
				document.dispatchEvent(
					new CustomEvent('navigate-to-compiled-file', {
						detail: { filePath: targetFile.path },
					}),
				);
			} else {
				console.warn(`File not found: ${this.stripFileFragment(filePath)}`);
			}
		} catch (error) {
			console.error('Error navigating to file:', error);
		}
	}

	private stripFileFragment(filePath: string): string {
		return filePath.split('#')[0];
	}

	private navigateToDoi(doi: string): void {
		let cleanDoi = doi.trim();

		if (
			cleanDoi.startsWith('http://dx.doi.org/') ||
			cleanDoi.startsWith('https://dx.doi.org/')
		) {
			cleanDoi = cleanDoi.replace(
				/^https?:\/\/dx\.doi\.org\//,
				'https://doi.org/',
			);
		} else if (
			!cleanDoi.startsWith('http://') &&
			!cleanDoi.startsWith('https://')
		) {
			cleanDoi = `https://doi.org/${cleanDoi}`;
		}

		window.open(cleanDoi, '_blank');
	}

	private isSpecialUrl(url: string): boolean {
		return /^(mailto:|tel:|ftp:|data:)/i.test(url);
	}

	private escapeRegex(str: string): string {
		return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	}
}

export const linkNavigationService = new LinkNavigationService();
