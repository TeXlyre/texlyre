import { renderMarkdown } from '@src/extensions/codemirror/lsp/lspHover';

describe('LSP Markdown sanitization', () => {
	it('preserves normal formatting and external links', () => {
		const dom = renderMarkdown('**Bold** and [docs](https://example.com/docs)');
		expect(dom.querySelector('strong')?.textContent).toBe('Bold');
		const link = dom.querySelector('a');
		expect(link?.getAttribute('href')).toBe('https://example.com/docs');
		expect(link?.target).toBe('_blank');
		expect(link?.rel).toContain('noopener');
		expect(link?.rel).toContain('noreferrer');
	});

	it('removes injected handlers from hover and completion Markdown links', () => {
		for (const markdown of [
			'[docs](#" onpointerenter="alert)',
			'[docs](#" onmouseover="alert)',
		]) {
			const dom = renderMarkdown(markdown);
			expect(dom.querySelector('a')).not.toBeNull();
			expect(dom.querySelector('[onpointerenter], [onmouseover]')).toBeNull();
		}
	});

	it('removes unsafe URL schemes without removing normal links', () => {
		for (const href of ['javascript:alert', 'data:text/html,hello', 'vbscript:msgbox']) {
			const dom = renderMarkdown(`[docs](${href})`);
			expect(dom.querySelector('a')?.hasAttribute('href')).toBe(false);
		}
	});

	it('keeps HTML input as text', () => {
		const dom = renderMarkdown('<img src=x onerror=alert(1)>');
		expect(dom.querySelector('img')).toBeNull();
		expect(dom.textContent).toContain('<img');
	});
});
