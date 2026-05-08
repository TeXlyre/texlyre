export type SanitizeSvgOptions = {
    baseUrl?: string;
    allowRemoteUrls?: boolean;
};

const BLOCKED_BLOCK_TAGS = [
    'script',
    'iframe',
    'object',
    'embed',
];

const BLOCKED_SINGLE_TAGS = new Set([
    'meta',
    'link',
    'base',

    // TODO (fabawi): These can mutate href-like attributes, see if needed
    'animate',
    'set',
    'animatetransform',
    'animatemotion',
    'animatecolor',
]);

const URL_ATTRS = new Set([
    'href',
    'src',
    'poster',
    'action',
    'formaction',
    'background',
    'cite',
    'data',
]);

const DROP_ATTRS = new Set([
    'srcdoc',
    'srcset',
]);

export function sanitizeSvg(svg: string, options: SanitizeSvgOptions = {}): string {
    const opts = {
        baseUrl: options.baseUrl ?? 'http://localhost/',
        allowRemoteUrls: options.allowRemoteUrls ?? false,
    };

    let sanitized = svg;

    sanitized = removeBlockedBlocks(sanitized);
    sanitized = removeBlockedSingleTags(sanitized);
    sanitized = sanitizeTags(sanitized, opts);

    return sanitized;
}

function removeBlockedBlocks(svg: string): string {
    let output = svg;

    for (const tag of BLOCKED_BLOCK_TAGS) {
        const namespacedTag = `(?:(?:[\\w.-]+):)?${tag}`;

        output = output
            .replace(
                new RegExp(`<${namespacedTag}\\b[^>]*>[\\s\\S]*?<\\/${namespacedTag}>`, 'gi'),
                ''
            )
            .replace(
                new RegExp(`<${namespacedTag}\\b[^>]*\\/>`, 'gi'),
                ''
            );
    }

    return output;
}

function removeBlockedSingleTags(svg: string): string {
    return svg.replace(/<(?:(?:[\w.-]+):)?([\w.-]+)\b[^>]*\/?>/gi, (tag, rawName) => {
        const name = getLocalName(String(rawName));

        if (BLOCKED_SINGLE_TAGS.has(name)) {
            return '';
        }

        return tag;
    });
}

function sanitizeTags(
    svg: string,
    opts: Required<SanitizeSvgOptions>
): string {
    let output = '';
    let i = 0;

    while (i < svg.length) {
        const lt = svg.indexOf('<', i);

        if (lt === -1) {
            output += svg.slice(i);
            break;
        }

        output += svg.slice(i, lt);

        const gt = findTagEnd(svg, lt + 1);

        if (gt === -1) {
            output += svg.slice(lt);
            break;
        }

        const tag = svg.slice(lt, gt + 1);
        output += sanitizeTag(tag, opts);

        i = gt + 1;
    }

    return output;
}

function findTagEnd(input: string, start: number): number {
    let quote: '"' | "'" | null = null;

    for (let i = start; i < input.length; i++) {
        const ch = input[i];

        if (quote) {
            if (ch === quote) {
                quote = null;
            }
            continue;
        }

        if (ch === '"' || ch === "'") {
            quote = ch;
            continue;
        }

        if (ch === '>') {
            return i;
        }
    }

    return -1;
}

function sanitizeTag(
    tag: string,
    opts: Required<SanitizeSvgOptions>
): string {
    if (
        tag.startsWith('</') ||
        tag.startsWith('<!--') ||
        tag.startsWith('<?')
    ) {
        return tag;
    }

    if (tag.startsWith('<!')) {
        return '';
    }

    const content = tag.slice(1, -1);
    const nameMatch = content.match(/^\s*([^\s/>]+)/);

    if (!nameMatch) {
        return tag;
    }

    const tagName = getLocalName(nameMatch[1]);

    if (BLOCKED_SINGLE_TAGS.has(tagName)) {
        return '';
    }

    const tagNameEnd = nameMatch[0].length;
    const beforeAttrs = content.slice(0, tagNameEnd);
    const attrs = content.slice(tagNameEnd);

    return `<${beforeAttrs}${sanitizeAttributes(attrs, opts)}>`;
}

function sanitizeAttributes(
    attrs: string,
    opts: Required<SanitizeSvgOptions>
): string {
    let output = '';
    let i = 0;

    while (i < attrs.length) {
        const chunkStart = i;

        while (i < attrs.length && /\s/.test(attrs[i])) {
            i++;
        }

        if (i >= attrs.length) {
            output += attrs.slice(chunkStart);
            break;
        }

        if (attrs[i] === '/') {
            output += attrs.slice(chunkStart);
            break;
        }

        const nameStart = i;

        while (
            i < attrs.length &&
            !/\s/.test(attrs[i]) &&
            attrs[i] !== '=' &&
            attrs[i] !== '/' &&
            attrs[i] !== '>'
        ) {
            i++;
        }

        const rawName = attrs.slice(nameStart, i);

        while (i < attrs.length && /\s/.test(attrs[i])) {
            i++;
        }

        let rawValue: string | null = null;

        if (attrs[i] === '=') {
            i++;

            while (i < attrs.length && /\s/.test(attrs[i])) {
                i++;
            }

            const quote = attrs[i];

            if (quote === '"' || quote === "'") {
                i++;
                const valueStart = i;

                while (i < attrs.length && attrs[i] !== quote) {
                    i++;
                }

                rawValue = attrs.slice(valueStart, i);

                if (attrs[i] === quote) {
                    i++;
                }
            } else {
                const valueStart = i;

                while (
                    i < attrs.length &&
                    !/\s/.test(attrs[i]) &&
                    attrs[i] !== '/' &&
                    attrs[i] !== '>'
                ) {
                    i++;
                }

                rawValue = attrs.slice(valueStart, i);
            }
        }

        const fullAttr = attrs.slice(chunkStart, i);

        if (shouldKeepAttribute(rawName, rawValue, opts)) {
            output += fullAttr;
        }
    }

    return output;
}

