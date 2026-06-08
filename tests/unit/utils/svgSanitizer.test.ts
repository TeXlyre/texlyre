import { sanitizeSvg } from '@src/utils/svgSanitizer';

describe('SVG Sanitizer', () => {
    describe('sanitizeSvg', () => {
        it('should preserve safe svg content', () => {
            const svg = '<svg xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="10" height="10"/></svg>';
            const result = sanitizeSvg(svg);

            expect(result).toContain('<svg');
            expect(result).toContain('<rect');
            expect(result).toContain('width="10"');
        });

        it('should strip script tags and their content', () => {
            const svg = '<svg><script>alert(1)</script><rect/></svg>';
            const result = sanitizeSvg(svg);

            expect(result).not.toContain('<script');
            expect(result).not.toContain('alert(1)');
            expect(result).toContain('<rect');
        });

        it('should strip blocked tags', () => {
            const svg = '<svg><iframe src="evil.html"></iframe><foreignObject/></svg>';
            const result = sanitizeSvg(svg);

            expect(result).not.toContain('<iframe');
        });

        it('should remove event handler attributes', () => {
            const svg = '<svg><rect onclick="alert(1)" onload="evil()"/></svg>';
            const result = sanitizeSvg(svg);

            expect(result).not.toContain('onclick');
            expect(result).not.toContain('onload');
            expect(result).toContain('<rect');
        });

        it('should drop srcdoc and srcset attributes', () => {
            const svg = '<svg><image srcdoc="x" srcset="y"/></svg>';
            const result = sanitizeSvg(svg);

            expect(result).not.toContain('srcdoc');
            expect(result).not.toContain('srcset');
        });

        it('should block javascript protocol in urls', () => {
            const svg = '<svg><a href="javascript:alert(1)"><rect/></a></svg>';
            const result = sanitizeSvg(svg);

            expect(result).not.toContain('javascript:');
        });

        it('should block dangerous protocols obfuscated with entities', () => {
            const svg = '<svg><a href="java&#115;cript:alert(1)"/></svg>';
            const result = sanitizeSvg(svg);

            expect(result).not.toContain('alert(1)');
        });

        it('should preserve fragment references', () => {
            const svg = '<svg><use href="#icon"/></svg>';
            const result = sanitizeSvg(svg);

            expect(result).toContain('href="#icon"');
        });

        it('should preserve xlink:href fragments', () => {
            const svg = '<svg><use xlink:href="#icon"/></svg>';
            const result = sanitizeSvg(svg);

            expect(result).toContain('#icon');
        });

        it('should allow safe data url images', () => {
            const svg = '<svg><image href="data:image/png;base64,iVBORw0KGgo="/></svg>';
            const result = sanitizeSvg(svg);

            expect(result).toContain('data:image/png');
        });

        it('should block data:text/html urls', () => {
            const svg = '<svg><image href="data:text/html,<script>alert(1)</script>"/></svg>';
            const result = sanitizeSvg(svg);

            expect(result).not.toContain('data:text/html');
        });

        it('should block remote urls by default', () => {
            const svg = '<svg><image href="https://evil.com/x.png"/></svg>';
            const result = sanitizeSvg(svg);

            expect(result).not.toContain('evil.com');
        });

        it('should allow remote urls when opted in', () => {
            const svg = '<svg><image href="https://example.com/x.png"/></svg>';
            const result = sanitizeSvg(svg, { allowRemoteUrls: true });

            expect(result).toContain('example.com');
        });

        it('should allow same-origin urls relative to baseUrl', () => {
            const svg = '<svg><image href="https://my.host/x.png"/></svg>';
            const result = sanitizeSvg(svg, { baseUrl: 'https://my.host/' });

            expect(result).toContain('my.host');
        });

        it('should strip unsafe animations targeting href', () => {
            const svg = '<svg><animate attributeName="href" to="javascript:alert(1)"/></svg>';
            const result = sanitizeSvg(svg);

            expect(result).not.toContain('<animate');
        });

        it('should strip animations with dangerous values', () => {
            const svg = '<svg><set attributeName="fill" to="javascript:alert(1)"/></svg>';
            const result = sanitizeSvg(svg);

            expect(result).not.toContain('<set');
        });

        it('should preserve safe animations', () => {
            const svg = '<svg><animate attributeName="opacity" from="0" to="1"/></svg>';
            const result = sanitizeSvg(svg);

            expect(result).toContain('<animate');
            expect(result).toContain('opacity');
        });

        it('should reject style attributes with url()', () => {
            const svg = '<svg><rect style="fill:url(http://evil.com/x)"/></svg>';
            const result = sanitizeSvg(svg);

            expect(result).not.toContain('style');
        });

        it('should preserve safe style attributes', () => {
            const svg = '<svg><rect style="fill:red"/></svg>';
            const result = sanitizeSvg(svg);

            expect(result).toContain('style="fill:red"');
        });

        it('should preserve comments', () => {
            const svg = '<svg><!-- keep me --><rect/></svg>';
            const result = sanitizeSvg(svg);

            expect(result).toContain('<!-- keep me -->');
        });

        it('should handle empty input', () => {
            expect(sanitizeSvg('')).toBe('');
        });

        it('should recursively sanitize nested svg data urls', () => {
            const inner = encodeURIComponent('<svg><script>alert(1)</script></svg>');
            const svg = `<svg><image href="data:image/svg+xml,${inner}"/></svg>`;
            const result = sanitizeSvg(svg);

            expect(result).not.toContain('alert(1)');
        });
    });

    describe('namespaced tags', () => {
        it('should strip namespaced blocked tags', () => {
            const result = sanitizeSvg('<svg:script>alert(1)</svg:script>');

            expect(result).not.toContain('alert(1)');
            expect(result).not.toContain('script');
        });

        it('should strip namespaced blocked tags nested in svg', () => {
            const result = sanitizeSvg(
                '<svg><svg:script>alert(1)</svg:script><rect/></svg>',
            );

            expect(result).not.toContain('alert(1)');
            expect(result).toContain('<rect');
        });
    });

    describe('malformed input', () => {
        it('should not throw on a truncated tag', () => {
            expect(() => sanitizeSvg('<svg><rect')).not.toThrow();
        });

        it('should not throw on stray angle brackets', () => {
            expect(() => sanitizeSvg('<<<>>>')).not.toThrow();
        });

        it('should not throw on an unterminated comment', () => {
            expect(() => sanitizeSvg('<svg><!-- unterminated')).not.toThrow();
        });

        it('should not throw on plain non-svg text', () => {
            expect(() => sanitizeSvg('not svg at all')).not.toThrow();
        });

        it('should not leak a script tag from truncated malformed markup', () => {
            const result = sanitizeSvg('<svg><script>alert(1)<rect');

            expect(result).not.toContain('alert(1)');
        });

        it('should not leak javascript protocol from a malformed attribute', () => {
            const result = sanitizeSvg('<svg><a href="javascript:alert(1)" <rect');

            expect(result).not.toContain('javascript:alert(1)');
        });

        it('should not recurse infinitely on deeply nested svg data urls', () => {
            const inner = encodeURIComponent('<svg><script>alert(1)</script></svg>');
            const level1 = encodeURIComponent(
                `<svg><image href="data:image/svg+xml,${inner}"/></svg>`,
            );
            const svg = `<svg><image href="data:image/svg+xml,${level1}"/></svg>`;

            expect(() => sanitizeSvg(svg)).not.toThrow();
            expect(sanitizeSvg(svg)).not.toContain('alert(1)');
        });
    });
});