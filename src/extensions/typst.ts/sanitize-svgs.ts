export type SanitizeSvgOptions = {
    baseUrl?: string;
    allowRemoteUrls?: boolean;
};

type ResolvedOptions = Required<SanitizeSvgOptions> & { svgDataUrlDepth: number };

const MAX_SVG_DATA_URL_DEPTH = 2;
const MAX_SVG_DATA_URL_BYTES = 2_000_000;

const BLOCKED_TAGS = new Set(['script', 'iframe', 'object', 'embed', 'meta', 'link', 'base']);

const ANIMATION_TAGS = new Set(['animate', 'set', 'animatetransform', 'animatemotion', 'animatecolor']);

const BLOCKED_ANIMATION_TARGETS = new Set([
    'href', 'xlink:href', 'src', 'poster', 'action', 'formaction',
    'background', 'cite', 'data', 'style', 'class', 'id',
]);

const URL_ATTRS = new Set(['href', 'src', 'poster', 'action', 'formaction', 'background', 'cite', 'data']);

const DROP_ATTRS = new Set(['srcdoc', 'srcset']);

const DANGEROUS_PROTOCOLS = new Set(['javascript:', 'vbscript:', 'file:']);

const SAFE_DATA_PREFIXES = [
    'data:image/png', 'data:image/jpeg', 'data:image/gif', 'data:image/webp',
    'data:audio/', 'data:video/', 'data:font/', 'data:application/font-',
];

const TAG_RE = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<!?\??\/?\s*([\w.:-]+)([^>]*?)\/?\s*>/g;
const ATTR_RE = /([^\s/=>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s/>]+)))?/g;

export function sanitizeSvg(svg: string, options: SanitizeSvgOptions = {}): string {
    return sanitize(svg, {
        baseUrl: options.baseUrl ?? 'http://localhost/',
        allowRemoteUrls: options.allowRemoteUrls ?? false,
        svgDataUrlDepth: 0,
    });
}

function sanitize(svg: string, opts: ResolvedOptions): string {
    let output = '';
    let cursor = 0;
    let skipUntil: RegExp | null = null;

    for (const match of svg.matchAll(TAG_RE)) {
        const [tag, rawName, rawAttrs] = match;
        const start = match.index!;

        if (skipUntil) {
            if (skipUntil.test(tag)) skipUntil = null;
            cursor = start + tag.length;
            continue;
        }

        output += svg.slice(cursor, start);
        cursor = start + tag.length;

        if (tag.startsWith('<!--') || tag.startsWith('<![CDATA[')) {
            output += tag;
            continue;
        }

        if (tag.startsWith('<!') || tag.startsWith('<?')) continue;

        if (tag.startsWith('</')) {
            output += tag;
            continue;
        }

        const localName = getLocalName(rawName ?? '');

        if (BLOCKED_TAGS.has(localName)) {
            const selfClosing = /\/\s*>$/.test(tag);
            if (!selfClosing) {
                skipUntil = new RegExp(`</(?:[\\w.-]+:)?${localName}\\s*>`, 'i');
            }
            continue;
        }

        // TODO (fabawi): This is a very naive approach and breaks the svgs format, but must be revisited
        // if (localName === 'style' && !/\/\s*>$/.test(tag)) {
        //     const close = svg.slice(cursor).search(/<\/(?:[\w.-]+:)?style\s*>/i);
        //     if (close !== -1) {
        //         const css = svg.slice(cursor, cursor + close);
        //         const closeTag = svg.slice(cursor + close).match(/<\/(?:[\w.-]+:)?style\s*>/i)![0];
        //         if (isSafeStyle(css)) {
        //             output += rebuildTag(rawName, rawAttrs ?? '', false, opts) + css + closeTag;
        //         }
        //         cursor = cursor + close + closeTag.length;
        //         continue;
        //     }
        // }

        if (ANIMATION_TAGS.has(localName) && isUnsafeAnimation(rawAttrs ?? '')) continue;

        output += rebuildTag(rawName, rawAttrs ?? '', /\/\s*>$/.test(tag), opts);
    }

    output += svg.slice(cursor);
    return output;
}

