/// <reference lib="webworker" />
export { };

declare const self: DedicatedWorkerGlobalScope;

interface PageInfo {
    pageOffset: number;
    width: number;
    height: number;
}

interface Overlay {
    text: string;
    page: number;
    x: number;
    y: number;
    width: number;
    height: number;
}

interface BuildMessage {
    id: string;
    type: 'build';
    payload: {
        svg: string;
        pageInfos: PageInfo[];
        sources: Record<string, string>;
        mainFile?: string;
    };
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

interface BuildResult {
    forwardEntries: Array<[string, AnnotatedRect[]]>;
    reverseEntries: Array<[number, AnnotatedRect[]]>;
    fileInCodeBlock: Array<[string, boolean[]]>;
}

const FENCE_REGEX = /^\s*```/;
const RAW_CALL_REGEX = /#raw\s*\(/;
const TRANSLATE_REGEX = /translate\(\s*(-?[\d.]+)(?:\s*[, ]\s*(-?[\d.]+))?\s*\)/;
const SCALE_REGEX = /scale\(\s*(-?[\d.]+)(?:\s*[, ]\s*(-?[\d.]+))?\s*\)/;
const FOREIGN_OBJECT_REGEX = /<foreignObject\b([^>]*)>([\s\S]*?)<\/foreignObject>/g;
const TEXT_CONTENT_REGEX = />([^<]+)</g;
const ATTR_REGEX = /(\w[\w:-]*)\s*=\s*"([^"]*)"/g;

const CONTEXT_WINDOW = 6;
const SHORT_TEXT_THRESHOLD = 12;
const AMBIGUITY_MARGIN = 2;
const EXACT_MATCH = 5;
const TIGHT_MATCH = 3;
const TIGHT_RATIO = 1.4;
const SCORE_MAIN = 100;
const SCORE_LOCAL = 50;
const CODE_BLOCK_BONUS = 1000;

function normalize(s: string): string {
    return s.replace(/\s+/g, ' ').trim();
}

function decodeEntities(s: string): string {
    return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}

function buildSourceIndex(sources: Record<string, string>): Map<string, { lines: string[]; inCodeBlock: boolean[] }> {
    const index = new Map<string, { lines: string[]; inCodeBlock: boolean[] }>();
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

function findPage(pageInfos: PageInfo[], docY: number): { index: number; offset: number } {
    let cumulative = 0;
    for (let i = 0; i < pageInfos.length; i++) {
        const next = cumulative + pageInfos[i].height;
        if (docY < next) return { index: i, offset: cumulative };
        cumulative = next;
    }
    const last = pageInfos.length - 1;
    return { index: last, offset: cumulative - pageInfos[last].height };
}

function collectOverlays(svg: string, pageInfos: PageInfo[]): Overlay[] {
    const overlays: Overlay[] = [];
    const transformStack: Array<{ tx: number; ty: number; sx: number; sy: number }> = [{ tx: 0, ty: 0, sx: 1, sy: 1 }];
    const tagRegex = /<(\/?)([a-zA-Z][\w:-]*)\b([^>]*?)(\/?)>/g;
    let match: RegExpExecArray | null;

    const cur = () => transformStack[transformStack.length - 1];

    while ((match = tagRegex.exec(svg)) !== null) {
        const isClosing = match[1] === '/';
        const tagName = match[2].toLowerCase();
        const attrs = match[3];
        const isSelfClosing = match[4] === '/';

        if (isClosing) {
            transformStack.pop();
            continue;
        }

        let tx = cur().tx, ty = cur().ty, sx = cur().sx, sy = cur().sy;
        const transformAttr = /transform\s*=\s*"([^"]*)"/.exec(attrs);
        if (transformAttr) {
            const t = TRANSLATE_REGEX.exec(transformAttr[1]);
            const s = SCALE_REGEX.exec(transformAttr[1]);
            if (t) {
                tx = cur().tx + Number.parseFloat(t[1]) * cur().sx;
                ty = cur().ty + Number.parseFloat(t[2] ?? '0') * cur().sy;
            }
            if (s) {
                sx = cur().sx * Number.parseFloat(s[1]);
                sy = cur().sy * Number.parseFloat(s[2] ?? s[1]);
            }
        }

        if (tagName === 'foreignobject') {
            const attrMap = parseAttrs(attrs);
            const localX = Number.parseFloat(attrMap.get('x') ?? '0');
            const localY = Number.parseFloat(attrMap.get('y') ?? '0');
            const width = Number.parseFloat(attrMap.get('width') ?? '0');
            const height = Number.parseFloat(attrMap.get('height') ?? '0');

            const closeIdx = svg.indexOf('</foreignObject>', tagRegex.lastIndex);
            if (closeIdx === -1) continue;
            const inner = svg.substring(tagRegex.lastIndex, closeIdx);
            const text = normalize(decodeEntities(extractText(inner)));
            tagRegex.lastIndex = closeIdx + '</foreignObject>'.length;

            if (text) {
                const docY = ty + localY * sy;
                const { index, offset } = findPage(pageInfos, docY);
                overlays.push({
                    text,
                    page: index + 1,
                    x: tx + localX * sx,
                    y: docY - offset,
                    width: Math.abs(width * sx),
                    height: Math.abs(height * sy),
                });
            }
            continue;
        }

        if (!isSelfClosing) {
            transformStack.push({ tx, ty, sx, sy });
        }
    }

    return overlays;
}

function parseAttrs(attrs: string): Map<string, string> {
    const map = new Map<string, string>();
    let m: RegExpExecArray | null;
    ATTR_REGEX.lastIndex = 0;
    while ((m = ATTR_REGEX.exec(attrs)) !== null) {
        map.set(m[1], m[2]);
    }
    return map;
}

function extractText(html: string): string {
    let m: RegExpExecArray | null;
    TEXT_CONTENT_REGEX.lastIndex = 0;
    const parts: string[] = [];
    while ((m = TEXT_CONTENT_REGEX.exec(html)) !== null) {
        const piece = m[1].trim();
        if (piece) parts.push(piece);
    }
    return parts.join(' ');
}

function findLine(
    sourceIndex: Map<string, { lines: string[]; inCodeBlock: boolean[] }>,
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
            if (inCodeBlock[i]) score += CODE_BLOCK_BONUS;

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
    if ((isShort || bestScore >= CODE_BLOCK_BONUS) && bestScore - secondScore < AMBIGUITY_MARGIN) return null;
    return { file: bestFile, line: bestLine };
}

function build(svg: string, pageInfos: PageInfo[], sources: Record<string, string>, mainFile?: string): BuildResult {
    const sourceIndex = buildSourceIndex(sources);
    const overlays = collectOverlays(svg, pageInfos);

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

    return {
        forwardEntries: Array.from(forwardMap.entries()),
        reverseEntries: Array.from(reverseMap.entries()),
        fileInCodeBlock: Array.from(sourceIndex.entries()).map(([file, { inCodeBlock }]) => [file, inCodeBlock] as [string, boolean[]]),
    };
}

self.addEventListener('message', (e: MessageEvent<BuildMessage>) => {
    const { id, type, payload } = e.data;
    if (type !== 'build') return;
    try {
        const result = build(payload.svg, payload.pageInfos, payload.sources, payload.mainFile);
        self.postMessage({ id, type: 'done', result });
    } catch (err) {
        self.postMessage({ id, type: 'error', error: err instanceof Error ? err.message : String(err) });
    }
});