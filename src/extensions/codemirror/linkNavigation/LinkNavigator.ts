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
				} else if (link.fileType === 'markdown') {
					this.navigateToMarkdownReference(view, link.value);
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

	async navigateToTarget(link: DetectedLink): Promise<void> {
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

	private async navigateToMarkdownReference(
		view: EditorView,
		target: string,
	): Promise<void> {
		const [filePath, labelFromTarget] = target.includes('#')
			? target.split('#', 2)
			: ['', target];

		const label = decodeURIComponent(labelFromTarget || '').trim();
		if (!label) return;

		const foundLabel = await this.findMarkdownLabel(view, label, filePath);

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
			console.warn(`Markdown anchor not found: ${target}`);
		}
	}

	private async findMarkdownLabel(
		view: EditorView,
		label: string,
		targetFilePath?: string,
	): Promise<{
		inCurrentFile: boolean;
		position?: number;
		length?: number;
		filePath?: string;
		line?: number;
	} | null> {
		const normalizedLabel = this.normalizeMarkdownAnchor(label);

		// Same-file reference: [hello](#description)
		if (!targetFilePath) {
			const currentContent = view.state.doc.toString();
			const currentMatch = this.findMarkdownAnchorInContent(
				currentContent,
				normalizedLabel,
			);

			if (currentMatch) {
				return {
					inCurrentFile: true,
					position: currentMatch.index,
					length: currentMatch.length,
				};
			}

			const labelsByFile = filePathCacheService.getMarkdownLabels();

			for (const [filePath, labels] of labelsByFile.entries()) {
				if (filePath === this.currentFilePath) continue;

				const hasLabel = labels.some(
					(item) => this.normalizeMarkdownAnchor(item) === normalizedLabel,
				);

				if (!hasLabel) continue;

				const line = await this.findMarkdownLineInFile(
					filePath,
					normalizedLabel,
				);

				return {
					inCurrentFile: false,
					filePath,
					line: line ?? 1,
				};
			}

			return null;
		}

		// Cross-file reference: [hello](../hello.md#description)
		const targetFile = await this.findTargetFile(targetFilePath);
		if (!targetFile) return null;

		const line = await this.findMarkdownLineInFile(
			targetFile.path,
			normalizedLabel,
		);

		return {
			inCurrentFile: false,
			filePath: targetFile.path,
			line: line ?? 1,
		};
	}

	private async findMarkdownLineInFile(
		filePath: string,
		normalizedLabel: string,
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

			const match = this.findMarkdownAnchorInContent(content, normalizedLabel);
			if (!match) return null;

			return content.substring(0, match.index).split('\n').length + 1;
		} catch (error) {
			console.error(
				`Error finding Markdown anchor in file: ${filePath}`,
				error,
			);
			return null;
		}
	}

	private findMarkdownAnchorInContent(
		content: string,
		normalizedLabel: string,
	): { index: number; length: number } | null {
		const lines = content.split('\n');
		let offset = 0;

		for (const line of lines) {
			const headingMatch = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);

			if (headingMatch) {
				const rawHeadingText = headingMatch[2];
				const explicitAnchorMatch = /\{#([^}]+)\}\s*$/.exec(rawHeadingText);

				if (
					explicitAnchorMatch &&
					this.normalizeMarkdownAnchor(explicitAnchorMatch[1]) ===
						normalizedLabel
				) {
					return {
						index: offset + line.indexOf(explicitAnchorMatch[0]),
						length: explicitAnchorMatch[0].length,
					};
				}

				const headingText = rawHeadingText
					.replace(/\s+\{#[^}]+\}\s*$/, '')
					.trim();

				if (this.slugifyMarkdownHeading(headingText) === normalizedLabel) {
					return {
						index: offset,
						length: line.length,
					};
				}
			}

			const htmlAnchorPattern = /<a\b[^>]*(?:id|name)=["']([^"']+)["'][^>]*>/gi;

			let htmlAnchorMatch: RegExpExecArray | null;
			while ((htmlAnchorMatch = htmlAnchorPattern.exec(line))) {
				if (
					this.normalizeMarkdownAnchor(htmlAnchorMatch[1]) === normalizedLabel
				) {
					return {
						index: offset + htmlAnchorMatch.index,
						length: htmlAnchorMatch[0].length,
					};
				}
			}

			offset += line.length + 1;
		}

		return null;
	}

	private normalizeMarkdownAnchor(value: string): string {
		return decodeURIComponent(value.trim().replace(/^#/, '')).toLowerCase();
	}

	private slugifyMarkdownHeading(value: string): string {
		return value
			.trim()
			.toLowerCase()
			.replace(/[`*_~[\]()]/g, '')
			.replace(/[^\p{L}\p{N}\s_-]/gu, '')
			.replace(/\s+/g, '-')
			.replace(/-+/g, '-')
			.replace(/^-|-$/g, '');
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
			const cleanFilePath = this.stripFileFragment(filePath);
			const targetFile = await this.findTargetFile(cleanFilePath);

			if (targetFile) {
				document.dispatchEvent(
					new CustomEvent('navigate-to-compiled-file', {
						detail: { filePath: targetFile.path },
					}),
				);
			} else {
				console.warn(`File not found: ${cleanFilePath}`);
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

	private isSpecialUrl(url: string): boolean {
		return /^(mailto:|tel:|ftp:|data:)/i.test(url);
	}

	private escapeRegex(str: string): string {
		return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	}
}