function rebuildTag(name: string, rawAttrs: string, selfClosing: boolean, opts: ResolvedOptions): string {
    const attrs: string[] = [];

    for (const match of rawAttrs.matchAll(ATTR_RE)) {
        const [, rawAttrName, dq, sq, uq] = match;
        const hasValue = match[0].includes('=');
        const value = dq ?? sq ?? uq ?? null;
        const quote: '"' | "'" = sq !== undefined ? "'" : '"';
        const sanitized = sanitizeAttribute(rawAttrName, hasValue ? (value ?? '') : null, quote, opts);
        if (sanitized) attrs.push(sanitized);
    }

    const attrStr = attrs.length ? ' ' + attrs.join(' ') : '';
    return `<${name}${attrStr}${selfClosing ? '/>' : '>'}`;
}

function sanitizeAttribute(
    rawName: string,
    rawValue: string | null,
    quote: '"' | "'",
    opts: ResolvedOptions,
): string | null {
    const name = rawName.toLowerCase();
    const localName = getLocalName(name);

    if (localName.startsWith('on') || DROP_ATTRS.has(localName)) return null;

    if (rawValue === null) return rawName;

    if (localName === 'style') {
        return isSafeStyle(rawValue) ? formatAttr(rawName, rawValue, quote) : null;
    }

    if (URL_ATTRS.has(localName) || name === 'xlink:href' || name.endsWith(':href')) {
        const url = sanitizeUrl(rawValue, opts);
        return url === null ? null : formatAttr(rawName, url, quote);
    }

    return formatAttr(rawName, rawValue, quote);
}

function sanitizeUrl(rawValue: string, opts: ResolvedOptions): string | null {
    const decoded = decodeEntities(rawValue).trim();
    if (decoded === '' || decoded.startsWith('#')) return rawValue;

    const compact = decoded.replace(/[\u0000-\u001F\u007F\s]+/g, '').toLowerCase();

    if ([...DANGEROUS_PROTOCOLS].some(p => compact.startsWith(p))) return null;
    if (compact.startsWith('data:image/svg+xml')) return sanitizeSvgDataUrl(decoded, opts);
    if (compact.startsWith('data:')) return isSafeDataUrl(compact) ? rawValue : null;
    if (compact.startsWith('//')) return opts.allowRemoteUrls ? rawValue : null;

    let parsed: URL;
    try {
        parsed = new URL(decoded, opts.baseUrl);
    } catch {
        return null;
    }

    const protocol = parsed.protocol.toLowerCase();
    if (DANGEROUS_PROTOCOLS.has(protocol)) return null;
    if (protocol === 'blob:') return rawValue;

    if (protocol === 'http:' || protocol === 'https:') {
        if (opts.allowRemoteUrls) return rawValue;
        return parsed.origin === new URL(opts.baseUrl).origin ? rawValue : null;
    }

    return null;
}

function isSafeDataUrl(compact: string): boolean {
    if (compact.startsWith('data:text/html') || compact.startsWith('data:application/xhtml+xml')) {
        return false;
    }
    return SAFE_DATA_PREFIXES.some(p => compact.startsWith(p));
}

function sanitizeSvgDataUrl(value: string, opts: ResolvedOptions): string | null {
    if (opts.svgDataUrlDepth >= MAX_SVG_DATA_URL_DEPTH) return null;

    const match = value.match(/^data:image\/svg\+xml((?:;[^,]*)?),(.*)$/i);
    if (!match) return null;

    const isBase64 = /(?:^|;)base64(?:;|$)/i.test(match[1] ?? '');
    let svg: string;

    try {
        svg = isBase64 ? decodeBase64(safeDecodeUri(match[2])) : safeDecodeUri(match[2]);
    } catch {
        return null;
    }

    if (svg.length > MAX_SVG_DATA_URL_BYTES || !looksLikeSvg(svg)) return null;

    const sanitized = sanitize(svg, { ...opts, svgDataUrlDepth: opts.svgDataUrlDepth + 1 });
    if (!looksLikeSvg(sanitized)) return null;

    return `data:image/svg+xml,${encodeURIComponent(sanitized)}`;
}

