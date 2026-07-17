// src/services/TypstService.ts
import { nanoid } from 'nanoid';

import { t } from '@/i18n';
import type {
	TypstCompileResult,
	TypstOutputFormat,
	TypstPdfOptions,
	TypstPageInfo,
} from '../types/typst';
import type { FileNode } from '../types/files';
import { fileStorageService } from './FileStorageService';
import { notificationService } from './NotificationService';
import { typstSourceMapService } from './TypstSourceMapService';
import { cleanContent } from '../utils/fileCommentUtils';
import { TypstCompilerEngine } from '../extensions/typst.ts/TypstCompilerEngine';
import {
	isTypstFile,
	isTemporaryFile,
	toArrayBuffer,
} from '../utils/fileUtils';
import { downloadFiles } from '../utils/zipUtils';

type CompilationStatus =
	| 'unloaded'
	| 'loading'
	| 'ready'
	| 'compiling'
	| 'error';

const RESOURCE_EXT =
	/\.(mp4|webm|ogv|mov|mp3|ogg|oga|opus|wav|flac|m4a|png|jpg|jpeg|gif|webp|svg|pdf|bib|bibtex|cls|sty|dataurl|toml|csv|json|yml|yaml|xml|html|txt|md|markdown|cbor)$/i;

const OUTPUT_DIR = '/.texlyre_src/__output';
const OUTPUT_DIRS = ['/.texlyre_src', OUTPUT_DIR];

const DIAG_PATTERN =
	/SourceDiagnostic\s*\{\s*severity:\s*(\w+),\s*span:\s*(.+?),\s*message:\s*"([^"]+)"(?:.*?)hints:\s*\[([^\]]*)\]/g;
const HINT_PATTERN = /"([^"]+)"/g;

class TypstService {
	private status: CompilationStatus = 'unloaded';
	private statusListeners: Set<() => void> = new Set();
	private defaultFormat: TypstOutputFormat = 'pdf';
	private compilationAbortController: AbortController | null = null;
	private compilerEngine: TypstCompilerEngine = new TypstCompilerEngine();

	async initialize(): Promise<void> {
		if (this.status === 'ready') return;
		if (this.status === 'loading') return this.waitForReady();

		this.setStatus('loading');
		try {
			await this.compilerEngine.ping();
			this.setStatus('ready');
		} catch (error) {
			this.setStatus('error');
			throw new Error(`Failed to initialize Typst worker: ${error}`);
		}
	}

	private async waitForReady(): Promise<void> {
		return new Promise((resolve, reject) => {
			const check = () => {
				if (this.status === 'ready') resolve();
				else if (this.status === 'error')
					reject(new Error('Typst worker failed to load'));
				else setTimeout(check, 100);
			};
			check();
		});
	}

	async compileTypst(
		mainFileName: string,
		fileTree: FileNode[],
		format: TypstOutputFormat = this.defaultFormat,
		pdfOptions?: TypstPdfOptions,
		options: { allowRemoteUrls?: boolean } = {},
	): Promise<TypstCompileResult> {
		if (!this.isReady()) await this.initialize();

		const operationId = `typst-compile-${nanoid()}`;
		const normalizedMain = this.normalizePath(mainFileName);
		const signal = this.beginOperation();

		try {
			this.notify(
				'info',
				t('Preparing files for compilation...'),
				operationId,
				format,
			);

			const { mainContent, sources } = await this.prepareSources(
				normalizedMain,
				fileTree,
				signal,
			);

			if (!mainContent?.trim()) {
				return this.failCompile(
					operationId,
					format,
					normalizedMain,
					`Main file '${normalizedMain}' is empty or not found`,
				);
			}

			this.notify(
				'info',
				t('Compiling {typesetter} to {format}...', {
					typesetter: t('Typst'),
					format: format.toUpperCase(),
				}),
				operationId,
				format,
			);

			const { output, diagnostics, pageInfos } = await this.runCompile(
				normalizedMain,
				sources,
				format,
				pdfOptions,
				signal,
				options,
			);

			const log = this.formatDiagnostics(diagnostics);
			const hasErrors = this.hasErrorDiagnostics(diagnostics);

			if (hasErrors || (output instanceof Uint8Array && output.length === 0)) {
				return this.failCompile(
					operationId,
					format,
					normalizedMain,
					log || 'Compilation failed with errors',
				);
			}

			const result = this.createSuccessResult(output, format, log, pageInfos);
			await this.saveCompilationOutput(normalizedMain, result);
			this.updateSourceMap(format, output, pageInfos, sources, normalizedMain);

			this.notify(
				'success',
				t('{typesetter} {format} compilation completed', {
					typesetter: t('Typst'),
					format: format.toUpperCase(),
				}),
				operationId,
				format,
				3000,
			);

			return result;
		} catch (error) {
			if (this.isCancellation(error)) {
				typstSourceMapService.clear();
				return { status: 1, log: 'Compilation was cancelled', format };
			}
			const log = this.logFromError(error);
			return this.failCompile(operationId, format, normalizedMain, log);
		} finally {
			this.endOperation();
		}
	}

