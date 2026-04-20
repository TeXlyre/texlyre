// src/services/LaTeXService.ts
import { t } from '@/i18n';
import { nanoid } from 'nanoid';

import type { CompileResult } from '../extensions/swiftlatex/BaseEngine';
import { swiftLaTeXService, type SwiftEngineType } from '../extensions/swiftlatex/SwiftLaTeXService';
import { busyTexService } from '../extensions/texlyre-busytex/BusyTeXService';
import type { BusyTeXEngineType } from '../extensions/texlyre-busytex/BusyTeXEngine';
import type { FileNode } from '../types/files';
import { downloadFiles } from '../utils/zipUtils';
import { fileStorageService } from './FileStorageService';
import { notificationService } from './NotificationService';

export type EngineType = SwiftEngineType | BusyTeXEngineType;

function isBusyTeXEngine(engine: EngineType): engine is BusyTeXEngineType {
	return engine.startsWith('busytex-');
}

class LaTeXService {
	private currentEngineType: EngineType = 'pdftex';
	private statusListeners: Set<() => void> = new Set();
	private texliveEndpoint = '';

	setTexliveEndpoint(endpoint: string): void {
		this.texliveEndpoint = endpoint;
		swiftLaTeXService.setTexliveEndpoint(endpoint);
	}

	setStoreCache(store: boolean): void {
		swiftLaTeXService.setStoreCache(store);
		busyTexService.setStoreCache(store);
	}

	setStoreWorkingDirectory(store: boolean): void {
		swiftLaTeXService.setStoreWorkingDirectory(store);
		busyTexService.setStoreWorkingDirectory(store);
	}

	setFlattenMainDirectory(flatten: boolean): void {
		swiftLaTeXService.setFlattenMainDirectory(flatten);
	}

	setBusyTeXBundles(bundles: string[]): void {
		busyTexService.setSelectedBundles(bundles);
	}

	setBusyTeXEndpoint(endpoint: string): void {
		busyTexService.setTexliveEndpoint(endpoint);
	}

	async isBusyTeXBundleCached(bundleId: string): Promise<boolean> {
		return busyTexService.isBundleCached(bundleId);
	}

	async deleteBusyTeXBundle(bundleId: string): Promise<void> {
		await busyTexService.deleteBundle(bundleId);
	}

	async initialize(engineType: EngineType = 'pdftex'): Promise<void> {
		this.currentEngineType = engineType;
		if (isBusyTeXEngine(engineType)) {
			await busyTexService.initialize(engineType);
		} else {
			await swiftLaTeXService.initialize(engineType);
		}
		this.notifyStatusChange();
	}

	async setEngine(engineType: EngineType): Promise<void> {
		if (this.currentEngineType === engineType) return;
		this.currentEngineType = engineType;
		await this.initialize(engineType);
	}

	getCurrentEngineType(): EngineType {
		return this.currentEngineType;
	}

	getSupportedEngines(): EngineType[] {
		return ['pdftex', 'xetex', 'busytex-pdftex', 'busytex-xetex', 'busytex-luatex'];
	}

	getStatus(): string {
		return isBusyTeXEngine(this.currentEngineType)
			? busyTexService.getStatus()
			: swiftLaTeXService.getStatus();
	}

	isReady(): boolean {
		return isBusyTeXEngine(this.currentEngineType)
			? busyTexService.isReady()
			: swiftLaTeXService.isReady();
	}

	isCompiling(): boolean {
		return isBusyTeXEngine(this.currentEngineType)
			? busyTexService.isCompiling()
			: swiftLaTeXService.isCompiling();
	}

	addStatusListener(listener: () => void): () => void {
		this.statusListeners.add(listener);
		const swiftUnsub = swiftLaTeXService.addStatusListener(() => this.notifyStatusChange());
		const busyUnsub = busyTexService.addStatusListener(() => this.notifyStatusChange());
		return () => {
			this.statusListeners.delete(listener);
			swiftUnsub();
			busyUnsub();
		};
	}

	private notifyStatusChange(): void {
		this.statusListeners.forEach((l) => l());
	}

