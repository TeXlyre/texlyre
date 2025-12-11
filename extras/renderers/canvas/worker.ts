interface ParseMessage {
    type: 'parse';
    svgBuffer: ArrayBuffer;
}

interface ParsedResult {
    type: 'parsed';
    pages: Array<[number, string]>;
    metadata: Array<[number, { width: number; height: number }]>;
}

interface ErrorResult {
    type: 'error';
    error: string;
}

function extractAttribute(element: string, attrName: string): string | null {
    const regex = new RegExp(`${attrName}\\s*=\\s*["']([^"']*)["']`);
    const match = element.match(regex);
    return match ? match[1] : null;
}

function extractSvgAttributes(svgString: string): { attrs: string; width: number; height: number } {
    const svgMatch = svgString.match(/<svg[^>]*>/);
    if (!svgMatch) {
        return { attrs: '', width: 595, height: 842 };
    }

    const svgAttrs = svgMatch[0];
    const width = parseFloat(extractAttribute(svgAttrs, 'width') || '595');
    const height = parseFloat(extractAttribute(svgAttrs, 'height') || '842');

    const filteredAttrs: string[] = [];
    const attrRegex = /(\w+(?:-\w+)*)\s*=\s*["']([^"']*)["']/g;
    let match;

    while ((match = attrRegex.exec(svgAttrs)) !== null) {
        const [, name, value] = match;
        if (name !== 'width' && name !== 'height' && name !== 'viewBox') {
            if (name === 'xlink') {
                filteredAttrs.push(`xmlns:xlink="${value}"`);
            } else if (name === 'h5') {
                filteredAttrs.push(`xmlns:h5="${value}"`);
            } else if (name === 'xmlns') {
                filteredAttrs.push(`xmlns="${value}"`);
            } else {
                filteredAttrs.push(`${name}="${value}"`);
            }
        }
    }

    if (!filteredAttrs.some(attr => attr.startsWith('xmlns='))) {
        filteredAttrs.unshift('xmlns="http://www.w3.org/2000/svg"');
    }

    return { attrs: filteredAttrs.join(' '), width, height };
}

function extractDefs(svgString: string): string {
    const defsMatch = svgString.match(/<defs[^>]*>[\s\S]*?<\/defs>/);
    return defsMatch ? defsMatch[0] : '';
}

function extractStyles(svgString: string): string {
    const styleMatches = svgString.match(/<style[^>]*>[\s\S]*?<\/style>/g);
    return styleMatches ? styleMatches.join('\n') : '';
}

function extractPages(svgString: string): Array<{ fullTag: string; transform: string }> {
    const pages: Array<{ fullTag: string; transform: string }> = [];
    let depth = 0;
    let startIndex = -1;
    let currentTransform = '';

    let i = 0;
    while (i < svgString.length) {
        if (svgString.substring(i, i + 2) === '<g') {
            const tagEnd = svgString.indexOf('>', i);
            const tag = svgString.substring(i, tagEnd + 1);

            if (tag.includes('class="typst-page"') || tag.includes("class='typst-page'")) {
                if (depth === 0) {
                    startIndex = i;
                    currentTransform = extractAttribute(tag, 'transform') || '';
                }
                depth++;
            } else if (startIndex !== -1) {
                depth++;
            }
            i = tagEnd + 1;
        } else if (svgString.substring(i, i + 4) === '</g>') {
            if (startIndex !== -1) {
                depth--;
                if (depth === 0) {
                    const fullTag = svgString.substring(startIndex, i + 4);
                    pages.push({ fullTag, transform: currentTransform });
                    startIndex = -1;
                    currentTransform = '';
                }
            }
            i += 4;
        } else {
            i++;
        }
    }

    return pages;
}

function extractYOffset(transform: string): number {
    const match = transform.match(/translate\([^,]*,\s*([^)]*)\)/);
    return match ? parseFloat(match[1]) || 0 : 0;
}

self.onmessage = (e: MessageEvent<ParseMessage>) => {
    if (e.data.type === 'parse') {
        try {
            const decoder = new TextDecoder();
            const svgString = decoder.decode(e.data.svgBuffer);

            const pages: Array<[number, string]> = [];
            const metadata: Array<[number, { width: number; height: number }]> = [];

            const { attrs: attrsString, width: svgWidth, height: svgHeight } = extractSvgAttributes(svgString);
            const defsString = extractDefs(svgString);
            const stylesString = extractStyles(svgString);
            const pageGroups = extractPages(svgString);

            if (pageGroups.length === 0) {
                pages.push([1, svgString]);
                metadata.push([1, { width: svgWidth, height: svgHeight }]);
            } else {
                pageGroups.forEach((pageGroup, index) => {
                    const pageNumber = index + 1;
                    const yOffset = extractYOffset(pageGroup.transform);

                    let pageHeight = svgHeight;
                    if (index < pageGroups.length - 1) {
                        const nextYOffset = extractYOffset(pageGroups[index + 1].transform);
                        pageHeight = Math.abs(nextYOffset - yOffset);
                    }

                    const pageSvg = `<svg ${attrsString} width="${svgWidth}" height="${pageHeight}" viewBox="0 0 ${svgWidth} ${pageHeight}">
${stylesString}
${defsString}
<g transform="translate(0, ${-yOffset})">
${pageGroup.fullTag}
</g>
</svg>`;

                    pages.push([pageNumber, pageSvg]);
                    metadata.push([pageNumber, { width: svgWidth, height: pageHeight }]);
                });
            }

            const result: ParsedResult = {
                type: 'parsed',
                pages,
                metadata
            };
            self.postMessage(result);
        } catch (err) {
            const errorResult: ErrorResult = {
                type: 'error',
                error: err instanceof Error ? err.message : String(err)
            };
            self.postMessage(errorResult);
        }
    }
};