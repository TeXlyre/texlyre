// src/extensions/codemirror/lsp/lspHover.ts
import type { Extension } from '@codemirror/state';
import { hoverTooltip, type Tooltip } from '@codemirror/view';
import type { LSPClient } from '@codemirror/lsp-client';

import { renderMarkdownHtml } from '../../../utils/markdownUtils';
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

export function renderMarkdown(content: string): HTMLElement {
	const container = document.createElement('div');
	container.className = 'cm-lsp-markdown markdown-content';
	container.innerHTML = renderMarkdownHtml(content);
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