	async exportDocument(
		mainFileName: string,
		fileTree: FileNode[],
		format: TypstOutputFormat = this.defaultFormat,
		pdfOptions?: TypstPdfOptions,
		includeLog = false,
		compileOptions: { allowRemoteUrls?: boolean } = {},
	): Promise<void> {
		const operationId = `typst-export-${nanoid()}`;

		if (!this.isReady()) await this.initialize();

		const normalizedMain = this.normalizePath(mainFileName);
		const signal = this.beginOperation();

		try {
			this.notify(
				'info',
				t('Preparing files for export...'),
				operationId,
				format,
			);
			const { sources } = await this.prepareSources(
				normalizedMain,
				fileTree,
				signal,
			);

			this.notify(
				'info',
				t('Compiling {typesetter} to {format}...', {
					typesetter: t('Typst'),
					format: format.toUpperCase(),
				}),
				operationId,
				format,
			);

			const { output, diagnostics } = await this.runCompile(
				normalizedMain,
				sources,
				format,
				pdfOptions,
				signal,
				compileOptions,
			);

			if (this.hasErrorDiagnostics(diagnostics)) {
				this.notify('error', t('Export failed'), operationId, format, 3000);
				return;
			}

			const baseName = this.getBaseName(normalizedMain);
			const files = this.buildExportFiles(
				output,
				format,
				baseName,
				includeLog ? this.formatDiagnostics(diagnostics) : null,
			);

			if (files.length > 0) {
				await downloadFiles(files, baseName);
			}

			this.notify(
				'success',
				t('Export completed successfully'),
				operationId,
				format,
				2000,
			);
		} catch (error) {
			if (this.isCancellation(error)) return;

			const message =
				error instanceof Error ? error.message : t('Unknown error');
			this.notify(
				'error',
				`Export error: ${message}`,
				operationId,
				format,
				5000,
			);
		} finally {
			this.endOperation();
		}
	}

	setDefaultFormat(format: TypstOutputFormat): void {
		this.defaultFormat = format;
	}
	getDefaultFormat(): TypstOutputFormat {
		return this.defaultFormat;
	}
	getStatus(): string {
		return this.status;
	}
	isReady(): boolean {
		return this.status === 'ready';
	}
	isCompiling(): boolean {
		return this.status === 'compiling';
	}

	addStatusListener(listener: () => void): () => void {
		this.statusListeners.add(listener);
		return () => this.statusListeners.delete(listener);
	}

	stopCompilation(): void {
		this.compilationAbortController?.abort();
		if (this.isCompiling()) this.setStatus('ready');
	}

	async clearCache(): Promise<void> {
		this.compilerEngine.terminate();
		await this.clearOutputDirectories();
	}

	private beginOperation(): AbortSignal {
		this.setStatus('compiling');
		this.compilationAbortController = new AbortController();
		return this.compilationAbortController.signal;
	}

	private endOperation(): void {
		this.setStatus('ready');
		this.compilationAbortController = null;
	}

	private isCancellation(error: unknown): boolean {
		return error instanceof Error && /cancel/i.test(error.message);
	}

	private async clearOutputDirectories(): Promise<void> {
		try {
			const allFiles = await fileStorageService.getAllFiles(
				false,
				false,
				false,
			);
			const filesToDelete = allFiles.filter(
				(f) =>
					f.type === 'file' &&
					(f.path.startsWith('/.texlyre_src/__output/') ||
						f.path.startsWith('/.texlyre_src/__work/')),
			);
			if (filesToDelete.length > 0) {
				await fileStorageService.batchDeleteFiles(
					filesToDelete.map((f) => f.id),
					{ showDeleteDialog: false, hardDelete: true },
				);
			}
		} catch (error) {
			console.error('Failed to clear output directories:', error);
		}
	}

