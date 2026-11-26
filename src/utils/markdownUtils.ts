// src/utils/markdownUtils.ts
import DOMPurify from 'dompurify';

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

function renderInline(value: string): string {
	const tokens =
		/`([^`]+)`|\[([^[\]]+)\]\(([^)]+)\)|\*\*(.+?)\*\*|\*([^*]+)\*/g;
	const out: string[] = [];
	let offset = 0;
	for (const match of value.matchAll(tokens)) {
		out.push(escapeHtml(value.slice(offset, match.index)));
		const [, code, label, href, strong, emphasis] = match;
		if (code !== undefined) {
			out.push(`<code>${escapeHtml(code)}</code>`);
		} else if (label !== undefined) {
			out.push(
				`<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${renderInline(label)}</a>`,
			);
		} else if (strong !== undefined) {
			out.push(`<strong>${renderInline(strong)}</strong>`);
		} else {
			out.push(`<em>${renderInline(emphasis)}</em>`);
		}
		offset = match.index + match[0].length;
	}
	out.push(escapeHtml(value.slice(offset)));
	return out.join('');
}

export function renderMarkdownHtml(content: string): string {
	const out: string[] = [];
	let code: string[] = [];
	let paragraph: string[] = [];
	let inCode = false;
	let list: 'ul' | 'ol' | null = null;

	const flushParagraph = () => {
		if (paragraph.length === 0) return;
		out.push(`<p>${renderInline(paragraph.join('\n'))}</p>`);
		paragraph = [];
	};

	const closeList = () => {
		if (!list) return;
		out.push(`</${list}>`);
		list = null;
	};

	for (const line of content.split(/\r?\n/)) {
		if (/^```/.test(line)) {
			if (inCode) {
				out.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`);
				code = [];
				inCode = false;
			} else {
				flushParagraph();
				closeList();
				inCode = true;
			}
			continue;
		}

		if (inCode) {
			code.push(line);
			continue;
		}

		const heading = line.match(/^(#{1,6})\s+(.*)$/);
		if (heading) {
			flushParagraph();
			closeList();
			const level = heading[1].length;
			out.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
			continue;
		}

		if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
			flushParagraph();
			closeList();
			out.push('<hr>');
			continue;
		}

		const item = line.match(/^\s*(?:[-*+]|(\d+)\.)\s+(.*)$/);
		if (item) {
			flushParagraph();
			const type = item[1] === undefined ? 'ul' : 'ol';
			if (list !== type) {
				closeList();
				list = type;
				out.push(type === 'ol' ? `<ol start="${item[1]}">` : '<ul>');
			}
			out.push(`<li>${renderInline(item[2])}</li>`);
			continue;
		}

		if (line.trim() === '') {
			flushParagraph();
			closeList();
			continue;
		}

		closeList();
		paragraph.push(line);
	}

	if (inCode)
		out.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`);
	flushParagraph();
	closeList();

	return DOMPurify.sanitize(out.join(''), {
		ALLOWED_TAGS: [
			'p',
			'h1',
			'h2',
			'h3',
			'h4',
			'h5',
			'h6',
			'hr',
			'ul',
			'ol',
			'li',
			'pre',
			'code',
			'strong',
			'em',
			'a',
		],
		ALLOWED_ATTR: ['href', 'target', 'rel', 'start'],
		ALLOW_DATA_ATTR: false,
		ALLOW_ARIA_ATTR: false,
	});
}
