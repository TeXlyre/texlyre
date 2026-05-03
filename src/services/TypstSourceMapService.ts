import { nanoid } from 'nanoid';

import type {
    SourceMapForwardResult,
    SourceMapReverseResult,
    SourceMapService,
} from '../types/sourceMap';
import type { TypstPageInfo } from '../types/typst';

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

class TypstSourceMapService implements SourceMapService {
    private forwardMap: Map<string, AnnotatedRect[]> | null = null;
    private reverseMap: Map<number, AnnotatedRect[]> | null = null;
    private fileInCodeBlock: Map<string, boolean[]> = new Map();
    private listeners: Set<() => void> = new Set();
    private worker: Worker | null = null;
    private currentJobId: string | null = null;

    loadFromSvg(svgString: string, pageInfos: TypstPageInfo[], sources: Record<string, string>, mainFile?: string): void {
        if (!this.isEnabled()) {
            this.clear();
            return;
        }

        const id = nanoid();
        this.currentJobId = id;
        const worker = this.getWorker();

        worker.postMessage({
            id,
            type: 'build',
            payload: { svg: svgString, pageInfos, sources, mainFile },
        });
    }

    isAvailable(): boolean {
        return this.forwardMap !== null && this.reverseMap !== null;
    }

    forward(file: string, line: number, _column?: number): SourceMapForwardResult | null {
        if (!this.forwardMap) return null;

        const normalized = file.replace(/^\/+/, '');
        let resolvedFile: string | null = null;
        for (const key of this.fileInCodeBlock.keys()) {
            if (key === normalized || key.endsWith(`/${normalized}`) || normalized.endsWith(`/${key}`)) {
                resolvedFile = key;
                break;
            }
        }
        if (!resolvedFile) return null;

        const exact = this.forwardMap.get(`${resolvedFile}:${line}`);
        if (exact && exact.length > 0) return this.toForwardResult(exact);

        const mask = this.fileInCodeBlock.get(resolvedFile);
        if (mask && mask[line - 1]) return null;

        let bestKey: string | null = null;
        let bestDelta = Number.POSITIVE_INFINITY;
        for (const key of this.forwardMap.keys()) {
            const colonIdx = key.lastIndexOf(':');
            if (key.substring(0, colonIdx) !== resolvedFile) continue;
            const delta = Math.abs(Number.parseInt(key.substring(colonIdx + 1), 10) - line);
            if (delta < bestDelta) {
                bestDelta = delta;
                bestKey = key;
            }
        }
        if (!bestKey) return null;
        const entries = this.forwardMap.get(bestKey);
        return entries && entries.length > 0 ? this.toForwardResult(entries) : null;
    }

    reverse(page: number, x: number, y: number): SourceMapReverseResult | null {
        if (!this.reverseMap) return null;

        const blocks = this.reverseMap.get(page);
        if (!blocks || blocks.length === 0) return null;

        let contained: AnnotatedRect | null = null;
        let containedArea = Number.POSITIVE_INFINITY;
        let closest: AnnotatedRect | null = null;
        let closestDistance = Number.POSITIVE_INFINITY;

        for (const block of blocks) {
            const right = block.x + block.width;
            const bottom = block.y + block.height;
            if (x >= block.x && x <= right && y >= block.y && y <= bottom) {
                const area = block.width * block.height;
                if (area < containedArea) {
                    containedArea = area;
                    contained = block;
                }
            } else {
                const cx = Math.max(block.x, Math.min(x, right));
                const cy = Math.max(block.y, Math.min(y, bottom));
                const dx = x - cx, dy = y - cy;
                const dist = dx * dx + dy * dy;
                if (dist < closestDistance) {
                    closestDistance = dist;
                    closest = block;
                }
            }
        }

        const block = contained || closest;
        return block ? { file: block.file, line: block.line } : null;
    }

    clear(): void {
        this.currentJobId = null;
        this.forwardMap = null;
        this.reverseMap = null;
        this.fileInCodeBlock = new Map();
        this.notify();
    }

    addListener(listener: () => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    private toForwardResult(entries: AnnotatedRect[]): SourceMapForwardResult {
        const page = entries[0].page;
        const onPage = entries.filter((e) => e.page === page);
        return { page, rects: onPage.map((e) => ({ x: e.x, y: e.y, width: e.width, height: e.height })) };
    }

    private getWorker(): Worker {
        if (this.worker) return this.worker;

        this.worker = new Worker(new URL('../extensions/typst.ts/typst-sourcemap-worker.ts', import.meta.url), { type: 'module' });

        this.worker.onmessage = (e: MessageEvent<{ id: string; type: 'done'; result: BuildResult } | { id: string; type: 'error'; error: string }>) => {
            const data = e.data;
            if (data.id !== this.currentJobId) return;

            if (data.type === 'done') {
                this.forwardMap = new Map(data.result.forwardEntries);
                this.reverseMap = new Map(data.result.reverseEntries);
                this.fileInCodeBlock = new Map(data.result.fileInCodeBlock);
                this.notify();
            } else {
                console.error('[TypstSourceMapService] Build failed:', data.error);
                this.forwardMap = null;
                this.reverseMap = null;
                this.fileInCodeBlock = new Map();
                this.notify();
            }
            this.currentJobId = null;
        };

        this.worker.onerror = (ev) => {
            console.error('[TypstSourceMapService] Worker error:', ev);
            this.forwardMap = null;
            this.reverseMap = null;
            this.fileInCodeBlock = new Map();
            this.currentJobId = null;
            this.worker = null;
            this.notify();
        };

        return this.worker;
    }

    private isEnabled(): boolean {
        const userId = localStorage.getItem('texlyre-current-user');
        const storageKey = userId ? `texlyre-user-${userId}-settings` : 'texlyre-settings';
        try {
            const settings = JSON.parse(localStorage.getItem(storageKey) || '{}');
            return settings['typst-sourcemap-enabled'] !== false;
        } catch {
            return true;
        }
    }

    private notify(): void {
        this.listeners.forEach((l) => l());
    }
}

export const typstSourceMapService = new TypstSourceMapService();