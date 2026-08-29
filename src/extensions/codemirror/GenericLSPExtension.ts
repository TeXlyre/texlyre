// src/extensions/codemirror/GenericLSPExtension.ts
import type { Extension } from '@codemirror/state';
import type {
	CompletionContext,
	CompletionResult,
} from '@codemirror/autocomplete';
import { ViewPlugin, type EditorView, hoverTooltip } from '@codemirror/view';
import type { Tooltip } from '@codemirror/view';
import {
	linter,
	setDiagnostics,
	forEachDiagnostic,
	type Diagnostic,
} from '@codemirror/lint';
import type { LSPClient } from '@codemirror/lsp-client';

import { genericLSPService } from '../../services/GenericLSPService';
import { maskAnnotationText } from './annotations/annotationMasking';
import { createSemanticTokensExtension } from './SemanticTokensLSPExtension';

export interface LSPDiagnostic extends Diagnostic {
	code?: string | number;
	data?: unknown;
}

function detectLanguageId(fileName: string, client?: LSPClient): string {
	const ext = fileName.split('.').pop()?.toLowerCase() || '';

	if (client) {
		const configId = genericLSPService.getConfigId(client);
		if (configId) {
			const langMap = genericLSPService.getLanguageIdMap(configId);
			if (langMap && langMap[ext]) {
				return langMap[ext];
			}
		}
	}

	switch (ext) {
		case 'tex':
		case 'latex':
			return 'latex';
		case 'typ':
			return 'typst';
		case 'bib':
			return 'bibtex';
		case 'md':
			return 'markdown';
		case 'txt':
			return 'plaintext';
		default:
			return 'plaintext';
	}
}

function lspSeverityToCodeMirror(
	severity?: number,
): 'error' | 'warning' | 'info' | 'hint' {
	switch (severity) {
		case 1:
			return 'error';
		case 2:
			return 'warning';
		case 3:
			return 'info';
		case 4:
			return 'hint';
		default:
			return 'warning';
	}
}

function sendNotification(client: LSPClient, method: string, params: any) {
	try {
		const transport = (client as any).transport;
		if (transport?.send) {
			transport.send(JSON.stringify({ jsonrpc: '2.0', method, params }));
		}
	} catch {}
}

function getTextDocumentSyncKind(client: LSPClient): number | undefined {
	const sync = (client as any).serverCapabilities?.textDocumentSync;
	return typeof sync === 'number' ? sync : sync?.change;
}

function offsetToPosition(doc: any, offset: number) {
	const line = doc.lineAt(offset);
	return { line: line.number - 1, character: offset - line.from };
}

function createIncrementalContentChanges(update: any, maskedText: string) {
	const changes: Array<{
		range: {
			start: { line: number; character: number };
			end: { line: number; character: number };
		};
		text: string;
	}> = [];

	update.changes.iterChanges(
		(fromA: number, toA: number, fromB: number, toB: number) => {
			changes.push({
				range: {
					start: offsetToPosition(update.startState.doc, fromA),
					end: offsetToPosition(update.startState.doc, toA),
				},
				text: maskedText.slice(fromB, toB),
			});
		},
	);

	return changes;
}

