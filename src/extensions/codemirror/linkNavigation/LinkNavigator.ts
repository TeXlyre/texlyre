// src/extensions/codemirror/linkNavigation/LinkNavigator.ts
import type { EditorView } from '@codemirror/view';
import { EditorView as CMEditorView } from '@codemirror/view';

import { fileStorageService } from '../../../services/FileStorageService';
import { filePathCacheService } from '../../../services/FilePathCacheService';
import {
	linkNavigationService,
	type DetectedLink,
} from '../../../services/LinkNavigationService';

interface LabelLocation {
	inCurrentFile: boolean;
	position?: number;
	length?: number;
	filePath?: string;
	line?: number;
}

export class LinkNavigator {
	setCurrentFilePath(filePath: string): void {
		linkNavigationService.setCurrentFilePath(filePath);
	}

	canNavigateToFile(filePath: string): Promise<boolean> {
		return linkNavigationService.canNavigateToFile(filePath);
	}

	navigateToTarget(link: DetectedLink): Promise<void> {
		return linkNavigationService.navigate(link);
	}

	async navigate(view: EditorView, link: DetectedLink): Promise<void> {
		if (link.type !== 'reference') {
			await linkNavigationService.navigate(link);
			return;
		}

		const location = await this.resolveReference(view, link);
		if (location) this.applyLocation(view, location);
	}

	private applyLocation(view: EditorView, location: LabelLocation): void {
		if (location.inCurrentFile && location.position !== undefined) {
			view.dispatch({
				selection: {
					anchor: location.position,
					head: location.position + (location.length ?? 0),
				},
				effects: [
					CMEditorView.scrollIntoView(location.position, { y: 'center' }),
				],
			});
			view.focus();
		} else if (location.filePath) {
			linkNavigationService.navigateToFileAndLine(
				location.filePath,
				location.line ?? 1,
			);
		}
	}

	private resolveReference(
		view: EditorView,
		link: DetectedLink,
	): Promise<LabelLocation | null> {
		const content = view.state.doc.toString();
		if (link.fileType === 'typst')
			return this.findTypstLabel(content, link.value);
		if (link.fileType === 'latex')
			return this.findLatexLabel(content, link.value);
		if (link.fileType === 'markdown')
			return this.findMarkdownReference(content, link.value);
		return Promise.resolve(null);
	}

	private async findLatexLabel(
		content: string,
		label: string,
	): Promise<LabelLocation | null> {
		const make = () =>
			new RegExp(`\\\\label\\{\\s*${this.escapeRegex(label)}\\s*\\}`, 'g');

		const match = make().exec(content);
		if (match) {
			return {
				inCurrentFile: true,
				position: match.index,
				length: match[0].length,
			};
		}

		return this.findLabelInOtherFiles(
			filePathCacheService.getTexLabels(),
			label,
			make,
		);
	}

	private async findTypstLabel(
		content: string,
		label: string,
	): Promise<LabelLocation | null> {
		const make = () =>
			new RegExp(`<${this.escapeRegex(label)}>(?!\\s*\\))`, 'g');

		const match = make().exec(content);
		if (match) {
			return {
				inCurrentFile: true,
				position: match.index,
				length: match[0].length,
			};
		}

		const location = await this.findLabelInOtherFiles(
			filePathCacheService.getTypstLabels(),
			label,
			make,
		);
		if (location) return location;

		await linkNavigationService.navigateToBibEntry(label);
		return null;
	}

	private async findMarkdownReference(
		content: string,
		target: string,
	): Promise<LabelLocation | null> {
		const [filePath, labelFromTarget] = target.includes('#')
			? target.split('#', 2)
			: ['', target];

		const label = decodeURIComponent(labelFromTarget || '').trim();
		if (!label) return null;

		const normalized = this.normalizeMarkdownAnchor(label);

		if (!filePath) {
			const match = this.findMarkdownAnchorInContent(content, normalized);
			if (match) {
				return {
					inCurrentFile: true,
					position: match.index,
					length: match.length,
				};
			}

			for (const [candidatePath, labels] of filePathCacheService
				.getMarkdownLabels()
				.entries()) {
				if (!labels.some((l) => this.normalizeMarkdownAnchor(l) === normalized))
					continue;
				const line = await this.findMarkdownLineInFile(
					candidatePath,
					normalized,
				);
				return {
					inCurrentFile: false,
					filePath: candidatePath,
					line: line ?? 1,
				};
			}

			return null;
		}

		const targetFile =
			await linkNavigationService.findFileByRelativePath(filePath);
		if (!targetFile) return null;

		const line = await this.findMarkdownLineInFile(targetFile.path, normalized);
		return { inCurrentFile: false, filePath: targetFile.path, line: line ?? 1 };
	}

	private async findLabelInOtherFiles(
		labelsByFile: Map<string, string[]>,
		label: string,
		make: () => RegExp,
	): Promise<LabelLocation | null> {
		for (const [filePath, labels] of labelsByFile.entries()) {
			if (!labels.includes(label)) continue;
			const line = await this.findLineInFile(filePath, make());
			return { inCurrentFile: false, filePath, line: line ?? 1 };
		}
		return null;
	}

	private async findLineInFile(
		filePath: string,
		pattern: RegExp,
	): Promise<number | null> {
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
		if (!match) return null;
		return content.substring(0, match.index).split('\n').length + 1;
	}

	private async findMarkdownLineInFile(
		filePath: string,
		normalized: string,
	): Promise<number | null> {
		const file = await filePathCacheService.findFileByPath('', filePath);
		if (!file) return null;

		const storedFile = await fileStorageService.getFile(file.id);
		if (!storedFile?.content) return null;

		const content =
			typeof storedFile.content === 'string'
				? storedFile.content
				: new TextDecoder().decode(storedFile.content);

		const match = this.findMarkdownAnchorInContent(content, normalized);
		if (!match) return null;
		return content.substring(0, match.index).split('\n').length + 1;
	}

	private findMarkdownAnchorInContent(
		content: string,
		normalized: string,
	): { index: number; length: number } | null {
		const lines = content.split('\n');
		let offset = 0;

		for (const line of lines) {
			const headingMatch = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);

			if (headingMatch) {
				const rawHeadingText = headingMatch[2];
				const explicit = /\{#([^}]+)\}\s*$/.exec(rawHeadingText);

				if (
					explicit &&
					this.normalizeMarkdownAnchor(explicit[1]) === normalized
				) {
					return {
						index: offset + line.indexOf(explicit[0]),
						length: explicit[0].length,
					};
				}

				const headingText = rawHeadingText
					.replace(/\s+\{#[^}]+\}\s*$/, '')
					.trim();
				if (this.slugifyMarkdownHeading(headingText) === normalized) {
					return { index: offset, length: line.length };
				}
			}

			const htmlAnchor = /<a\b[^>]*(?:id|name)=["']([^"']+)["'][^>]*>/gi;
			let m: RegExpExecArray | null;
			while ((m = htmlAnchor.exec(line))) {
				if (this.normalizeMarkdownAnchor(m[1]) === normalized) {
					return { index: offset + m.index, length: m[0].length };
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

	private escapeRegex(str: string): string {
		return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	}
}
