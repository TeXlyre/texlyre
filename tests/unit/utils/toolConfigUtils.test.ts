import {
	normalizeLspConfig,
	normalizeTypesetterConfig,
	sanitizeToolIcon,
} from '@src/utils/toolConfigUtils';

const svg = '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M0 0" /></svg>';

describe('recipe icon sanitization', () => {
	it('preserves SVG icons and strips executable markup', () => {
		expect(sanitizeToolIcon(svg)).toContain('<path');
		const malicious = '<svg onload="alert(1)"><foreignObject><img src=x onerror="alert(2)"></foreignObject><path onclick="alert(3)" d="M0 0" /></svg>';
		const clean = sanitizeToolIcon(malicious);
		expect(clean).toContain('<svg');
		expect(clean).not.toMatch(/onload|onerror|onclick|foreignObject|alert/i);
	});

	it('supports image URLs, data URLs, and sanitized IMG markup', () => {
		for (const src of [
			'https://example.com/icon.png', '/icons/icon.jpg', './icon.webp',
			'data:image/png;base64,iVBORw0KGgo=',
			'data:image/jpeg;base64,/9j/4AAQSkZJRg==',
			'data:image/gif;base64,R0lGODlh',
			'data:image/avif;base64,AAAA',
			'data:image/svg+xml,%3Csvg%3E%3C%2Fsvg%3E',
		]) expect(sanitizeToolIcon(src)).toBe(src);
		const clean = sanitizeToolIcon('<img src="/icon.png" onerror="alert(1)">');
		expect(clean).toContain('<img');
		expect(clean).toContain('/icon.png');
		expect(clean).not.toContain('onerror');
	});

	it('rejects non-image markup, unsafe URLs, and oversize inputs', () => {
		for (const icon of [
			'<script>alert(1)</script>', '<img src="javascript:alert(1)">',
			'javascript:alert(1)', 'data:text/html,foo', 'blob:https://example.com/a',
			'<svg>' + 'x'.repeat(263_000) + '</svg',
		]) expect(sanitizeToolIcon(icon)).toBeUndefined();
	});

	it('sanitizes both imported recipes and previously stored icons', () => {
		const icon = '<svg onload="alert(1)"><path d="M0 0" /></svg>';
		const recipes = [
			normalizeLspConfig({ id: 'lsp', transportConfig: { type: 'worker' }, icon }),
			normalizeTypesetterConfig({ id: 'typst', projectType: 'tex', transportConfig: { type: 'websocket' }, icon }),
		];
		for (const recipe of recipes) {
			expect(recipe?.icon).toContain('<svg');
			expect(recipe?.icon).not.toContain('onload');
		}
		expect(sanitizeToolIcon(icon)).not.toContain('onload');
	});
});
