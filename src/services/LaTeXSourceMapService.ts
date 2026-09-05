// src/services/LaTeXSourceMapService.ts
import { createNamedLogger } from '@/logging';
import type {
	SourceMapData,
	SourceMapForwardResult,
	SourceMapReverseResult,
	SourceMapService,
} from '../types/sourceMap';
import { parseSynctex } from '../utils/latexSynctexParser';
import { filePathCacheService } from './FilePathCacheService';

const moduleLog = createNamedLogger('LaTeXSourceMapService');

class LaTeXSourceMapService implements SourceMapService {
	private data: SourceMapData | null = null;
	private mainFilePath = '';
	private listeners: Set<() => void> = new Set();

	loadFromBytes(bytes: Uint8Array): void {
		if (!this.isSourceMapEnabled()) {
			this.data = null;
			this.notifyListeners();
			return;
		}

		try {
			this.mainFilePath = filePathCacheService.getMainFilePath();
			this.data = parseSynctex(bytes);
			this.notifyListeners();
		} catch (error) {
			moduleLog.error('Failed to parse synctex:', error);
			this.data = null;
			this.notifyListeners();
		}
	}

	getMainFilePath(): string {
		return this.mainFilePath;
	}

	isAvailable(): boolean {
		return this.data !== null;
	}

	forward(
		file: string,
		line: number,
		column?: number,
	): SourceMapForwardResult | null {
		return this.data?.forward(this.toCompilePath(file), line, column) ?? null;
	}

	reverse(page: number, x: number, y: number): SourceMapReverseResult | null {
		return this.data?.reverse(page, x, y) ?? null;
	}

	clear(): void {
		this.data = null;
		this.notifyListeners();
	}

	addListener(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	private toCompilePath(file: string): string {
		const path = file.replace(/^\/+/, '');
		const mainDir = this.mainFilePath.replace(/^\/+/, '').replace(/[^/]*$/, '');

		return mainDir && path.startsWith(mainDir)
			? path.substring(mainDir.length)
			: path;
	}

	private isSourceMapEnabled(): boolean {
		const userId = localStorage.getItem('texlyre-current-user');
		const storageKey = userId
			? `texlyre-user-${userId}-settings`
			: 'texlyre-settings';
		try {
			const settings = JSON.parse(localStorage.getItem(storageKey) || '{}');
			return settings['latex-sourcemap-enable'] !== false;
		} catch {
			return true;
		}
	}

	private notifyListeners(): void {
		this.listeners.forEach((listener) => {
			listener();
		});
	}
}

export const latexSourceMapService = new LaTeXSourceMapService();