function shouldKeepAttribute(
    rawName: string,
    rawValue: string | null,
    opts: Required<SanitizeSvgOptions>
): boolean {
    const name = rawName.toLowerCase();
    const localName = getLocalName(name);

    if (localName.startsWith('on')) {
        return false;
    }

    if (DROP_ATTRS.has(localName)) {
        return false;
    }

    if (rawValue === null) {
        return true;
    }

    if (localName === 'style') {
        return isSafeStyle(rawValue);
    }

    if (
        URL_ATTRS.has(localName) ||
        name === 'xlink:href' ||
        name.endsWith(':href')
    ) {
        return isSafeUrl(rawValue, opts);
    }

    return true;
}

function isSafeUrl(
    rawValue: string,
    opts: Required<SanitizeSvgOptions>
): boolean {
    const decoded = decodeBasicEntities(rawValue).trim();

    if (decoded === '') {
        return true;
    }

    if (decoded.startsWith('#')) {
        return true;
    }

    const compact = decoded
        .replace(/[\u0000-\u001F\u007F\s]+/g, '')
        .toLowerCase();

    if (
        compact.startsWith('javascript:') ||
        compact.startsWith('vbscript:') ||
        compact.startsWith('file:')
    ) {
        return false;
    }

    if (compact.startsWith('data:')) {
        return isSafeDataUrl(compact);
    }

    if (compact.startsWith('//')) {
        return opts.allowRemoteUrls;
    }

    let parsed: URL;

    try {
        parsed = new URL(decoded, opts.baseUrl);
    } catch {
        return false;
    }

    const protocol = parsed.protocol.toLowerCase();

    if (
        protocol === 'javascript:' ||
        protocol === 'vbscript:' ||
        protocol === 'file:'
    ) {
        return false;
    }

    if (protocol === 'data:') {
        return isSafeDataUrl(compact);
    }

    if (protocol === 'blob:') {
        return true;
    }

    if (protocol === 'http:' || protocol === 'https:') {
        if (opts.allowRemoteUrls) {
            return true;
        }

        const base = new URL(opts.baseUrl);
        return parsed.origin === base.origin;
    }

    return false;
}

function isSafeDataUrl(compact: string): boolean {
    if (
        compact.startsWith('data:text/html') ||
        compact.startsWith('data:application/xhtml+xml')
    ) {
        return false;
    }

    // Keep these to avoids breaking <image xlink:href="data:image/svg+xml;base64,...">.
    return (
        compact.startsWith('data:image/svg+xml') ||
        compact.startsWith('data:image/png') ||
        compact.startsWith('data:image/jpeg') ||
        compact.startsWith('data:image/gif') ||
        compact.startsWith('data:image/webp') ||
        compact.startsWith('data:audio/') ||
        compact.startsWith('data:video/') ||
        compact.startsWith('data:font/') ||
        compact.startsWith('data:application/font-')
    );
}

function isSafeStyle(value: string): boolean {
    const decoded = decodeBasicEntities(value);

    const compact = decoded
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/[\u0000-\u001F\u007F]+/g, '')
        .toLowerCase();

    return !(
        compact.includes('url(') ||
        compact.includes('@import') ||
        compact.includes('expression(') ||
        compact.includes('behavior:') ||
        compact.includes('-moz-binding')
    );
}

function decodeBasicEntities(value: string): string {
    return value.replace(
        /&(#x[0-9a-f]+|#\d+|colon|tab|newline);?/gi,
        (_, entity: string) => {
            const lower = entity.toLowerCase();

            if (lower.startsWith('#x')) {
                const code = Number.parseInt(lower.slice(2), 16);
                return Number.isFinite(code) ? String.fromCodePoint(code) : '';
            }

            if (lower.startsWith('#')) {
                const code = Number.parseInt(lower.slice(1), 10);
                return Number.isFinite(code) ? String.fromCodePoint(code) : '';
            }

            switch (lower) {
                case 'colon':
                    return ':';
                case 'tab':
                    return '\t';
                case 'newline':
                    return '\n';
                default:
                    return '';
            }
        }
    );
}

function getLocalName(name: string): string {
    const lower = name.toLowerCase();
    const colon = lower.lastIndexOf(':');
    return colon === -1 ? lower : lower.slice(colon + 1);
}