	private async runCompile(
		mainFilePath: string,
		sources: Record<string, string | Uint8Array>,
		format: TypstOutputFormat,
		pdfOptions: TypstPdfOptions | undefined,
		signal: AbortSignal,
		options: { allowRemoteUrls?: boolean } = {},
	): Promise<{
		output: Uint8Array | string;
		diagnostics?: any[];
		pageInfos?: TypstPageInfo[];
	}> {
		const result = await this.compilerEngine.compile(
			mainFilePath,
			sources,
			format,
			pdfOptions,
			signal,
			options,
		);

		return {
			output: result.output,
			diagnostics: result.diagnostics,
			pageInfos: result.pageInfos as TypstPageInfo[] | undefined,
		};
	}

	private hasErrorDiagnostics(diagnostics?: any[]): boolean {
		return !!diagnostics?.some((d) => {
			const sev = d.severity;
			return (
				sev === 'error' ||
				sev === 'Error' ||
				(typeof sev === 'object' && sev?.Error !== undefined)
			);
		});
	}

	private async failCompile(
		operationId: string,
		format: TypstOutputFormat,
		mainFile: string,
		log: string,
	): Promise<TypstCompileResult> {
		const result: TypstCompileResult = { status: 1, log, format };
		this.handleCompilationError(operationId, format);
		await this.saveCompilationLog(mainFile, log);
		typstSourceMapService.clear();
		return result;
	}

	private logFromError(error: unknown): string {
		const diagnostics = this.parseDiagnosticsFromError(error);
		if (diagnostics.length > 0) return this.formatDiagnostics(diagnostics);
		return error instanceof Error ? error.message : t('Unknown error');
	}

	private updateSourceMap(
		format: TypstOutputFormat,
		output: Uint8Array | string,
		pageInfos: TypstPageInfo[] | undefined,
		sources: Record<string, string | Uint8Array>,
		mainFile: string,
	): void {
		if (format === 'canvas' && typeof output === 'string' && pageInfos) {
			const stringSources: Record<string, string> = {};
			const decoder = new TextDecoder();
			for (const [path, content] of Object.entries(sources)) {
				if (!path.endsWith('.typ')) continue;
				if (typeof content === 'string') {
					stringSources[path] = content;
				} else {
					try {
						stringSources[path] = decoder.decode(content);
					} catch {}
				}
			}
			typstSourceMapService.loadFromSvg(
				output,
				pageInfos,
				stringSources,
				mainFile,
			);
		} else {
			typstSourceMapService.clear();
		}
	}

	private buildExportFiles(
		output: Uint8Array | string,
		format: TypstOutputFormat,
		baseName: string,
		log: string | null,
	): Array<{ content: Uint8Array; name: string; mimeType: string }> {
		const files: Array<{
			content: Uint8Array;
			name: string;
			mimeType: string;
		}> = [];

		if (
			(format === 'pdf' || format === 'canvas-pdf') &&
			output instanceof Uint8Array
		) {
			files.push({
				content: output,
				name: `${baseName}.pdf`,
				mimeType: 'application/pdf',
			});
		} else if (
			(format === 'svg' || format === 'canvas') &&
			typeof output === 'string'
		) {
			files.push({
				content: new TextEncoder().encode(output),
				name: `${baseName}.svg`,
				mimeType: 'image/svg+xml',
			});
		}

		if (log !== null) {
			files.push({
				content: new TextEncoder().encode(log),
				name: `${baseName}.log`,
				mimeType: 'text/plain',
			});
		}

		return files;
	}

	private createSuccessResult(
		output: Uint8Array | string,
		format: TypstOutputFormat,
		log: string,
		pageInfos?: TypstPageInfo[],
	): TypstCompileResult {
		const result: TypstCompileResult = {
			status: 0,
			log: log || 'Compilation successful',
			format,
		};

		switch (format) {
			case 'pdf':
				result.pdf = output as Uint8Array;
				break;
			case 'svg':
				result.svg = output as string;
				break;
			case 'canvas':
				result.canvas = new TextEncoder().encode(output as string);
				break;
			case 'canvas-pdf':
				result.canvas = output as Uint8Array;
				break;
		}

		if (pageInfos) result.pageInfos = pageInfos;
		return result;
	}

