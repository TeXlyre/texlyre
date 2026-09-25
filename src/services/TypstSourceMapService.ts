// src/services/TypstSourceMapService.ts
import { nanoid } from 'nanoid';

import { createNamedLogger } from '@/logging';
import type {
	SourceMapForwardResult,
	SourceMapReverseResult,
	SourceMapService,
} from '../types/sourceMap';

const moduleLog = createNamedLogger('TypstSourceMapService');

interface AnnotatedRect {
	page: number;
	file: string;
	line: number;
	x: number;
	y: number;
	width: number;
	height: number;
}

interface BuildResult {
	forwardEntries: Array<[string, AnnotatedRect[]]>;
	reverseEntries: Array<[number, AnnotatedRect[]]>;
	fileInCodeBlock: Array<[string, boolean[]]>;
}

type IdleGlobal = typeof globalThis & {
	requestIdleCallback?: (callback: () => void) => number;
	cancelIdleCallback?: (id: number) => void;
};

function scheduleIdle(callback: () => void): () => void {
	const idleGlobal = globalThis as IdleGlobal;
	let idleId: number | null = null;
	const timer = window.setTimeout(() => {
		if (idleGlobal.requestIdleCallback) {
			idleId = idleGlobal.requestIdleCallback(callback);
		} else {
			callback();
		}
	}, 750);

	return () => {
		clearTimeout(timer);
		if (idleId !== null) idleGlobal.cancelIdleCallback?.(idleId);
	};
}

class TypstSourceMapService implements SourceMapService {
	private forwardMap: Map<string, AnnotatedRect[]> | null = null;
	private reverseMap: Map<number, AnnotatedRect[]> | null = null;
	private fileInCodeBlock = new Map<string, boolean[]>();
	private listeners = new Set<() => void>();
	private worker: Worker | null = null;
	private currentJobId: string | null = null;
	private cancelPendingStart: (() => void) | null = null;

	loadFromArtifact(
		artifact: Uint8Array,
		sources: Record<string, string>,
		mainFile?: string,
	): void {
		if (!this.isEnabled()) {
			this.clear();
			return;
		}

		this.cancelPendingBuild();
		this.forwardMap = null;
		this.reverseMap = null;
		this.fileInCodeBlock = new Map();
		this.notifyListeners();

		const id = nanoid();
		this.currentJobId = id;

		this.cancelPendingStart = scheduleIdle(() => {
			this.cancelPendingStart = null;
			if (this.currentJobId !== id) return;

			const worker = this.getWorker();
			worker.postMessage(
				{
					id,
					type: 'build',
					payload: { artifact, sources, mainFile },
				},
				[artifact.buffer],
			);
		});
	}

	cancelPendingBuild(): void {
		this.cancelPendingStart?.();
		this.cancelPendingStart = null;

		if (this.currentJobId && this.worker) {
			this.worker.terminate();
			this.worker = null;
		}
		this.currentJobId = null;
	}

	isAvailable(): boolean {
		return this.forwardMap !== null && this.reverseMap !== null;
	}

	forward(file: string, line: number): SourceMapForwardResult | null {
		if (!this.forwardMap) return null;

		const normalized = file.replace(/^\/+/, '');
		const keys = Array.from(this.fileInCodeBlock.keys());
		const resolvedFile =
			keys.find((key) => key === normalized) ??
			keys.find(
				(key) =>
					key.endsWith(`/${normalized}`) || normalized.endsWith(`/${key}`),
			);
		if (!resolvedFile) return null;

		const exact = this.forwardMap.get(`${resolvedFile}:${line}`);
		if (exact?.length) return this.toForwardResult(exact);

		const mask = this.fileInCodeBlock.get(resolvedFile);
		if (mask?.[line - 1]) return null;

		let best: AnnotatedRect[] | null = null;
		let bestDelta = Number.POSITIVE_INFINITY;
		for (const [key, entries] of this.forwardMap) {
			const colon = key.lastIndexOf(':');
			if (key.slice(0, colon) !== resolvedFile) continue;
			const delta = Math.abs(Number.parseInt(key.slice(colon + 1), 10) - line);
			if (delta < bestDelta) {
				bestDelta = delta;
				best = entries;
			}
		}
		return best?.length ? this.toForwardResult(best) : null;
	}

	reverse(page: number, x: number, y: number): SourceMapReverseResult | null {
		const blocks = this.reverseMap?.get(page);
		if (!blocks?.length) return null;

		let best: AnnotatedRect | null = null;
		let bestDistance = Number.POSITIVE_INFINITY;
		for (const block of blocks) {
			const right = block.x + block.width;
			const bottom = block.y + block.height;
			if (x >= block.x && x <= right && y >= block.y && y <= bottom) {
				return { file: block.file, line: block.line };
			}
			const cx = Math.max(block.x, Math.min(x, right));
			const cy = Math.max(block.y, Math.min(y, bottom));
			const distance = (x - cx) ** 2 + (y - cy) ** 2;
			if (distance < bestDistance) {
				bestDistance = distance;
				best = block;
			}
		}
		return best ? { file: best.file, line: best.line } : null;
	}

	clear(): void {
		this.cancelPendingBuild();
		this.forwardMap = null;
		this.reverseMap = null;
		this.fileInCodeBlock = new Map();
		this.notifyListeners();
	}

	addListener(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	private getWorker(): Worker {
		if (this.worker) return this.worker;
		const worker = new Worker(
			new URL(
				'../extensions/typst.ts/typst-sourcemap-worker.ts',
				import.meta.url,
			),
			{ type: 'module' },
		);
		worker.onmessage = (
			event: MessageEvent<
				| { id: string; type: 'done'; result: BuildResult }
				| { id: string; type: 'error'; error: string }
			>,
		) => {
			if (event.data.id !== this.currentJobId) return;
			if (event.data.type === 'done') {
				this.forwardMap = new Map(event.data.result.forwardEntries);
				this.reverseMap = new Map(event.data.result.reverseEntries);
				this.fileInCodeBlock = new Map(event.data.result.fileInCodeBlock);
			} else {
				moduleLog.error('Build failed:', event.data.error);
				this.forwardMap = null;
				this.reverseMap = null;
				this.fileInCodeBlock = new Map();
			}
			this.currentJobId = null;
			this.notifyListeners();
		};
		worker.onerror = (event) => {
			moduleLog.error('Worker error:', event);
			this.worker = null;
			this.currentJobId = null;
		};
		this.worker = worker;
		return worker;
	}

	private toForwardResult(entries: AnnotatedRect[]): SourceMapForwardResult {
		const page = entries[0].page;
		return {
			page,
			rects: entries
				.filter((entry) => entry.page === page)
				.map(({ x, y, width, height }) => ({ x, y, width, height })),
		};
	}

	isEnabled(): boolean {
		const userId = localStorage.getItem('texlyre-current-user');
		const storageKey = userId
			? `texlyre-user-${userId}-settings`
			: 'texlyre-settings';
		try {
			const settings = JSON.parse(localStorage.getItem(storageKey) || '{}');
			return settings['typst-sourcemap-enable'] !== false;
		} catch {
			return true;
		}
	}

	private notifyListeners(): void {
		for (const listener of this.listeners) listener();
	}
}

export const typstSourceMapService = new TypstSourceMapService();
