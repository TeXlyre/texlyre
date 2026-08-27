// src/extensions/codemirror/lsp/lspDiagnostics.ts
import type { Extension } from '@codemirror/state';
import { ViewPlugin, type EditorView } from '@codemirror/view';
import {
	forEachDiagnostic,
	linter,
	setDiagnostics,
	type Diagnostic,
} from '@codemirror/lint';

import { genericLSPService } from '../../../services/GenericLSPService';
import { isSameDocument, positionToOffset, type LSPRange } from './lspProtocol';

export interface LSPDiagnostic extends Diagnostic {
	code?: string | number;
	data?: unknown;
}

interface PublishedDiagnostic {
	range: LSPRange;
	message: string;
	severity?: number;
	source?: string;
	code?: string | number;
	data?: unknown;
}

const SEVERITIES: Record<number, Diagnostic['severity']> = {
	1: 'error',
	2: 'warning',
	3: 'info',
	4: 'hint',
};

export function toCodeMirrorSeverity(
	severity?: number,
): Diagnostic['severity'] {
	return SEVERITIES[severity ?? 0] ?? 'warning';
}

export function toLSPSeverity(severity: Diagnostic['severity']): number {
	if (severity === 'error') return 1;
	if (severity === 'warning') return 2;
	return 3;
}

export function createLSPDiagnosticsExtension(fileName: string): Extension {
	if (!fileName) return [];

	const diagnosticsByConfig = new Map<string, LSPDiagnostic[]>();
	let mergedDiagnostics: LSPDiagnostic[] = [];

	const diagnosticsPlugin = ViewPlugin.fromClass(
		class {
			private readonly unsubscribe: () => void;

			constructor(private readonly view: EditorView) {
				this.unsubscribe = genericLSPService.onDiagnostics(
					(configId, params) => {
						if (!isSameDocument(params.uri, fileName)) return;

						const doc = this.view.state.doc;
						const clamp = (position: LSPRange['start']) =>
							positionToOffset(doc, {
								line: Math.min(Math.max(position.line, 0), doc.lines - 1),
								character: Math.max(position.character, 0),
							}) ?? 0;

						const mapped = (
							(params.diagnostics ?? []) as PublishedDiagnostic[]
						).map((diagnostic) => {
							const from = clamp(diagnostic.range.start);
							const to = clamp(diagnostic.range.end);

							return {
								from,
								to: Math.max(from, to),
								severity: toCodeMirrorSeverity(diagnostic.severity),
								message: diagnostic.message,
								source:
									diagnostic.source ||
									genericLSPService.getConfigName(configId) ||
									configId,
								...(diagnostic.code !== undefined
									? { code: diagnostic.code }
									: {}),
								...(diagnostic.data !== undefined
									? { data: diagnostic.data }
									: {}),
							} satisfies LSPDiagnostic;
						});

						diagnosticsByConfig.set(configId, mapped);
						mergedDiagnostics = Array.from(diagnosticsByConfig.values()).flat();

						queueMicrotask(() => {
							if (!this.view.dom.isConnected) return;

							const lspSources = new Set(
								mergedDiagnostics.map((entry) => entry.source).filter(Boolean),
							);
							const preserved: LSPDiagnostic[] = [];
							forEachDiagnostic(this.view.state, (entry, from, to) => {
								if (!lspSources.has(entry.source ?? '')) {
									preserved.push({ ...entry, from, to });
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

	return [diagnosticsPlugin, linter(() => mergedDiagnostics, { delay: 0 })];
}