	private async prepareSources(
		mainFileName: string,
		fileTree: FileNode[],
		signal: AbortSignal,
	): Promise<{
		mainContent: string;
		sources: Record<string, string | Uint8Array>;
	}> {
		const relevantFiles = this.filterRelevantFiles(fileTree, mainFileName);
		const sources: Record<string, string | Uint8Array> = {};
		let mainContent = '';

		for (const fileNode of relevantFiles) {
			if (signal.aborted) throw new Error(t('Compilation cancelled'));

			try {
				const content = await this.getFileContent(fileNode);
				if (!content) continue;

				const cleaned = cleanContent(content);
				const normalizedPath = this.normalizePath(fileNode.path);

				if (this.isMainFile(fileNode, mainFileName)) {
					mainContent =
						typeof cleaned === 'string'
							? cleaned
							: new TextDecoder().decode(cleaned);
				}

				sources[normalizedPath] =
					typeof cleaned === 'string' ? cleaned : new Uint8Array(cleaned);
			} catch (error) {
				console.warn(`Failed to process file ${fileNode.path}:`, error);
			}
		}

		if (!mainContent) {
			for (const [path, content] of Object.entries(sources)) {
				if (
					isTypstFile(path) &&
					typeof content === 'string' &&
					content.trim()
				) {
					mainContent = content;
					break;
				}
			}
		}

		return { mainContent, sources };
	}