	async compileLaTeX(
		mainFileName: string,
		fileTree: FileNode[],
		format: string = 'pdf',
	): Promise<CompileResult> {
		const operationId = `latex-compile-${nanoid()}`;

		if (isBusyTeXEngine(this.currentEngineType)) {
			if (!busyTexService.isReady() || busyTexService.getCurrentEngineType() !== this.currentEngineType) {
				this.showLoadingNotification(t('Initializing BusyTeX engine...'), operationId, format);
				await busyTexService.initialize(this.currentEngineType as BusyTeXEngineType);
			}
			try {
				this.showLoadingNotification(t('Compiling LaTeX document...'), operationId, format);
				const nodesWithContent = await this.loadFileContents(this.collectAllFiles(fileTree));
				const result = await busyTexService.compile(mainFileName, nodesWithContent);
				this.reportCompileOutcome(result, operationId, format);
				return result;
			} catch (error) {
				return this.handleCompileError(error, busyTexService.getStatus(), operationId, format);
			}
		}

		if (!swiftLaTeXService.isReady() || swiftLaTeXService.getCurrentEngineType() !== this.currentEngineType) {
			this.showLoadingNotification(t('Initializing LaTeX engine...'), operationId, format);
			await swiftLaTeXService.initialize(this.currentEngineType as SwiftEngineType);
		}

		try {
			this.showLoadingNotification(t('Compiling LaTeX document...'), operationId, format);
			const result = await swiftLaTeXService.compile(mainFileName, fileTree);
			this.reportCompileOutcome(result, operationId, format);
			return result;
		} catch (error) {
			return this.handleCompileError(error, swiftLaTeXService.getStatus(), operationId, format);
		}
	}

	async clearCacheDirectories(): Promise<void> {
		const operationId = `latex-clear-cache-${nanoid()}`;
		try {
			this.showLoadingNotification(t('Clearing LaTeX cache...'), operationId);
			await swiftLaTeXService.clearCache();
			this.showSuccessNotification(t('LaTeX cache cleared successfully'), {
				operationId, duration: 2000,
			});
		} catch (error) {
			console.error('Error clearing cache directories:', error);
			this.showErrorNotification(t('Failed to clear LaTeX cache'), {
				operationId, duration: 3000,
			});
			throw error;
		}
	}

	async clearCacheAndCompile(
		mainFileName: string,
		fileTree: FileNode[],
		format: string = 'pdf',
	): Promise<CompileResult> {
		await this.clearCacheDirectories();
		return this.compileLaTeX(mainFileName, fileTree, format);
	}

	stopCompilation(): void {
		if (isBusyTeXEngine(this.currentEngineType)) {
			busyTexService.stopCompilation();
		} else {
			swiftLaTeXService.stopCompilation();
		}
	}

	async exportDocument(
		mainFileName: string,
		fileTree: FileNode[],
		options: {
			engine?: EngineType;
			format?: 'pdf' | 'dvi';
			includeLog?: boolean;
			includeDvi?: boolean;
			includeBbl?: boolean;
		} = {},
	): Promise<void> {
		const targetEngine = options.engine ?? this.currentEngineType;
		const operationId = `latex-export-${nanoid()}`;

		try {
			this.showLoadingNotification(t('Compiling for export...'), operationId);

			if (isBusyTeXEngine(targetEngine)) {
				if (!busyTexService.isReady() || busyTexService.getCurrentEngineType() !== targetEngine) {
					await busyTexService.initialize(targetEngine as BusyTeXEngineType);
				}
				const nodesWithContent = await this.loadFileContents(this.collectAllFiles(fileTree));
				const result = await busyTexService.compile(mainFileName, nodesWithContent);
				if (result.status === 0 && result.pdf) {
					const baseName = this.getBaseName(mainFileName);
					const files: Array<{ content: Uint8Array; name: string; mimeType: string }> = [
						{ content: result.pdf, name: `${baseName}.pdf`, mimeType: 'application/pdf' },
					];
					if (options.includeLog) {
						files.push({
							content: new TextEncoder().encode(result.log),
							name: `${baseName}.log`,
							mimeType: 'text/plain',
						});
					}
					await downloadFiles(files, baseName);
					this.showSuccessNotification(t('Export completed successfully'), {
						operationId, duration: 2000,
					});
				} else {
					this.showErrorNotification(t('Export failed'), { operationId, duration: 3000 });
				}
				return;
			}

			const result = await swiftLaTeXService.export(mainFileName, fileTree, {
				engine: targetEngine as SwiftEngineType,
				format: options.format,
				includeLog: options.includeLog,
				includeDvi: options.includeDvi,
				includeBbl: options.includeBbl,
			});

			if (result.status === 0 && result.files.length > 0) {
				await downloadFiles(result.files, this.getBaseName(mainFileName));
				this.showSuccessNotification(t('Export completed successfully'), {
					operationId, duration: 2000,
				});
			} else {
				this.showErrorNotification(t('Export failed'), { operationId, duration: 3000 });
			}
		} catch (error) {
			this.showErrorNotification(
				`Export error: ${error instanceof Error ? error.message : t('Unknown error')}`,
				{ operationId, duration: 5000 },
			);
			throw error;
		}
	}

