// src/services/LaTeXStatisticsService.ts
import { WasmToolsEngine } from '../extensions/wasm-tools/WasmToolsEngine';
import type { FileNode } from '../types/files';
import { fileStorageService } from './FileStorageService';
import { isLatexFile } from '../utils/fileUtils';
import { cleanContent } from '../utils/fileCommentUtils';
import type {
	DocumentStatistics,
	StatisticsOptions,
	FileStatistics,
} from '../types/statistics';

const INCLUDE_PATTERN = /\\(?:input|include)\{([^}]+)\}/g;
const BRIEF_FILE_PATTERN = /^(\d+):\s+(?:File|Included file):\s+(.+)$/;
const FILE_HEADER_PATTERN = /^(?:File|Included file):\s+(.+)$/;

const FIELD_PATTERNS: Array<{
	marker: string;
	key: keyof FileStatistics & keyof DocumentStatistics;
}> = [
	{ marker: 'Words in text:', key: 'words' },
	{ marker: 'Words in headers:', key: 'headers' },
	{ marker: 'Number of math inlines:', key: 'mathInline' },
	{ marker: 'Number of math displayed:', key: 'mathDisplay' },
	{ marker: 'Number of headers:', key: 'numHeaders' },
	{ marker: 'Number of floats/tables/figures:', key: 'numFloats' },
];

class LaTeXStatisticsService {
	private engine: WasmToolsEngine | null = null;

	private getEngine(): WasmToolsEngine {
		if (!this.engine) this.engine = new WasmToolsEngine();
		return this.engine;
	}

	async getStatistics(
		mainFilePath: string,
		fileTree: FileNode[],
		options: StatisticsOptions,
	): Promise<DocumentStatistics> {
		const allFiles = this.collectFiles(fileTree);
		const normalizedPath = mainFilePath.replace(/^\/+/, '');

		const mainFile = allFiles.find(
			(f) =>
				f.path === mainFilePath ||
				f.path === `/${normalizedPath}` ||
				f.path.replace(/^\/+/, '') === normalizedPath ||
				f.name === normalizedPath ||
				f.path.endsWith(`/${normalizedPath}`),
		);

		if (!mainFile) {
			throw new Error(`Main file not found: ${mainFilePath}`);
		}

		await this.ensureContent(mainFile);
		const mainContent = await this.getCleanContent(mainFile);
		const mainFileName =
			mainFile.name || normalizedPath.split('/').pop() || 'main.tex';

		const includedFiles = options.includeFiles
			? await this.extractIncludedFiles(mainContent, allFiles)
			: [];

		const result = await this.getEngine().count(
			mainContent,
			options,
			includedFiles,
		);

		if (!result.success) {
			throw new Error(result.error || 'Statistics generation failed');
		}

		return this.parseStatistics(result.output!, options.merge, mainFileName);
	}

	terminate(): void {
		if (this.engine) {
			this.engine.terminate();
			this.engine = null;
		}
	}

	private collectFiles(nodes: FileNode[]): FileNode[] {
		const files: FileNode[] = [];
		const traverse = (list: FileNode[]) => {
			for (const node of list) {
				if (node.type === 'file') files.push(node);
				if (node.children) traverse(node.children);
			}
		};
		traverse(nodes);
		return files;
	}

	private async ensureContent(file: FileNode): Promise<void> {
		if (file.content) return;
		const stored = await fileStorageService.getFile(file.id);
		if (!stored?.content) throw new Error('File content not found');
		file.content = stored.content;
	}

	private async getCleanContent(file: FileNode): Promise<string> {
		await this.ensureContent(file);
		const text =
			typeof file.content === 'string'
				? file.content
				: new TextDecoder().decode(file.content!);
		return cleanContent(text) as string;
	}

	private async extractIncludedFiles(
		content: string,
		allFiles: FileNode[],
	): Promise<Array<{ path: string; content: string }>> {
		const files: Array<{ path: string; content: string }> = [];
		let match;

		INCLUDE_PATTERN.lastIndex = 0;
		while ((match = INCLUDE_PATTERN.exec(content)) !== null) {
			let filename = match[1];
			if (!isLatexFile(filename)) filename += '.tex';

			const file = allFiles.find(
				(f) =>
					f.path === filename ||
					f.path === `/${filename}` ||
					f.path.endsWith(`/${filename}`),
			);

			if (file) {
				files.push({
					path: filename,
					content: await this.getCleanContent(file),
				});
			}
		}

		return files;
	}

