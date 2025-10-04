// extras/renderers/svg/SvgPageManager.ts
export class SvgPageManager {
    private fullSvgText: string = '';
    private pageGroups: Map<number, { element: string; transform: string }> = new Map();
    private cachedPageSvgs: Map<number, string> = new Map();
    private pageMetadata: Map<number, { width: number; height: number }> = new Map();
    private totalPages: number = 0;
    private svgAttributes: Map<string, string> = new Map();
    private defs: string = '';
    private styles: string = '';
    private readonly maxCachedPages: number;
    private readonly preloadDistance: number;
    private accessOrder: number[] = [];

    constructor(maxCachedPages = 10, preloadDistance = 2) {
        this.maxCachedPages = maxCachedPages;
        this.preloadDistance = preloadDistance;
    }

    parseSvgDocument(svgText: string): number {
        this.clear();
        this.fullSvgText = svgText;

        const parser = new DOMParser();
        const doc = parser.parseFromString(svgText, 'image/svg+xml');

        const svgElement = doc.querySelector('svg');
        if (!svgElement) {
            throw new Error('No SVG element found');
        }

        // Store SVG attributes
        Array.from(svgElement.attributes).forEach(attr => {
            if (attr.name !== 'width' && attr.name !== 'height' && attr.name !== 'viewBox') {
                this.svgAttributes.set(attr.name, attr.value);
            }
        });

        // Store defs and styles
        const defsElement = doc.querySelector('defs');
        if (defsElement) {
            this.defs = new XMLSerializer().serializeToString(defsElement);
        }

        const styleElements = doc.querySelectorAll('style');
        styleElements.forEach(style => {
            this.styles += new XMLSerializer().serializeToString(style);
        });

        // Look for Typst page elements
        const pageElements = doc.querySelectorAll('g.typst-page');

        if (pageElements.length === 0) {
            // Fallback for single page or non-Typst SVGs
            const svgContent = new XMLSerializer().serializeToString(svgElement);
            this.pageGroups.set(1, { element: svgContent, transform: '' });
            const width = parseFloat(svgElement.getAttribute('width') || '595');
            const height = parseFloat(svgElement.getAttribute('height') || '842');
            this.pageMetadata.set(1, { width, height });
            this.totalPages = 1;
            return 1;
        }

        // Process each page
        pageElements.forEach((pageElement, index) => {
            const pageNumber = index + 1;

            // Serialize the page element
            const pageContent = new XMLSerializer().serializeToString(pageElement);

            // Get transform
            const transform = pageElement.getAttribute('transform') || '';

            this.pageGroups.set(pageNumber, { element: pageContent, transform });

            // Calculate page dimensions
            let yOffset = 0;
            if (transform) {
                const translateMatch = transform.match(/translate\([^,]*,\s*([^)]*)\)/);
                if (translateMatch) {
                    yOffset = parseFloat(translateMatch[1]) || 0;
                }
            }

            // Determine page height
            let height = 842; // Default A4
            if (index < pageElements.length - 1) {
                const nextElement = pageElements[index + 1];
                const nextTransform = nextElement.getAttribute('transform');
                if (nextTransform) {
                    const nextTranslateMatch = nextTransform.match(/translate\([^,]*,\s*([^)]*)\)/);
                    if (nextTranslateMatch) {
                        const nextYOffset = parseFloat(nextTranslateMatch[1]) || 0;
                        height = Math.abs(nextYOffset - yOffset);
                    }
                }
            }

            const width = parseFloat(svgElement.getAttribute('width') || '595');
            this.pageMetadata.set(pageNumber, { width, height });
        });

        this.totalPages = pageElements.length;
        return this.totalPages;
    }

    getPage(pageNumber: number): string | null {
        if (!this.pageGroups.has(pageNumber)) {
            return null;
        }

        if (this.cachedPageSvgs.has(pageNumber)) {
            this.updateAccessOrder(pageNumber);
            return this.cachedPageSvgs.get(pageNumber) || null;
        }

        const pageData = this.pageGroups.get(pageNumber);
        if (!pageData) return null;

        const metadata = this.pageMetadata.get(pageNumber);
        if (!metadata) return null;

        // Parse the transform to get y-offset
        let yOffset = 0;
        if (pageData.transform) {
            const translateMatch = pageData.transform.match(/translate\([^,]*,\s*([^)]*)\)/);
            if (translateMatch) {
                yOffset = parseFloat(translateMatch[1]) || 0;
            }
        }

        // Build the SVG for this page
        let pageSvg = '<svg';

        // Add stored attributes
        this.svgAttributes.forEach((value, key) => {
            pageSvg += ` ${key}="${value}"`;
        });

        // Add dimensions
        pageSvg += ` width="${metadata.width}" height="${metadata.height}"`;
        pageSvg += ` viewBox="0 0 ${metadata.width} ${metadata.height}">`;

        // Add styles and defs
        pageSvg += this.styles;
        pageSvg += this.defs;

        // Add wrapper group with transform to position the page correctly
        pageSvg += `<g transform="translate(0, ${-yOffset})">`;
        pageSvg += pageData.element;
        pageSvg += '</g>';
        pageSvg += '</svg>';

        this.cachedPageSvgs.set(pageNumber, pageSvg);
        this.updateAccessOrder(pageNumber);
        this.evictPagesIfNeeded();

        return pageSvg;
    }

    preloadPages(currentPage: number, scrollView: boolean = false): void {
        const pagesToPreload: number[] = [];

        if (scrollView) {
            for (let i = 1; i <= this.preloadDistance; i++) {
                const prev = currentPage - i;
                const next = currentPage + i;

                if (prev >= 1 && prev <= this.totalPages) {
                    pagesToPreload.push(prev);
                }
                if (next >= 1 && next <= this.totalPages) {
                    pagesToPreload.push(next);
                }
            }
        } else {
            const next = currentPage + 1;
            const prev = currentPage - 1;

            if (prev >= 1 && prev <= this.totalPages) {
                pagesToPreload.push(prev);
            }
            if (next >= 1 && next <= this.totalPages) {
                pagesToPreload.push(next);
            }
        }

        pagesToPreload.forEach(pageNum => {
            if (!this.cachedPageSvgs.has(pageNum)) {
                this.getPage(pageNum);
            }
        });
    }

    getPageMetadata(pageNumber: number): { width: number; height: number } | null {
        return this.pageMetadata.get(pageNumber) || null;
    }

    getPageCount(): number {
        return this.totalPages;
    }

    isPageLoaded(pageNumber: number): boolean {
        return this.cachedPageSvgs.has(pageNumber);
    }

    private updateAccessOrder(pageNumber: number): void {
        const index = this.accessOrder.indexOf(pageNumber);
        if (index > -1) {
            this.accessOrder.splice(index, 1);
        }
        this.accessOrder.push(pageNumber);
    }

    private evictPagesIfNeeded(): void {
        while (this.cachedPageSvgs.size > this.maxCachedPages && this.accessOrder.length > 0) {
            const pageToEvict = this.accessOrder.shift();
            if (pageToEvict !== undefined) {
                this.cachedPageSvgs.delete(pageToEvict);
            }
        }
    }

    clear(): void {
        this.fullSvgText = '';
        this.pageGroups.clear();
        this.cachedPageSvgs.clear();
        this.pageMetadata.clear();
        this.svgAttributes.clear();
        this.defs = '';
        this.styles = '';
        this.accessOrder = [];
        this.totalPages = 0;
    }
}