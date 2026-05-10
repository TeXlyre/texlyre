import { inflate } from 'pako';

import type {
    SourceMapData,
    SourceMapForwardResult,
    SourceMapReverseResult,
} from '../types/sourceMap';

const SP_TO_PT = 1 / 65536;

interface Box {
    page: number;
    file: string;
    line: number;
    column: number;
    x: number;
    y: number;
    width: number;
    height: number;
    depth: number;
}

interface Index {
    byFileLine: Map<string, Box[]>;
    byPage: Map<number, Box[]>;
}

const decode = (bytes: Uint8Array): string => {
    const gzip = bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
    return new TextDecoder('utf-8').decode(gzip ? inflate(bytes) : bytes);
};

const normalize = (file: string): string =>
    file.replace(/^\.?\/+/, '').replace(/^_+/, '');

const parseRecord = (line: string): {
    tag: number;
    line: number;
    column: number;
    x: number;
    y: number;
    width: number;
    height: number;
    depth: number;
} | null => {
    const colon = line.indexOf(':');
    if (colon === -1) return null;

    const prefix = line.substring(1, colon).split(',');
    const tag = Number.parseInt(prefix[0], 10);
    const lineNum = Number.parseInt(prefix[1], 10);
    if (Number.isNaN(tag) || Number.isNaN(lineNum)) return null;

    const rest = line.substring(colon + 1).split(/[,:]/);
    const x = Number.parseInt(rest[0], 10);
    const y = Number.parseInt(rest[1], 10);
    if (Number.isNaN(x) || Number.isNaN(y)) return null;

    return {
        tag,
        line: lineNum,
        column: prefix.length > 2 ? Number.parseInt(prefix[2], 10) : -1,
        x,
        y,
        width: Number.parseInt(rest[2], 10) || 0,
        height: Number.parseInt(rest[3], 10) || 0,
        depth: Number.parseInt(rest[4], 10) || 0,
    };
};

const buildIndex = (text: string): Index => {
    const inputs = new Map<number, string>();
    const byFileLine = new Map<string, Box[]>();
    const byPage = new Map<number, Box[]>();
    let page = 0;
    let inContent = false;

    for (const raw of text.split('\n')) {
        if (!raw) continue;

        if (!inContent) {
            if (raw === 'Content:') { inContent = true; continue; }
            if (raw.startsWith('Input:')) {
                const parts = raw.substring(6).split(':');
                const tag = Number.parseInt(parts[0], 10);
                if (parts.length >= 2 && !Number.isNaN(tag)) {
                    inputs.set(tag, parts.slice(1).join(':').trim());
                }
            }
            continue;
        }

        if (raw.startsWith('Postamble:')) break;

        const kind = raw[0];

        if (kind === '{') {
            const n = Number.parseInt(raw.substring(1), 10);
            if (!Number.isNaN(n)) {
                page = n;
                if (!byPage.has(page)) byPage.set(page, []);
            }
            continue;
        }

        if (kind === '}') { page = 0; continue; }

        if (kind !== 'h' && kind !== '[' && kind !== '(') continue;

        const fields = parseRecord(raw);
        if (!fields) continue;

        const file = inputs.get(fields.tag);
        if (!file || page === 0) continue;

        const box: Box = {
            page,
            file,
            line: fields.line,
            column: fields.column,
            x: fields.x * SP_TO_PT,
            y: fields.y * SP_TO_PT,
            width: fields.width * SP_TO_PT,
            height: fields.height * SP_TO_PT,
            depth: fields.depth * SP_TO_PT,
        };

        const key = `${file}:${fields.line}`;
        const list = byFileLine.get(key);
        if (list) list.push(box);
        else byFileLine.set(key, [box]);

        byPage.get(page)?.push(box);
    }

    return { byFileLine, byPage };
};

export function parseSynctex(bytes: Uint8Array): SourceMapData {
    const index = buildIndex(decode(bytes));

    return {
        forward(file: string, line: number): SourceMapForwardResult | null {
            const target = normalize(file);
            const targetBase = target.split('/').pop() ?? '';

            const matchesFile = (indexed: string): boolean => {
                const n = normalize(indexed);
                return (
                    n === target ||
                    n.endsWith(`/${target}`) ||
                    target.endsWith(`/${n}`) ||
                    (!!targetBase && n.split('/').pop() === targetBase)
                );
            };

            let exact: Box[] = [];
            let nearest: Box[] = [];
            let nearestDelta = Number.POSITIVE_INFINITY;

            for (const [key, boxes] of index.byFileLine) {
                const colon = key.lastIndexOf(':');
                if (!matchesFile(key.substring(0, colon))) continue;

                const blockLine = Number.parseInt(key.substring(colon + 1), 10);
                if (blockLine === line) {
                    exact = exact.concat(boxes);
                    continue;
                }

                const delta = Math.abs(blockLine - line);
                if (delta < nearestDelta) {
                    nearestDelta = delta;
                    nearest = boxes.slice();
                } else if (delta === nearestDelta) {
                    nearest = nearest.concat(boxes);
                }
            }

            const candidates = exact.length > 0 ? exact : nearest;
            if (candidates.length === 0) return null;

            const page = candidates[0].page;
            const onPage = candidates.filter((b) => b.page === page && b.width > 0);
            if (onPage.length === 0) return null;

            const rects = onPage.map((b) => ({
                x: b.x,
                y: b.y - b.height,
                width: b.width,
                height: b.height + b.depth,
            }));

            return { page, rects };
        },

        reverse(page: number, x: number, y: number): SourceMapReverseResult | null {
            const boxes = index.byPage.get(page);
            if (!boxes?.length) return null;

            let bestContained: Box | null = null;
            let bestArea = Number.POSITIVE_INFINITY;
            let closest: Box | null = null;
            let closestDist = Number.POSITIVE_INFINITY;

            for (const b of boxes) {
                const top = b.y - b.height;
                const bottom = b.y + b.depth;
                const right = b.x + b.width;

                if (x >= b.x && x <= right && y >= top && y <= bottom) {
                    const area = b.width * (b.height + b.depth);
                    if (area < bestArea) {
                        bestArea = area;
                        bestContained = b;
                    }
                } else if (!bestContained) {
                    const cx = Math.max(b.x, Math.min(x, right));
                    const cy = Math.max(top, Math.min(y, bottom));
                    const dx = x - cx;
                    const dy = y - cy;
                    const dist = dx * dx + dy * dy;
                    if (dist < closestDist) {
                        closestDist = dist;
                        closest = b;
                    }
                }
            }

            const hit = bestContained ?? closest;
            if (!hit) return null;

            return {
                file: hit.file,
                line: hit.line,
                column: hit.column >= 0 ? hit.column : undefined,
            };
        },
    };
}