	async reinitializeCurrentEngine(): Promise<void> {
		if (isBusyTeXEngine(this.currentEngineType)) {
			busyTexService.terminate();
			await busyTexService.initialize(this.currentEngineType as BusyTeXEngineType);
			return;
		}
		try {
			await swiftLaTeXService.reinitialize();
		} catch (error) {
			console.error('Failed to reinitialize engine:', error);
			throw error;
		}
	}

	private reportCompileOutcome(result: CompileResult, operationId: string, format: string): void {
		if (result.status === 0 && result.pdf && result.pdf.length > 0) {
			this.showSuccessNotification(t('LaTeX compilation completed successfully'), {
				operationId, duration: 3000, format,
			});
		} else {
			this.showErrorNotification(t('LaTeX compilation failed'), {
				operationId, duration: 5000, format,
			});
		}
	}

	private handleCompileError(
		error: unknown, engineStatus: string, operationId: string, format: string,
	): CompileResult {
		if (engineStatus === 'error' || engineStatus === 'unloaded') {
			this.showInfoNotification(t('Compilation stopped by user'), {
				operationId, duration: 2000, format,
			});
			return { pdf: undefined, status: -1, log: 'Compilation failed or was stopped by user.' };
		}
		this.showErrorNotification(
			`Compilation error: ${error instanceof Error ? error.message : t('Unknown error')}`,
			{ operationId, duration: 5000, format },
		);
		throw error;
	}

	private collectAllFiles(nodes: FileNode[]): FileNode[] {
		const result: FileNode[] = [];
		for (const n of nodes) {
			if (n.type === 'file') result.push(n);
			if (n.children?.length) result.push(...this.collectAllFiles(n.children));
		}
		return result;
	}

	private async loadFileContents(nodes: FileNode[]): Promise<FileNode[]> {
		const result: FileNode[] = [];
		for (const node of nodes) {
			if (node.content !== undefined) { result.push(node); continue; }
			try {
				const raw = await fileStorageService.getFile(node.id);
				if (raw?.content) result.push({ ...node, content: raw.content });
			} catch { }
		}
		return result;
	}

	private getBaseName(filePath: string): string {
		const name = filePath.split('/').pop() || filePath;
		return name.includes('.') ? name.split('.').slice(0, -1).join('.') : name;
	}

	showLoadingNotification(message: string, operationId?: string, format?: string): void {
		if (this.areNotificationsEnabled() && !format?.toLowerCase().includes('canvas')) {
			notificationService.showLoading(message, operationId);
		}
	}

	showSuccessNotification(
		message: string,
		options: { operationId?: string; duration?: number; data?: Record<string, any>; format?: string } = {},
	): void {
		if (this.areNotificationsEnabled() && !options.format?.toLowerCase().includes('canvas')) {
			notificationService.showSuccess(message, options);
		}
	}

	showErrorNotification(
		message: string,
		options: { operationId?: string; duration?: number; data?: Record<string, any>; format?: string } = {},
	): void {
		if (this.areNotificationsEnabled() && !options.format?.toLowerCase().includes('canvas')) {
			notificationService.showError(message, options);
		}
	}

	showInfoNotification(
		message: string,
		options: { operationId?: string; duration?: number; data?: Record<string, any>; format?: string } = {},
	): void {
		if (this.areNotificationsEnabled() && !options.format?.toLowerCase().includes('canvas')) {
			notificationService.showInfo(message, options);
		}
	}

	private areNotificationsEnabled(): boolean {
		const userId = localStorage.getItem('texlyre-current-user');
		const storageKey = userId ? `texlyre-user-${userId}-settings` : 'texlyre-settings';
		try {
			const settings = JSON.parse(localStorage.getItem(storageKey) || '{}');
			return settings['latex-notifications'] !== false;
		} catch {
			return true;
		}
	}
}

export const latexService = new LaTeXService();