	private filterRelevantFiles(
		fileTree: FileNode[],
		mainFileName: string,
	): FileNode[] {
		const allFiles = this.collectFiles(fileTree);
		const mainDir = this.getDirectoryPath(this.normalizePath(mainFileName));

		return allFiles.filter((file) => {
			if (file.type !== 'file' || file.isDeleted || isTemporaryFile(file.path))
				return false;

			const normalizedPath = this.normalizePath(file.path);
			if (this.isMainFile(file, mainFileName) || isTypstFile(normalizedPath))
				return true;
			if (RESOURCE_EXT.test(normalizedPath)) return true;
			if (this.getDirectoryPath(normalizedPath) === mainDir) return true;

			return false;
		});
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

	private async getFileContent(
		file: FileNode,
	): Promise<ArrayBuffer | string | null> {
		if (file.content !== undefined) return file.content;
		try {
			const stored = await fileStorageService.getFile(file.id);
			return stored?.content || null;
		} catch (error) {
			console.warn(`Failed to retrieve content for ${file.path}:`, error);
			return null;
		}
	}

	private isMainFile(file: FileNode, mainFileName: string): boolean {
		const normMain = this.normalizePath(mainFileName);
		const normFile = this.normalizePath(file.path);
		return (
			normFile === normMain ||
			file.name === mainFileName ||
			file.name === normMain.split('/').pop()
		);
	}

	private normalizePath(path: string): string {
		return path.replace(/^\/+/, '');
	}

	private getDirectoryPath(path: string): string {
		const lastSlash = path.lastIndexOf('/');
		return lastSlash >= 0 ? path.substring(0, lastSlash) : '';
	}

	private async saveCompilationOutput(
		mainFile: string,
		result: TypstCompileResult,
	): Promise<void> {
		try {
			const outputFiles = this.createOutputFiles(mainFile, result);
			if (outputFiles.length === 0) return;
			await this.ensureOutputDirectoriesExist();
			await fileStorageService.batchStoreFiles(outputFiles, {
				showConflictDialog: false,
			});
		} catch (error) {
			console.error('Failed to save compilation output:', error);
		}
	}

	private createOutputFiles(
		mainFile: string,
		result: TypstCompileResult,
	): FileNode[] {
		const baseName = this.getBaseName(mainFile);
		const files: FileNode[] = [];

		if (result.pdf && result.format === 'pdf') {
			const buffer =
				result.pdf instanceof Uint8Array ? result.pdf.buffer : result.pdf;
			files.push(
				this.createFileNode(`${baseName}.pdf`, buffer, 'application/pdf', true),
			);
		} else if (
			(result.svg || result.canvas) &&
			(result.format === 'svg' || result.format === 'canvas')
		) {
			const content =
				result.format === 'svg'
					? result.svg!
					: new TextDecoder().decode(result.canvas!);
			files.push(
				this.createFileNode(
					`${baseName}.svg`,
					new TextEncoder().encode(content).buffer,
					'image/svg+xml',
					true,
				),
			);
		}

		files.push(this.createLogFile(baseName, result.log));
		return files;
	}

	private createFileNode(
		name: string,
		content: ArrayBuffer | ArrayBufferLike,
		mimeType: string,
		isBinary: boolean,
	): FileNode {
		const buffer =
			content instanceof ArrayBuffer
				? content
				: (toArrayBuffer(content) as ArrayBuffer);
		return {
			id: nanoid(),
			name,
			path: `${OUTPUT_DIR}/${name}`,
			type: 'file',
			content: buffer,
			lastModified: Date.now(),
			size: buffer.byteLength,
			mimeType,
			isBinary,
			excludeFromSync: true,
		};
	}

	private createLogFile(baseName: string, log: string): FileNode {
		return this.createFileNode(
			`${baseName}.log`,
			new TextEncoder().encode(log).buffer,
			'text/plain',
			false,
		);
	}

	private async saveCompilationLog(
		mainFile: string,
		log: string,
	): Promise<void> {
		try {
			await this.ensureOutputDirectoriesExist();
			const logFile = this.createLogFile(this.getBaseName(mainFile), log);
			await fileStorageService.batchStoreFiles([logFile], {
				showConflictDialog: false,
			});
		} catch (error) {
			console.error('Failed to save compilation log:', error);
		}
	}

	private async ensureOutputDirectoriesExist(): Promise<void> {
		const existingFiles = await fileStorageService.getAllFiles();
		const existingPaths = new Set(existingFiles.map((f) => f.path));
		const missing = OUTPUT_DIRS.filter((dir) => !existingPaths.has(dir)).map(
			(dir) => ({
				id: nanoid(),
				name: dir.split('/').pop()!,
				path: dir,
				type: 'directory' as const,
				lastModified: Date.now(),
			}),
		);

		if (missing.length > 0) {
			await fileStorageService.batchStoreFiles(missing, {
				showConflictDialog: false,
			});
		}
	}

	private getBaseName(filePath: string): string {
		const fileName = filePath.split('/').pop() || filePath;
		return fileName.includes('.')
			? fileName.split('.').slice(0, -1).join('.')
			: fileName;
	}

	private handleCompilationError(
		operationId: string,
		format: TypstOutputFormat,
	): void {
		this.setStatus('ready');
		this.notify(
			'error',
			t('{typesetter} compilation failed', {
				typesetter: t('Typst'),
			}),
			operationId,
			format,
			5000,
		);
	}

	private notify(
		type: 'info' | 'success' | 'error',
		message: string,
		operationId?: string,
		format?: TypstOutputFormat,
		duration?: number,
	): void {
		if (!this.areNotificationsEnabled()) return;
		if (format?.toLowerCase().includes('canvas')) return;

		switch (type) {
			case 'info':
				notificationService.showLoading(message, operationId);
				break;
			case 'success':
				notificationService.showSuccess(message, { operationId, duration });
				break;
			case 'error':
				notificationService.showError(message, { operationId, duration });
				break;
		}
	}

	private parseDiagnosticsFromError(error: any): any[] {
		const errorStr = String(error?.message || error);
		const diagnostics: any[] = [];

		let match: RegExpExecArray | null;
		DIAG_PATTERN.lastIndex = 0;
		while ((match = DIAG_PATTERN.exec(errorStr)) !== null) {
			const hints: string[] = [];
			let hintMatch: RegExpExecArray | null;
			HINT_PATTERN.lastIndex = 0;
			while ((hintMatch = HINT_PATTERN.exec(match[4])) !== null) {
				hints.push(hintMatch[1]);
			}

			diagnostics.push({
				severity: match[1],
				// span: match[2].trim(),
				message: match[3],
				hints,
			});
		}

		return diagnostics;
	}

	private formatDiagnostics(diagnostics?: any[]): string {
		if (!diagnostics || diagnostics.length === 0)
			return 'Compilation successful';

		const lines: string[] = [];
		for (const diag of diagnostics) {
			lines.push(this.formatDiagnosticLine(diag));
			if (Array.isArray(diag.hints)) {
				for (const hint of diag.hints) lines.push(`  hint: ${hint}`);
			}
		}
		return lines.join('\n');
	}

	private formatDiagnosticLine(diag: any): string {
		const message = diag.message || t('Unknown error');
		const severity =
			typeof diag.severity === 'string' ? diag.severity.toLowerCase() : 'error';
		const prefix =
			severity === 'error'
				? 'error'
				: severity === 'warning'
					? 'warning'
					: 'info';

		let location = '';
		if (diag.path) {
			location = diag.path.replace(/^\//, '');
			if (diag.range) location += `:${diag.range.split(/[:-]/)[0]}`;
		} else if (diag.span) {
			location = String(diag.span).replace(/^Span\(|\)$/g, '');
		}

		return location
			? `${prefix}[${location}]: ${message}`
			: `${prefix}: ${message}`;
	}

	private areNotificationsEnabled(): boolean {
		try {
			const userId = localStorage.getItem('texlyre-current-user');
			const storageKey = userId
				? `texlyre-user-${userId}-settings`
				: 'texlyre-settings';
			const settings = JSON.parse(localStorage.getItem(storageKey) || '{}');
			return settings['typst-notifications'] !== false;
		} catch {
			return true;
		}
	}

	private setStatus(status: CompilationStatus): void {
		this.status = status;
		this.statusListeners.forEach((l) => {
			l();
		});
	}
}

export const typstService = new TypstService();