function lspPositionToOffset(doc: any, position: any): number | null {
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

function lspRangeToOffsets(doc: any, range: any) {
	const from = lspPositionToOffset(doc, range?.start);
	const to = lspPositionToOffset(doc, range?.end);
	return from === null || to === null ? null : { from, to };
}

function applyCompletionEdits(
	view: EditorView,
	insert: string,
	range: any,
	additionalTextEdits: any[],
	fallbackFrom: number,
	fallbackTo: number,
) {
	const doc = view.state.doc;
	const main = range
		? lspRangeToOffsets(doc, range)
		: { from: fallbackFrom, to: fallbackTo };
	if (!main) return;

	const extra = additionalTextEdits
		.map((edit) => {
			const offsets = lspRangeToOffsets(doc, edit?.range);
			return offsets
				? { ...offsets, insert: typeof edit.newText === 'string' ? edit.newText : '' }
				: null;
		})
		.filter(
			(change): change is { from: number; to: number; insert: string } =>
				change !== null,
		);

	const mainChange = { ...main, insert };
	const changes = [...extra, mainChange].sort(
		(a, b) => a.from - b.from || a.to - b.to,
	);

	try {
		const changeSet = view.state.changes(changes);
		const anchor = changeSet.mapPos(main.to, 1);
		view.dispatch({ changes: changeSet, selection: { anchor } });
	} catch {
		view.dispatch({
			changes: mainChange,
			selection: { anchor: main.from + insert.length },
		});
	}
}

function createLSPDiagnosticsExtension(fileName: string): Extension {
	const fileUri = `file:///${fileName}`;
	const diagnosticsByConfig = new Map<string, LSPDiagnostic[]>();
	let mergedDiagnostics: LSPDiagnostic[] = [];

	const diagnosticsPlugin = ViewPlugin.fromClass(
		class {
			private unsubscribe: () => void;
			private view: EditorView;

			constructor(view: EditorView) {
				this.view = view;
				this.unsubscribe = genericLSPService.onDiagnostics(
					(configId, params) => {
						const normalize = (u: string) =>
							decodeURIComponent(u || '')
								.replace(/^file:\/+/, '')
								.replace(/^\/+/, '');
						if (normalize(params.uri) !== normalize(fileUri)) return;

						const doc = this.view.state.doc;
						const mapped: LSPDiagnostic[] = (params.diagnostics || []).map(
							(d: any) => {
								const fromLine = Math.min(d.range.start.line, doc.lines - 1);
								const toLine = Math.min(d.range.end.line, doc.lines - 1);
								const lineFrom = doc.line(fromLine + 1);
								const lineTo = doc.line(toLine + 1);
								const from = Math.min(
									lineFrom.from + d.range.start.character,
									lineFrom.to,
								);
								const to = Math.min(
									lineTo.from + d.range.end.character,
									lineTo.to,
								);

								return {
									from: Math.max(0, from),
									to: Math.max(from, to),
									severity: lspSeverityToCodeMirror(d.severity),
									message: d.message,
									source:
										d.source ||
										genericLSPService.getConfigName(configId) ||
										configId,
									...(d.code !== undefined ? { code: d.code } : {}),
									...(d.data !== undefined ? { data: d.data } : {}),
								} satisfies LSPDiagnostic;
							},
						);

						diagnosticsByConfig.set(configId, mapped);
						mergedDiagnostics = Array.from(diagnosticsByConfig.values()).flat();

						queueMicrotask(() => {
							if (!this.view.dom.isConnected) return;

							const lspSources = new Set(
								mergedDiagnostics.map((d) => d.source).filter(Boolean),
							);

							const preserved: LSPDiagnostic[] = [];
							forEachDiagnostic(this.view.state, (d, from, to) => {
								if (!lspSources.has(d.source ?? '')) {
									preserved.push({ ...d, from, to });
								}
							});

							this.view.dispatch(
								setDiagnostics(this.view.state, [
									...preserved,
									...mergedDiagnostics,
								]),
							);
						});
					},
				);
			}

			destroy() {
				this.unsubscribe();
				diagnosticsByConfig.clear();
				mergedDiagnostics = [];
			}
		},
	);

	const diagnosticsLinter = linter(() => mergedDiagnostics, { delay: 0 });

	return [diagnosticsPlugin, diagnosticsLinter];
}

function renderHoverContent(content: string): HTMLElement {
	const escapeHtml = (t: string) =>
		t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
	const inline = (t: string) =>
		escapeHtml(t)
			.replace(/`([^`]+)`/g, '<code>$1</code>')
			.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
			.replace(/\*(.+?)\*\*/g, '<em>$1</em>')
			.replace(
				/\[([^\]]+)\]\(([^)]+)\)/g,
				'<a href="$2" target="_blank" rel="noreferrer">$1</a>',
			);

	const lines = content.split('\n');
	const out: string[] = [];
	let inCode = false;
	let code: string[] = [];
	let list = false;
	let para: string[] = [];
	const flushPara = () => {
		if (para.length) {
			out.push(`<p>${inline(para.join(' '))}</p>`);
			para = [];
		}
	};
	const closeList = () => {
		if (list) {
			out.push('</ul>');
			list = false;
		}
	};

	for (const line of lines) {
		if (/^```/.test(line)) {
			if (inCode) {
				out.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`);
				code = [];
				inCode = false;
			} else {
				flushPara();
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
			flushPara();
			closeList();
			const lvl = heading[1].length;
			out.push(`<h${lvl}>${inline(heading[2])}</h${lvl}>`);
			continue;
		}
		if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
			flushPara();
			closeList();
			out.push('<hr>');
			continue;
		}
		const item = line.match(/^\s*[-*+]\s+(.*)$/);
		if (item) {
			flushPara();
			if (!list) {
				out.push('<ul>');
				list = true;
			}
			out.push(`<li>${inline(item[1])}</li>`);
			continue;
		}
		if (line.trim() === '') {
			flushPara();
			closeList();
			continue;
		}
		para.push(line);
	}
	if (inCode)
		out.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`);
	flushPara();
	closeList();

	const container = document.createElement('div');
	container.className = 'cm-lsp-markdown';
	container.innerHTML = out.join('');
	return container;
}

