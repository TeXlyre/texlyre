// src/utils/latexSynctexParser.ts
import { inflate } from 'pako';

import type { SourceMapData, SourceMapForwardResult, SourceMapReverseResult } from '../types/sourceMap';

const SP_TO_PT = 1 / 65536;
const LINE_SNAP_PT = 2;

interface Block {
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

interface SynctexIndex {
    forwardMap: Map<string, Block[]>;
    reverseMap: Map<number, Block[]>;
    magnification: number;
    xOffset: number;
    yOffset: number;
}

function decodeSynctex(bytes: Uint8Array): string {
    const isGzip = bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
    const raw = isGzip ? inflate(bytes) : bytes;
    return new TextDecoder('utf-8').decode(raw);
}

function parseRecordFields(line: string): { line: number; column: number; x: number; y: number; width: number; height: number; depth: number } | null {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) return null;

    const prefix = line.substring(1, colonIdx);
    const rest = line.substring(colonIdx + 1);

    const prefixParts = prefix.split(',');
    if (prefixParts.length < 2) return null;

    const lineNum = Number.parseInt(prefixParts[1], 10);
    const column = prefixParts.length > 2 ? Number.parseInt(prefixParts[2], 10) : -1;

    const restParts = rest.split(/[,:]/);
    if (restParts.length < 2) return null;

    const x = Number.parseInt(restParts[0], 10);
    const y = Number.parseInt(restParts[1], 10);
    const width = restParts.length > 2 ? Number.parseInt(restParts[2], 10) : 0;
    const height = restParts.length > 3 ? Number.parseInt(restParts[3], 10) : 0;
    const depth = restParts.length > 4 ? Number.parseInt(restParts[4], 10) : 0;

    if (Number.isNaN(lineNum) || Number.isNaN(x) || Number.isNaN(y)) return null;

    return { line: lineNum, column, x, y, width, height, depth };
}

