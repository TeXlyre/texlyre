import type {
    SourceMapData,
    SourceMapForwardResult,
    SourceMapReverseResult,
    SourceMapService,
} from '../types/sourceMap';
import type { TypstPageInfo } from '../types/typst';

interface Overlay {
    text: string;
    page: number;
    x: number;
    y: number;
    width: number;
    height: number;
    inCodeCluster: boolean;
}

interface AnnotatedRect {
    page: number;
    file: string;
    line: number;
    x: number;
    y: number;
    width: number;
    height: number;
}

interface SourceFileIndex {
    lines: string[];
    inCodeBlock: boolean[];
}

const TRANSLATE_REGEX = /translate\(\s*(-?[\d.]+)(?:\s*[, ]\s*(-?[\d.]+))?\s*\)/;
const SCALE_REGEX = /scale\(\s*(-?[\d.]+)(?:\s*[, ]\s*(-?[\d.]+))?\s*\)/;
const FENCE_REGEX = /^\s*```/;
const RAW_CALL_REGEX = /#raw\s*\(/;

const CONTEXT_WINDOW = 6;
const SHORT_TEXT_THRESHOLD = 12;
const AMBIGUITY_MARGIN = 2;
const EXACT_MATCH = 5;
const TIGHT_MATCH = 3;
const TIGHT_RATIO = 1.4;
const SCORE_MAIN = 100;
const SCORE_LOCAL = 50;
const X_TOLERANCE = 2;
const CLUSTER_NEIGHBORS_REQUIRED = 2;

function normalize(s: string): string {
    return s.replace(/\s+/g, ' ').trim();
}

function accumulateTransform(el: Element, root: Element): { tx: number; ty: number; sx: number; sy: number } {
    let tx = 0, ty = 0, sx = 1, sy = 1;
    for (let node: Element | null = el; node && node !== root; node = node.parentElement) {
        const transform = node.getAttribute('transform');
        if (!transform) continue;
        const t = TRANSLATE_REGEX.exec(transform);
        const s = SCALE_REGEX.exec(transform);
        if (t) {
            tx = Number.parseFloat(t[1]) + tx * (s ? Number.parseFloat(s[1]) : 1);
            ty = Number.parseFloat(t[2] ?? '0') + ty * (s ? Number.parseFloat(s[2] ?? s[1]) : 1);
        }
        if (s) {
            sx *= Number.parseFloat(s[1]);
            sy *= Number.parseFloat(s[2] ?? s[1]);
        }
    }
    return { tx, ty, sx, sy };
}

function findPage(pageInfos: TypstPageInfo[], docY: number): { index: number; offset: number } {
    let cumulative = 0;
    for (let i = 0; i < pageInfos.length; i++) {
        const next = cumulative + pageInfos[i].height;
        if (docY < next) return { index: i, offset: cumulative };
        cumulative = next;
    }
    const last = pageInfos.length - 1;
    return { index: last, offset: cumulative - pageInfos[last].height };
}

function buildSourceIndex(sources: Record<string, string>): Map<string, SourceFileIndex> {
    const index = new Map<string, SourceFileIndex>();
    for (const [path, content] of Object.entries(sources)) {
        const rawLines = content.split(/\r?\n/);
        const inCodeBlock = new Array(rawLines.length).fill(false);
        let inFence = false;
        for (let i = 0; i < rawLines.length; i++) {
            if (FENCE_REGEX.test(rawLines[i])) {
                inCodeBlock[i] = true;
                inFence = !inFence;
            } else if (inFence || RAW_CALL_REGEX.test(rawLines[i])) {
                inCodeBlock[i] = true;
            }
        }
        index.set(path, { lines: rawLines.map(normalize), inCodeBlock });
    }
    return index;
}

function collectOverlays(svgString: string, pageInfos: TypstPageInfo[]): Overlay[] {
    const doc = new DOMParser().parseFromString(svgString, 'image/svg+xml');
    const root = doc.documentElement;
    const overlays: Overlay[] = [];

    for (const el of Array.from(doc.querySelectorAll('foreignObject'))) {
        const text = normalize(el.textContent ?? '');
        if (!text) continue;

        const localX = Number.parseFloat(el.getAttribute('x') ?? '0');
        const localY = Number.parseFloat(el.getAttribute('y') ?? '0');
        const width = Number.parseFloat(el.getAttribute('width') ?? '0');
        const height = Number.parseFloat(el.getAttribute('height') ?? '0');
        const { tx, ty, sx, sy } = accumulateTransform(el, root);
        const docY = ty + localY * sy;
        const { index, offset } = findPage(pageInfos, docY);

        overlays.push({
            text,
            page: index + 1,
            x: tx + localX * sx,
            y: docY - offset,
            width: Math.abs(width * sx),
            height: Math.abs(height * sy),
            inCodeCluster: false,
        });
    }

    for (let i = 0; i < overlays.length; i++) {
        const cur = overlays[i];
        let aligned = 0;
        for (const k of [-2, -1, 1, 2]) {
            const j = i + k;
            if (j < 0 || j >= overlays.length || overlays[j].page !== cur.page) continue;
            if (Math.abs(overlays[j].x - cur.x) <= X_TOLERANCE) aligned++;
        }
        if (aligned >= CLUSTER_NEIGHBORS_REQUIRED) cur.inCodeCluster = true;
    }

    return overlays;
}

function findLine(
    sourceIndex: Map<string, SourceFileIndex>,
    targetText: string,
    before: string[],
    after: string[],
    mainFile: string | undefined,
): { file: string; line: number } | null {
    const target = normalize(targetText);
    if (!target) return null;

    const mainDir = mainFile ? mainFile.substring(0, mainFile.lastIndexOf('/') + 1) : '';
    const isShort = target.length < SHORT_TEXT_THRESHOLD;

    let bestFile: string | null = null;
    let bestLine = -1;
    let bestScore = -1;
    let secondScore = -1;

    for (const [file, { lines, inCodeBlock }] of sourceIndex.entries()) {
        const isMain = file === mainFile;
        const isLocal = mainDir ? file.startsWith(mainDir) : !file.includes('/packages/') && !file.startsWith('@');
        const baseScore = isMain ? SCORE_MAIN : isLocal ? SCORE_LOCAL : 0;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (!line.includes(target)) continue;

            const quality = line === target ? EXACT_MATCH : line.length <= target.length * TIGHT_RATIO ? TIGHT_MATCH : 1;
            let score = baseScore + quality;
            if (inCodeBlock[i]) score += 1000;
            for (let k = 0; k < before.length; k++) {
                const probe = i - 1 - k;
                if (probe < 0) break;
                const probeLine = lines[probe];
                const ctx = before[before.length - 1 - k];
                const matches = inCodeBlock[i] ? probeLine === ctx : probeLine.includes(ctx);
                if (!probeLine || !matches) break;
                score++;
            }
            for (let k = 0; k < after.length; k++) {
                const probe = i + 1 + k;
                if (probe >= lines.length) break;
                const probeLine = lines[probe];
                const ctx = after[k];
                const matches = inCodeBlock[i] ? probeLine === ctx : probeLine.includes(ctx);
                if (!probeLine || !matches) break;
                score++;
            }

            if (score > bestScore) {
                secondScore = bestScore;
                bestScore = score;
                bestFile = file;
                bestLine = i + 1;
            } else if (score > secondScore) {
                secondScore = score;
            }
        }
    }

    if (!bestFile) return null;
    if ((isShort || bestScore >= 1000) && bestScore - secondScore < AMBIGUITY_MARGIN) return null;
    return { file: bestFile, line: bestLine };
}

function findForwardEntries(forwardMap: Map<string, AnnotatedRect[]>, file: string, line: number): AnnotatedRect[] | undefined {
    const normalized = file.replace(/^\/+/, '');
    const exact = forwardMap.get(`${normalized}:${line}`);
    if (exact) return exact;

    let bestKey: string | null = null;
    let bestDelta = Number.POSITIVE_INFINITY;
    for (const key of forwardMap.keys()) {
        const colonIdx = key.lastIndexOf(':');
        const keyFile = key.substring(0, colonIdx);
        if (keyFile !== normalized && !keyFile.endsWith(`/${normalized}`) && !normalized.endsWith(`/${keyFile}`)) continue;
        const delta = Math.abs(Number.parseInt(key.substring(colonIdx + 1), 10) - line);
        if (delta < bestDelta) {
            bestDelta = delta;
            bestKey = key;
        }
    }
    return bestKey ? forwardMap.get(bestKey) : undefined;
}

function findReverseBlock(blocks: AnnotatedRect[], x: number, y: number): AnnotatedRect | null {
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

    return contained || closest;
}

class TypstSourceMapService implements SourceMapService {
    private data: SourceMapData | null = null;
    private listeners: Set<() => void> = new Set();

    loadFromSvg(svgString: string, pageInfos: TypstPageInfo[], sources: Record<string, string>, mainFile?: string): void {
        if (!this.isEnabled()) {
            this.data = null;
            this.notify();
            return;
        }
        try {
            this.data = this.buildIndex(svgString, pageInfos, sources, mainFile);
        } catch (error) {
            console.error('[TypstSourceMapService] Failed to build index:', error);
            this.data = null;
        }
        this.notify();
    }

    isAvailable(): boolean {
        return this.data !== null;
    }

    forward(file: string, line: number, column?: number): SourceMapForwardResult | null {
        return this.data?.forward(file, line, column) ?? null;
    }

    reverse(page: number, x: number, y: number): SourceMapReverseResult | null {
        return this.data?.reverse(page, x, y) ?? null;
    }

    clear(): void {
        this.data = null;
        this.notify();
    }

    addListener(listener: () => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    private buildIndex(svgString: string, pageInfos: TypstPageInfo[], sources: Record<string, string>, mainFile?: string): SourceMapData {
        const sourceIndex = buildSourceIndex(sources);
        const overlays = collectOverlays(svgString, pageInfos);

        const forwardMap = new Map<string, AnnotatedRect[]>();
        const reverseMap = new Map<number, AnnotatedRect[]>();

        for (let i = 0; i < overlays.length; i++) {
            const entry = overlays[i];

            const before: string[] = [];
            for (let k = 1; k <= CONTEXT_WINDOW && i - k >= 0 && overlays[i - k].page === entry.page; k++) {
                before.unshift(overlays[i - k].text);
            }
            const after: string[] = [];
            for (let k = 1; k <= CONTEXT_WINDOW && i + k < overlays.length && overlays[i + k].page === entry.page; k++) {
                after.push(overlays[i + k].text);
            }

            const match = findLine(sourceIndex, entry.text, before, after, mainFile);
            if (!match) continue;

            const rect: AnnotatedRect = {
                page: entry.page,
                file: match.file,
                line: match.line,
                x: entry.x,
                y: entry.y,
                width: entry.width,
                height: entry.height,
            };

            const key = `${match.file}:${match.line}`;
            const list = forwardMap.get(key);
            if (list) list.push(rect);
            else forwardMap.set(key, [rect]);

            const pageList = reverseMap.get(rect.page);
            if (pageList) pageList.push(rect);
            else reverseMap.set(rect.page, [rect]);
        }

        const fileInCodeBlock = new Map<string, boolean[]>();
        for (const [file, fileIndex] of sourceIndex.entries()) {
            fileInCodeBlock.set(file, fileIndex.inCodeBlock);
        }

        return {
            forward(file: string, line: number): SourceMapForwardResult | null {
                const normalized = file.replace(/^\/+/, '');

                let resolvedFile: string | null = null;
                for (const key of fileInCodeBlock.keys()) {
                    if (key === normalized || key.endsWith(`/${normalized}`) || normalized.endsWith(`/${key}`)) {
                        resolvedFile = key;
                        break;
                    }
                }
                if (!resolvedFile) return null;

                const exact = forwardMap.get(`${resolvedFile}:${line}`);
                if (exact && exact.length > 0) {
                    const page = exact[0].page;
                    const onPage = exact.filter((e) => e.page === page);
                    return { page, rects: onPage.map((e) => ({ x: e.x, y: e.y, width: e.width, height: e.height })) };
                }

                const mask = fileInCodeBlock.get(resolvedFile);
                if (mask && mask[line - 1]) return null;

                const entries = findForwardEntries(forwardMap, resolvedFile, line);
                if (!entries || entries.length === 0) return null;
                const page = entries[0].page;
                const onPage = entries.filter((e) => e.page === page);
                return { page, rects: onPage.map((e) => ({ x: e.x, y: e.y, width: e.width, height: e.height })) };
            },

            reverse(page: number, x: number, y: number): SourceMapReverseResult | null {
                const blocks = reverseMap.get(page);
                if (!blocks || blocks.length === 0) return null;
                const block = findReverseBlock(blocks, x, y);
                return block ? { file: block.file, line: block.line } : null;
            },
        };
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