function createAggregatedHoverExtension(fileName: string): Extension {
	return hoverTooltip(async (view, pos) => {
		const clients = genericLSPService.getAllClientsForFile(fileName);
		if (clients.length === 0) return null;

		const doc = view.state.doc;
		const line = doc.lineAt(pos);
		const character = pos - line.from;

		const hoverPromises = clients.map(async (client) => {
			try {
				const capabilities = (client as any).serverCapabilities;
				if (capabilities && capabilities.hoverProvider === false) return null;

				const result = await (client as any).request('textDocument/hover', {
					textDocument: { uri: `file:///${fileName}` },
					position: { line: line.number - 1, character },
				});

				if (!result?.contents) return null;

				let content = '';
				const contents = result.contents;

				if (typeof contents === 'string') {
					content = contents;
				} else if (
					contents.kind === 'markdown' ||
					contents.kind === 'plaintext'
				) {
					content = contents.value;
				} else if (Array.isArray(contents)) {
					content = contents
						.map((c: any) => (typeof c === 'string' ? c : c.value || ''))
						.filter(Boolean)
						.join('\n\n');
				} else if (contents.value) {
					content = contents.value;
				}

				const trimmed = content.trim();
				if (!trimmed) return null;

				const configId = genericLSPService.getConfigId(client);
				const label =
					(configId && genericLSPService.getConfigName(configId)) ||
					configId ||
					'LSP';
				return { label, content: trimmed };
			} catch {
				return null;
			}
		});

		const results = await Promise.all(hoverPromises);
		const validResults = results.filter(
			(r): r is { label: string; content: string } => r !== null,
		);
		if (validResults.length === 0) return null;

		const seen = new Set<string>();
		const uniqueResults = validResults.filter((r) => {
			const key = `${r.label}::${r.content}`;
			if (seen.has(key)) return false;
			seen.add(key);
			return true;
		});

		const dom = document.createElement('div');
		dom.className = 'cm-tooltip-hover';

		uniqueResults.forEach((entry, i) => {
			if (i > 0) dom.appendChild(document.createElement('hr'));

			const header = document.createElement('div');
			header.className = 'cm-tooltip-hover-source';
			header.textContent = entry.label;
			dom.appendChild(header);

			dom.appendChild(renderHoverContent(entry.content));
		});

		return {
			pos,
			create: () => ({ dom }),
			above: true,
		} as Tooltip;
	});
}