function buildIndex(text: string): SynctexIndex {
    const lines = text.split('\n');
    const inputs = new Map<number, string>();
    const forwardMap = new Map<string, Block[]>();
    const reverseMap = new Map<number, Block[]>();
    let magnification = 1000;
    let xOffset = 0;
    let yOffset = 0;
    let currentPage = 0;
    let inContent = false;

    for (const line of lines) {
        if (!line) continue;

        if (line.startsWith('Magnification:')) {
            magnification = Number.parseInt(line.substring(14), 10) || 1000;
            continue;
        }
        if (line.startsWith('X Offset:')) {
            xOffset = Number.parseFloat(line.substring(9)) || 0;
            continue;
        }
        if (line.startsWith('Y Offset:')) {
            yOffset = Number.parseFloat(line.substring(9)) || 0;
            continue;
        }
        if (line.startsWith('Input:')) {
            const parts = line.substring(6).split(':');
            if (parts.length >= 2) {
                const tag = Number.parseInt(parts[0], 10);
                const path = parts.slice(1).join(':').trim();
                if (!Number.isNaN(tag)) inputs.set(tag, path);
            }
            continue;
        }
        if (line === 'Content:') { inContent = true; continue; }
        if (!inContent) continue;
        if (line.startsWith('Postamble:')) break;

        const firstChar = line[0];

        if (firstChar === '{') {
            const pageNum = Number.parseInt(line.substring(1), 10);
            if (!Number.isNaN(pageNum)) {
                currentPage = pageNum;
                if (!reverseMap.has(currentPage)) reverseMap.set(currentPage, []);
            }
            continue;
        }
        if (firstChar === '}') { currentPage = 0; continue; }
        if (firstChar !== '[' && firstChar !== '(' && firstChar !== 'h' &&
            firstChar !== 'v' && firstChar !== 'x' && firstChar !== 'k' &&
            firstChar !== 'g' && firstChar !== '$') continue;

        const prefixEnd = line.indexOf(':');
        if (prefixEnd === -1) continue;

        const prefix = line.substring(1, prefixEnd);
        const tag = Number.parseInt(prefix.split(',')[0], 10);
        if (Number.isNaN(tag)) continue;

        const file = inputs.get(tag);
        if (!file) continue;

        const fields = parseRecordFields(line);
        if (!fields) continue;

        const block: Block = {
            page: currentPage,
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
        const forwardList = forwardMap.get(key);
        if (forwardList) forwardList.push(block);
        else forwardMap.set(key, [block]);

        reverseMap.get(currentPage)?.push(block);
    }

    return { forwardMap, reverseMap, magnification, xOffset, yOffset };
}

function normalizePath(file: string): string {
    return file.replace(/^\.?\/+/, '').replace(/^_+/, '');
}

function medianLineHeight(index: SynctexIndex, page: number): number {
    const pageBlocks = index.reverseMap.get(page);
    if (!pageBlocks) return 12;

    const heights: number[] = [];
    for (const b of pageBlocks) {
        const h = b.height + b.depth;
        if (h > 0 && h < 50) heights.push(h);
    }
    if (heights.length === 0) return 12;

    heights.sort((a, b) => a - b);
    return heights[Math.floor(heights.length / 2)];
}

function findReverseBlock(index: SynctexIndex, page: number, x: number, y: number): Block | null {
    const blocks = index.reverseMap.get(page);
    if (!blocks || blocks.length === 0) return null;

    let bestContained: Block | null = null;
    let bestContainedArea = Number.POSITIVE_INFINITY;
    let closest: Block | null = null;
    let closestDistance = Number.POSITIVE_INFINITY;

    for (const block of blocks) {
        const top = block.y - block.height;
        const bottom = block.y + block.depth;
        const left = block.x;
        const right = block.x + block.width;

        if (x >= left && x <= right && y >= top && y <= bottom) {
            const area = block.width * (block.height + block.depth);
            if (area < bestContainedArea) {
                bestContainedArea = area;
                bestContained = block;
            }
        } else {
            const cx = Math.max(left, Math.min(x, right));
            const cy = Math.max(top, Math.min(y, bottom));
            const dx = x - cx;
            const dy = y - cy;
            const distance = dx * dx + dy * dy;
            if (distance < closestDistance) {
                closestDistance = distance;
                closest = block;
            }
        }
    }

    return bestContained || closest;
}

export function parseSynctex(bytes: Uint8Array): SourceMapData {
    const text = decodeSynctex(bytes);
    const index = buildIndex(text);

    return {
        forward(file: string, line: number, _column?: number): SourceMapForwardResult | null {
            const normalized = normalizePath(file);
            let candidates: Block[] = [];

            for (const [key, blocks] of index.forwardMap.entries()) {
                const colonIdx = key.lastIndexOf(':');
                const blockFile = key.substring(0, colonIdx);
                const blockLine = Number.parseInt(key.substring(colonIdx + 1), 10);
                const normalizedBlockFile = normalizePath(blockFile);

                const fileMatches =
                    normalizedBlockFile === normalized ||
                    normalizedBlockFile.endsWith(`/${normalized}`) ||
                    normalized.endsWith(`/${normalizedBlockFile}`);

                if (!fileMatches) continue;
                if (blockLine === line) candidates.push(...blocks);
            }

            if (candidates.length === 0) {
                let closestDelta = Number.POSITIVE_INFINITY;
                for (const [key, blocks] of index.forwardMap.entries()) {
                    const colonIdx = key.lastIndexOf(':');
                    const blockFile = key.substring(0, colonIdx);
                    const blockLine = Number.parseInt(key.substring(colonIdx + 1), 10);
                    const normalizedBlockFile = normalizePath(blockFile);

                    const fileMatches =
                        normalizedBlockFile === normalized ||
                        normalizedBlockFile.endsWith(`/${normalized}`) ||
                        normalized.endsWith(`/${normalizedBlockFile}`);

                    if (!fileMatches) continue;
                    const delta = Math.abs(blockLine - line);
                    if (delta < closestDelta) {
                        closestDelta = delta;
                        candidates = blocks;
                    }
                }
            }

            if (candidates.length === 0) return null;

            const page = candidates[0].page;
            const withWidth = candidates.filter((b) => b.width > 0);
            const pool = withWidth.length > 0 ? withWidth : candidates;
            const fallbackHeight = medianLineHeight(index, page);

            // Group blocks into PDF lines by snapping close y values together
            const groups: Block[][] = [];
            for (const block of pool) {
                const group = groups.find((g) => Math.abs(g[0].y - block.y) <= LINE_SNAP_PT);
                if (group) group.push(block);
                else groups.push([block]);
            }

            const rects = groups.map((group) => {
                const rep = group.reduce((a, b) => (a.width >= b.width ? a : b));
                const blockHeight = rep.height + rep.depth;
                const lineHeight = blockHeight > 0 ? blockHeight : fallbackHeight;
                const topY = rep.y - (blockHeight > 0 ? rep.height : lineHeight * 0.8);
                return { x: rep.x, y: topY, width: rep.width, height: lineHeight };
            });

            return { page, rects };
        },

        reverse(page: number, x: number, y: number): SourceMapReverseResult | null {
            const block = findReverseBlock(index, page, x, y);
            if (!block) return null;
            return {
                file: block.file,
                line: block.line,
                column: block.column >= 0 ? block.column : undefined,
            };
        },
    };
}