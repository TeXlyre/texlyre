// src/extensions/codemirror/linkNavigation/LinkNavigator.ts
import type { EditorView } from '@codemirror/view';
import { EditorView as CMEditorView } from '@codemirror/view';

import { isBibFile } from '../../../utils/fileUtils';
import { gotoEditor } from '../../../utils/editorNavigator';
import { fileStorageService } from '../../../services/FileStorageService';
import { filePathCacheService } from '../../../services/FilePathCacheService';
import type { DetectedLink } from './LinkDetector';

export class LinkNavigator {
	private currentFilePath: string = '';

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
				} else if (link.fileType === 'latex') {
					await this.navigateToLatexReference(view, link.value);
				}
				break;
		}
	}

	async canNavigateToFile(filePath: string): Promise<boolean> {
		return !!(await this.findTargetFile(filePath));
	}

	private async findTargetFile(filePath: string) {
		return await filePathCacheService.findFileByPath(
			this.currentFilePath,
			filePath,
		);
	}

	private async navigateToTypstReference(
		view: EditorView,
		label: string,
	): Promise<void> {
		const foundLabel = await this.findTypstLabel(view, label);

		if (foundLabel) {
			if (foundLabel.inCurrentFile) {
				view.dispatch({
					selection: {
						anchor: foundLabel.position,
						head: foundLabel.position! + foundLabel.length!,
					},
					effects: [
						CMEditorView.scrollIntoView(foundLabel.position!, {
							y: 'center',
						}),
					],
				});
				view.focus();
			} else if (foundLabel.filePath) {
				this.navigateToFileAndLine(foundLabel.filePath, foundLabel.line!);
			}

			return;
		}

		await this.navigateToBibEntry(label);
	}

	private async navigateToLatexReference(
		view: EditorView,
		label: string,
	): Promise<void> {
		const foundLabel = await this.findLatexLabel(view, label);

		if (foundLabel) {
			if (foundLabel.inCurrentFile) {
				view.dispatch({
					selection: {
						anchor: foundLabel.position,
						head: foundLabel.position! + foundLabel.length!,
					},
					effects: [
						CMEditorView.scrollIntoView(foundLabel.position!, {
							y: 'center',
						}),
					],
				});
				view.focus();
			} else if (foundLabel.filePath) {
				this.navigateToFileAndLine(foundLabel.filePath, foundLabel.line!);
			}
		} else {
			console.warn(`Label not found: ${label}`);
		}
	}

	private async findLatexLabel(
		view: EditorView,
		label: string,
	): Promise<{
		inCurrentFile: boolean;
		position?: number;
		length?: number;
		filePath?: string;
		line?: number;
	} | null> {
		const currentContent = view.state.doc.toString();
		const labelPattern = new RegExp(
			`\\\\label\\{\\s*${this.escapeRegex(label)}\\s*\\}`,
			'g',
		);

		const currentMatch = labelPattern.exec(currentContent);
		if (currentMatch) {
			return {
				inCurrentFile: true,
				position: currentMatch.index,
				length: currentMatch[0].length,
			};
		}

		const labelsByFile = filePathCacheService.getTexLabels();

		for (const [filePath, labels] of labelsByFile.entries()) {
			if (filePath === this.currentFilePath) continue;
			if (!labels.includes(label)) continue;

			const line = await this.findLineInFile(
				filePath,
				new RegExp(`\\\\label\\{\\s*${this.escapeRegex(label)}\\s*\\}`, 'g'),
			);

			if (line !== null) {
				return {
					inCurrentFile: false,
					filePath,
					line,
				};
			}

			return {
				inCurrentFile: false,
				filePath,
				line: 1,
			};
		}

		return null;
	}

	private async findTypstLabel(
		view: EditorView,
		label: string,
	): Promise<{
		inCurrentFile: boolean;
		position?: number;
		length?: number;
		filePath?: string;
		line?: number;
	} | null> {
		const currentContent = view.state.doc.toString();
		const labelPattern = new RegExp(
			`<${this.escapeRegex(label)}>(?!\\s*\\))`,
			'g',
		);

		const currentMatch = labelPattern.exec(currentContent);
		if (currentMatch) {
			return {
				inCurrentFile: true,
				position: currentMatch.index,
				length: currentMatch[0].length,
			};
		}

		const labelsByFile = filePathCacheService.getTypstLabels();

		for (const [filePath, labels] of labelsByFile.entries()) {
			if (filePath === this.currentFilePath) continue;
			if (!labels.includes(label)) continue;

			const line = await this.findLineInFile(
				filePath,
				new RegExp(`<${this.escapeRegex(label)}>(?!\\s*\\))`, 'g'),
			);

			if (line !== null) {
				return {
					inCurrentFile: false,
					filePath,
					line,
				};
			}

			return {
				inCurrentFile: false,
				filePath,
				line: 1,
			};
		}

		return null;
	}

	private async findLineInFile(
		filePath: string,
		pattern: RegExp,
	): Promise<number | null> {
		try {
			const file = await filePathCacheService.findFileByPath('', filePath);
			if (!file) return null;

			const storedFile = await fileStorageService.getFile(file.id);
			if (!storedFile?.content) return null;

			const content =
				typeof storedFile.content === 'string'
					? storedFile.content
					: new TextDecoder().decode(storedFile.content);

			pattern.lastIndex = 0;
			const match = pattern.exec(content);

			if (!match) {
				return null;
			}

			return content.substring(0, match.index).split('\n').length + 1;
		} catch (error) {
			console.error(`Error finding line in file: ${filePath}`, error);
			return null;
		}
	}

	private navigateToFileAndLine(filePath: string, lineNumber: number): void {
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

	private navigateToUrl(url: string): void {
		let finalUrl = url.trim();

		if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
			finalUrl = 'https://' + finalUrl;
		}

		window.open(finalUrl, '_blank');
	}

	private async navigateToFile(filePath: string): Promise<void> {
		try {
			const targetFile = await this.findTargetFile(filePath);

			if (targetFile) {
				document.dispatchEvent(
					new CustomEvent('navigate-to-compiled-file', {
						detail: { filePath: targetFile.path },
					}),
				);
			} else {
				console.warn(`File not found: ${filePath}`);
			}
		} catch (error) {
			console.error('Error navigating to file:', error);
		}
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

	private async navigateToBibEntry(key: string): Promise<void> {
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

	private escapeRegex(str: string): string {
		return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	}
}
