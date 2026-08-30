// src/extensions/codemirror/lsp/lspProtocol.ts
import type { Text } from '@codemirror/state';
import type { LSPClient } from '@codemirror/lsp-client';

import { genericLSPService } from '../../../services/GenericLSPService';

export interface LSPPosition {
	line: number;
	character: number;
}

export interface LSPRange {
	start: LSPPosition;
	end: LSPPosition;
}

export interface LSPTextEdit {
	range: LSPRange;
	newText: string;
}

export interface DocumentOffsets {
	from: number;
	to: number;
}

type ClientInternals = LSPClient & {
	serverCapabilities?: Record<string, any>;
	transport?: { send?: (payload: string) => void };
	request?: (method: string, params: unknown) => Promise<any>;
};

export function toFileUri(fileName: string): string {
	return `file:///${fileName}`;
}

export function normalizeUri(uri: string): string {
	const raw = uri ?? '';
	try {
		return decodeURIComponent(raw)
			.replace(/^file:\/+/, '')
			.replace(/^\/+/, '');
	} catch {
		return raw.replace(/^file:\/+/, '').replace(/^\/+/, '');
	}
}

export function isSameDocument(uri: string, fileName: string): boolean {
	return normalizeUri(uri) === normalizeUri(toFileUri(fileName));
}

export function offsetToPosition(doc: Text, offset: number): LSPPosition {
	const line = doc.lineAt(offset);
	return { line: line.number - 1, character: offset - line.from };
}

export function positionToOffset(
	doc: Text,
	position?: LSPPosition | null,
): number | null {
	if (
		!position ||
		typeof position.line !== 'number' ||
		typeof position.character !== 'number' ||
		position.line < 0 ||
		position.line >= doc.lines
	) {
		return null;
	}

	const line = doc.line(position.line + 1);
	return Math.min(line.from + Math.max(0, position.character), line.to);
}

export function rangeToOffsets(
	doc: Text,
	range?: LSPRange | null,
): DocumentOffsets | null {
	const from = positionToOffset(doc, range?.start);
	const to = positionToOffset(doc, range?.end);
	return from === null || to === null ? null : { from, to };
}

export function textEditsToChanges(doc: Text, edits: unknown) {
	if (!Array.isArray(edits)) return [];

	return edits
		.map((edit: LSPTextEdit) => {
			const offsets = rangeToOffsets(doc, edit?.range);
			return offsets
				? {
						...offsets,
						insert: typeof edit.newText === 'string' ? edit.newText : '',
					}
				: null;
		})
		.filter(
			(change): change is { from: number; to: number; insert: string } =>
				change !== null,
		);
}

export function getServerCapabilities(
	client: LSPClient,
): Record<string, any> | undefined {
	return (client as ClientInternals).serverCapabilities;
}

export function supportsCapability(
	client: LSPClient,
	capability: string,
): boolean {
	return Boolean(getServerCapabilities(client)?.[capability]);
}

export function getClientsForFile(
	fileName: string,
	capability?: string,
): LSPClient[] {
	if (!fileName) return [];

	const clients = genericLSPService.getAllClientsForFile(fileName);
	return capability
		? clients.filter((client) => supportsCapability(client, capability))
		: clients;
}

export function getClientLabel(client: LSPClient): string {
	const configId = genericLSPService.getConfigId(client);
	return (
		(configId && genericLSPService.getConfigName(configId)) || configId || 'LSP'
	);
}

export async function requestFrom<T>(
	client: LSPClient,
	method: string,
	params: unknown,
): Promise<T | null> {
	try {
		const result = await (client as ClientInternals).request?.(method, params);
		return (result ?? null) as T | null;
	} catch {
		return null;
	}
}

export function notify(
	client: LSPClient,
	method: string,
	params: unknown,
): void {
	try {
		(client as ClientInternals).transport?.send?.(
			JSON.stringify({ jsonrpc: '2.0', method, params }),
		);
	} catch {}
}

export function createRequestGate() {
	let generation = 0;

	return {
		start: () => ++generation,
		isCurrent: (token: number) => token === generation,
	};
}

export function createDebouncer(delay: number) {
	let timer: ReturnType<typeof setTimeout> | null = null;

	return {
		schedule(run: () => void, overrideDelay = delay) {
			if (timer !== null) clearTimeout(timer);
			timer = setTimeout(() => {
				timer = null;
				run();
			}, overrideDelay);
		},
		cancel() {
			if (timer !== null) clearTimeout(timer);
			timer = null;
		},
	};
}