function createDocumentSyncExtension(fileName: string): Extension {
	const fileUri = `file:///${fileName}`;
	let version = 1;

	return ViewPlugin.fromClass(
		class {
			private openedFor = new Set<LSPClient>();
			private readonly view: EditorView;
			private readonly handleFileSaved: () => void;

			constructor(view: EditorView) {
				this.view = view;
				this.syncOpenState(view);
				this.handleFileSaved = () => this.notifySaved();
				document.addEventListener('file-saved', this.handleFileSaved);
			}

			private syncOpenState(view: EditorView) {
				const clients = genericLSPService.getAllClientsForFile(fileName);
				const text = maskAnnotationText(view.state);

				clients.forEach((client) => {
					if (this.openedFor.has(client)) return;
					const languageId = detectLanguageId(fileName, client);
					sendNotification(client, 'textDocument/didOpen', {
						textDocument: { uri: fileUri, languageId, version, text },
					});
					this.openedFor.add(client);
				});
			}

			private notifySaved() {
				const text = maskAnnotationText(this.view.state);
				this.openedFor.forEach((client) => {
					const save = (client as any).serverCapabilities?.textDocumentSync
						?.save;
					if (!save) return;
					sendNotification(client, 'textDocument/didSave', {
						textDocument: { uri: fileUri },
						...(save.includeText ? { text } : {}),
					});
				});
			}

			update(update: any) {
				this.syncOpenState(update.view);

				if (!update.docChanged) return;
				version++;
				const text = maskAnnotationText(update.state);
				const canUseIncrementalChanges =
					text.length === update.state.doc.length &&
					maskAnnotationText(update.startState).length ===
						update.startState.doc.length;
				const incrementalChanges = canUseIncrementalChanges
					? createIncrementalContentChanges(update, text)
					: [];

				this.openedFor.forEach((client) => {
					const syncKind = getTextDocumentSyncKind(client);
					if (syncKind === 0) return;
					const contentChanges =
						syncKind === 2 && incrementalChanges.length > 0
							? incrementalChanges
							: [{ text }];

					sendNotification(client, 'textDocument/didChange', {
						textDocument: { uri: fileUri, version },
						contentChanges,
					});
				});
			}

			destroy() {
				document.removeEventListener('file-saved', this.handleFileSaved);
				this.openedFor.forEach((client) => {
					sendNotification(client, 'textDocument/didClose', {
						textDocument: { uri: fileUri },
					});
				});
				this.openedFor.clear();
			}
		},
	);
}

function documentationToText(documentation: any): string {
	if (!documentation) return '';
	if (typeof documentation === 'string') return documentation;
	return typeof documentation.value === 'string' ? documentation.value : '';
}

function createCompletionInfo(client: LSPClient, item: any) {
	return async (): Promise<HTMLElement | null> => {
		const direct = documentationToText(item.documentation);
		if (direct) return renderHoverContent(direct);

		const capabilities = (client as any).serverCapabilities;
		if (capabilities?.completionProvider?.resolveProvider !== true) return null;

		try {
			const resolved = await (client as any).request(
				'completionItem/resolve',
				item,
			);
			const text = documentationToText(resolved?.documentation);
			return text ? renderHoverContent(text) : null;
		} catch {
			return null;
		}
	};
}

export function getGenericLSPExtensionsForFile(fileName: string): Extension[] {
	if (!fileName) return [];

	return [
		createDocumentSyncExtension(fileName),
		createAggregatedHoverExtension(fileName),
		createLSPDiagnosticsExtension(fileName),
		createSemanticTokensExtension(fileName),
	];
}

export function getGenericLSPCompletionSources(fileName: string) {
	if (!fileName) return [];

	return [
		async (context: CompletionContext): Promise<CompletionResult | null> => {
			const clients = genericLSPService.getAllClientsForFile(fileName);
			if (clients.length === 0) return null;

			for (const client of clients) {
				const capabilities = (client as any).serverCapabilities;
				if (capabilities && capabilities.completionProvider === undefined) {
					continue;
				}

				try {
					const doc = context.state.doc;
					const line = doc.lineAt(context.pos);
					const character = context.pos - line.from;

					const result = await (client as any).request(
						'textDocument/completion',
						{
							textDocument: { uri: `file:///${fileName}` },
							position: { line: line.number - 1, character },
						},
					);
					const items = Array.isArray(result) ? result : result?.items;

					if (!Array.isArray(items) || items.length === 0) {
						continue;
					}

					const options = items.map((item: any) => {
						const range = item.textEdit?.range;
						const insert =
							item.textEdit?.newText || item.insertText || item.label;
						const additionalTextEdits = Array.isArray(item.additionalTextEdits)
							? item.additionalTextEdits
							: [];
						return {
							label: item.label,
							type: item.kind === 1 ? 'text' : 'keyword',
							detail: item.detail,
							info: createCompletionInfo(client, item),
							apply:
								range || additionalTextEdits.length > 0
									? (
											view: EditorView,
											_completion: unknown,
											from: number,
											to: number,
										) =>
											applyCompletionEdits(
												view,
												insert,
												range,
												additionalTextEdits,
												from,
												to,
											)
									: insert,
						};
					});

					return {
						from: context.pos,
						options,
					};
				} catch {}
			}

			return null;
		},
	];
}
