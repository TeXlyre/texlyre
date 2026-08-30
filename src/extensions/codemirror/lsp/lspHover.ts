// src/extensions/codemirror/lsp/lspHover.ts
import type { Extension } from '@codemirror/state';
import { hoverTooltip, type Tooltip } from '@codemirror/view';
import type { LSPClient } from '@codemirror/lsp-client';

import {
	getClientLabel,
	getClientsForFile,
	getServerCapabilities,
	offsetToPosition,
	requestFrom,
	toFileUri,
} from './lspProtocol';

interface HoverEntry {
	label: string;
	content: string;
}

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');
}

function renderInline(value: string): string {
	return escapeHtml(value)
		.replace(/`([^`]+)`/g, '<code>$1</code>')
		.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
		.replace(/\*(.+?)\*/g, '<em>$1</em>')
		.replace(
			/\[([^\]]+)\]\(([^)]+)\)/g,
			'<a href="$2" target="_blank" rel="noreferrer">$1</a>',
		);
}

export function renderMarkdown(content: string): HTMLElement {
	const out: string[] = [];
	let code: string[] = [];
	let paragraph: string[] = [];
	let inCode = false;
	let inList = false;

	const flushParagraph = () => {
		if (paragraph.length === 0) return;
		out.push(`<p>${renderInline(paragraph.join(' '))}</p>`);
		paragraph = [];
	};

	const closeList = () => {
		if (!inList) return;
		out.push('</ul>');
		inList = false;
	};

	for (const line of content.split('\n')) {
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

		const item = line.match(/^\s*[-*+]\s+(.*)$/);
		if (item) {
			flushParagraph();
			if (!inList) {
				out.push('<ul>');
				inList = true;
			}
			out.push(`<li>${renderInline(item[1])}</li>`);
			continue;
		}

		if (line.trim() === '') {
			flushParagraph();
			closeList();
			continue;
		}

		paragraph.push(line);
	}

	if (inCode)
		out.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`);
	flushParagraph();
	closeList();

	const container = document.createElement('div');
	container.className = 'cm-lsp-markdown';
	container.innerHTML = out.join('');
	return container;
}

export function toDocumentationText(documentation: unknown): string {
	if (!documentation) return '';
	if (typeof documentation === 'string') return documentation;
	const value = (documentation as { value?: unknown }).value;
	return typeof value === 'string' ? value : '';
}

function toHoverContent(contents: any): string {
	if (typeof contents === 'string') return contents;
	if (Array.isArray(contents)) {
		return contents
			.map((entry) => (typeof entry === 'string' ? entry : entry?.value || ''))
			.filter(Boolean)
			.join('\n\n');
	}
	return typeof contents?.value === 'string' ? contents.value : '';
}

export function createLSPCompletionInfo(client: LSPClient, item: any) {
	return async (): Promise<HTMLElement | null> => {
		const direct = toDocumentationText(item.documentation);
		if (direct) return renderMarkdown(direct);

		const capabilities = getServerCapabilities(client);
		if (capabilities?.completionProvider?.resolveProvider !== true) return null;

		const resolved = await requestFrom<any>(
			client,
			'completionItem/resolve',
			item,
		);
		const text = toDocumentationText(resolved?.documentation);
		return text ? renderMarkdown(text) : null;
	};
}

export function createLSPHoverExtension(fileName: string): Extension {
	if (!fileName) return [];

	const fileUri = toFileUri(fileName);

	return hoverTooltip(async (view, pos) => {
		const clients = getClientsForFile(fileName);
		if (clients.length === 0) return null;

		const position = offsetToPosition(view.state.doc, pos);
		const results = await Promise.all(
			clients.map(async (client): Promise<HoverEntry | null> => {
				if (getServerCapabilities(client)?.hoverProvider === false) return null;

				const result = await requestFrom<any>(client, 'textDocument/hover', {
					textDocument: { uri: fileUri },
					position,
				});
				const content = toHoverContent(result?.contents).trim();
				return content ? { label: getClientLabel(client), content } : null;
			}),
		);

		const seen = new Set<string>();
		const entries = results.filter((entry): entry is HoverEntry => {
			if (!entry) return false;
			const key = `${entry.label}::${entry.content}`;
			if (seen.has(key)) return false;
			seen.add(key);
			return true;
		});
		if (entries.length === 0) return null;

		const dom = document.createElement('div');
		dom.className = 'cm-tooltip-hover';

		entries.forEach((entry, index) => {
			if (index > 0) dom.appendChild(document.createElement('hr'));

			const header = document.createElement('div');
			header.className = 'cm-tooltip-hover-source';
			header.textContent = entry.label;
			dom.appendChild(header);
			dom.appendChild(renderMarkdown(entry.content));
		});

		return { pos, create: () => ({ dom }), above: true } satisfies Tooltip;
	});
}