function isUnsafeAnimation(rawAttrs: string): boolean {
    let target: string | null = null;
    const dangerousValues: string[] = [];

    for (const match of rawAttrs.matchAll(ATTR_RE)) {
        const [, rawAttrName, dq, sq, uq] = match;
        const value = dq ?? sq ?? uq;
        if (value === undefined) continue;

        const attr = rawAttrName.toLowerCase();
        if (attr === 'attributename') target = decodeEntities(value).trim().toLowerCase();
        else if (attr === 'from' || attr === 'to' || attr === 'by' || attr === 'values') {
            dangerousValues.push(decodeEntities(value).replace(/[\u0000-\u001F\u007F\s]+/g, '').toLowerCase());
        }
    }

    if (target && (BLOCKED_ANIMATION_TARGETS.has(target) || BLOCKED_ANIMATION_TARGETS.has(getLocalName(target)))) {
        return true;
    }

    return dangerousValues.some(v =>
        [...DANGEROUS_PROTOCOLS].some(p => v.includes(p)) ||
        v.includes('data:text/html') ||
        v.includes('data:application/xhtml+xml')
    );
}

function isSafeStyle(value: string): boolean {
    const compact = decodeCssEscapes(decodeEntities(value))
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/[\u0000-\u001F\u007F]+/g, '')
        .toLowerCase();
    return !compact.includes('url(') && !compact.includes('@import');
}

function decodeCssEscapes(value: string): string {
    return value.replace(/\\([0-9a-f]{1,6})[ \t\n\r\f]?|\\([^\n\r\f0-9a-f])/gi,
        (_, hex: string | undefined, ch: string | undefined) => {
            if (hex) {
                const code = Number.parseInt(hex, 16);
                return Number.isFinite(code) && code !== 0 ? String.fromCodePoint(code) : '';
            }
            return ch ?? '';
        }
    );
}

function looksLikeSvg(value: string): boolean {
    return /^\s*(?:<\?xml[\s\S]*?\?>\s*)?(?:<!--[\s\S]*?-->\s*)*<svg[\s>]/i.test(value);
}

function formatAttr(name: string, value: string, quote: '"' | "'"): string {
    const escaped = quote === "'" ? value.replace(/'/g, '&#39;') : value.replace(/"/g, '&quot;');
    return `${name}=${quote}${escaped}${quote}`;
}

function safeDecodeUri(value: string): string {
    try { return decodeURIComponent(value); } catch { return value; }
}

function decodeBase64(value: string): string {
    const normalized = value.replace(/\s+/g, '');
    if (typeof atob === 'function') {
        return new TextDecoder().decode(Uint8Array.from(atob(normalized), c => c.charCodeAt(0)));
    }
    const buffer = (globalThis as { Buffer?: { from(v: string, e: 'base64'): { toString(e: 'utf8'): string } } }).Buffer;
    if (buffer) return buffer.from(normalized, 'base64').toString('utf8');
    throw new Error('Base64 decoding is unavailable');
}

function decodeEntities(value: string): string {
    return value.replace(/&(#x[0-9a-f]+|#\d+|colon|tab|newline);?/gi, (_, entity: string) => {
        const lower = entity.toLowerCase();
        if (lower.startsWith('#x')) {
            const code = Number.parseInt(lower.slice(2), 16);
            return Number.isFinite(code) ? String.fromCodePoint(code) : '';
        }
        if (lower.startsWith('#')) {
            const code = Number.parseInt(lower.slice(1), 10);
            return Number.isFinite(code) ? String.fromCodePoint(code) : '';
        }
        return { colon: ':', tab: '\t', newline: '\n' }[lower] ?? '';
    });
}

function getLocalName(name: string): string {
    const lower = name.toLowerCase();
    const colon = lower.lastIndexOf(':');
    return colon === -1 ? lower : lower.slice(colon + 1);
}