	private parseStatistics(
		output: string,
		merged: boolean,
		mainFileName: string,
	): DocumentStatistics {
		const stats: DocumentStatistics = {
			words: 0,
			headers: 0,
			captions: 0,
			mathInline: 0,
			mathDisplay: 0,
			rawOutput: output.replace(/\bmain\.tex\b/g, mainFileName),
		};

		const fileStatsMap = new Map<string, FileStatistics>();
		const lines = output.split('\n');

		let currentFileStat: FileStatistics | null = null;
		let inVerboseOutput = false;
		let inFileSummary = false;
		let inTotalSummary = false;

		const flushCurrent = () => {
			if (currentFileStat && this.fileHasContent(currentFileStat)) {
				fileStatsMap.set(currentFileStat.filename, currentFileStat);
			}
			currentFileStat = null;
		};

		for (const line of lines) {
			if (line.startsWith('Total')) continue;

			const briefMatch = line.match(BRIEF_FILE_PATTERN);
			if (briefMatch) {
				const filename = this.resolveFilename(
					briefMatch[2].trim(),
					mainFileName,
				);
				fileStatsMap.set(
					filename,
					this.makeFileStat(filename, parseInt(briefMatch[1], 10)),
				);
				continue;
			}

			if (line.startsWith('File: ') || line.startsWith('Included file: ')) {
				if (inFileSummary || !inVerboseOutput) flushCurrent();

				const fileMatch = line.match(FILE_HEADER_PATTERN);
				const filename = this.resolveFilename(
					fileMatch ? fileMatch[1].trim() : '',
					mainFileName,
				);

				currentFileStat = this.makeFileStat(filename);
				inVerboseOutput = line.includes('[');
				inFileSummary = !inVerboseOutput;
				inTotalSummary = false;
				continue;
			}

			if (line.includes('Encoding:')) {
				inVerboseOutput = false;
				if (currentFileStat) inFileSummary = true;
				continue;
			}

			if (line.includes('Sum of files:') || line.includes('File(s) total:')) {
				if (inFileSummary) flushCurrent();
				inFileSummary = false;
				inVerboseOutput = false;
				inTotalSummary = true;
				continue;
			}

			if (line.includes('Subcounts:') || line.includes('Format/colour codes')) {
				if (inFileSummary) flushCurrent();
				inFileSummary = false;
				inVerboseOutput = false;
				inTotalSummary = false;
				continue;
			}

			this.assignFieldValue(
				line,
				stats,
				currentFileStat,
				inFileSummary,
				inVerboseOutput,
				inTotalSummary,
			);
		}

		if (inFileSummary) flushCurrent();

		const fileStats = Array.from(fileStatsMap.values());
		if (fileStats.length > 0) {
			this.fillTotalsFromFiles(stats, fileStats);
			if (!merged) stats.fileStats = fileStats;
		}

		return stats;
	}

	private resolveFilename(name: string, mainFileName: string): string {
		return name === 'main.tex' ? mainFileName : name;
	}

	private makeFileStat(filename: string, words: number = 0): FileStatistics {
		return {
			filename,
			words,
			headers: 0,
			captions: 0,
			mathInline: 0,
			mathDisplay: 0,
			numHeaders: 0,
			numFloats: 0,
		};
	}

	private fileHasContent(stat: FileStatistics): boolean {
		return stat.words > 0 || stat.headers > 0 || stat.captions > 0;
	}

	private assignFieldValue(
		line: string,
		stats: DocumentStatistics,
		currentFileStat: FileStatistics | null,
		inFileSummary: boolean,
		inVerboseOutput: boolean,
		inTotalSummary: boolean,
	): void {
		if (line.includes('Files:')) {
			stats.files = this.parseLineValue(line);
			return;
		}

		const isCaptionLine =
			line.includes('Words outside text') ||
			line.includes('Words in float captions:');
		if (isCaptionLine) {
			this.assign(
				'captions',
				this.parseLineValue(line),
				stats,
				currentFileStat,
				inFileSummary,
				inVerboseOutput,
				inTotalSummary,
			);
			return;
		}

		for (const { marker, key } of FIELD_PATTERNS) {
			if (line.includes(marker)) {
				this.assign(
					key,
					this.parseLineValue(line),
					stats,
					currentFileStat,
					inFileSummary,
					inVerboseOutput,
					inTotalSummary,
				);
				return;
			}
		}
	}

	private assign(
		key: keyof FileStatistics & keyof DocumentStatistics,
		value: number,
		stats: DocumentStatistics,
		currentFileStat: FileStatistics | null,
		inFileSummary: boolean,
		inVerboseOutput: boolean,
		inTotalSummary: boolean,
	): void {
		if (inFileSummary && currentFileStat) {
			(currentFileStat as any)[key] = value;
		} else if (inTotalSummary || (!inVerboseOutput && !inFileSummary)) {
			(stats as any)[key] = value;
		}
	}

	private parseLineValue(line: string): number {
		return parseInt(line.split(':')[1]?.trim() || '0', 10);
	}

	private fillTotalsFromFiles(
		stats: DocumentStatistics,
		fileStats: FileStatistics[],
	): void {
		const sum = (key: keyof FileStatistics) =>
			fileStats.reduce((acc, file) => acc + ((file as any)[key] as number), 0);

		if (stats.words === 0) stats.words = sum('words');
		if (stats.headers === 0) stats.headers = sum('headers');
		if (stats.captions === 0) stats.captions = sum('captions');
		if (stats.mathInline === 0) stats.mathInline = sum('mathInline');
		if (stats.mathDisplay === 0) stats.mathDisplay = sum('mathDisplay');
		if (!stats.numHeaders) stats.numHeaders = sum('numHeaders');
		if (!stats.numFloats) stats.numFloats = sum('numFloats');
	}
}

export const latexStatisticsService = new LaTeXStatisticsService();
