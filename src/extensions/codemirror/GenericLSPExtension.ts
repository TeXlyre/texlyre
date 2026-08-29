// src/extensions/codemirror/GenericLSPExtension.ts
import type { CompletionSource } from '@codemirror/autocomplete';
import type { Extension } from '@codemirror/state';

import type { LanguageFeatureSettings } from '../../types/editor';
import { createLSPCodeActionsExtension } from './lsp/lspCodeActions';
import { createLSPCompletionSource } from './lsp/lspCompletion';
import { createLSPDiagnosticsExtension } from './lsp/lspDiagnostics';
import { createLSPDocumentHighlightExtension } from './lsp/lspDocumentHighlight';
import { createLSPDocumentSyncExtension } from './lsp/lspDocumentSync';
import { createLSPHoverExtension } from './lsp/lspHover';
import { createLSPSemanticTokensExtension } from './lsp/lspSemanticTokens';
import { createLSPSignatureHelpExtension } from './lsp/lspSignatureHelp';

export type { LSPDiagnostic } from './lsp/lspDiagnostics';

export function getGenericLSPExtensionsForFile(
	fileName: string,
	features?: LanguageFeatureSettings,
): Extension[] {
	if (!fileName) return [];

	const extensions: Extension[] = [createLSPDocumentSyncExtension(fileName)];

	if (features?.lspTooltips !== false) {
		extensions.push(
			createLSPHoverExtension(fileName),
			createLSPSignatureHelpExtension(fileName),
		);
	}

	if (features?.lspDiagnostics !== false) {
		extensions.push(
			createLSPDiagnosticsExtension(fileName),
			createLSPCodeActionsExtension(fileName),
		);
	}

	if (features?.lspSymbolHighlights !== false) {
		extensions.push(createLSPDocumentHighlightExtension(fileName));
	}

	if (features?.lspHighlighting !== false) {
		extensions.push(createLSPSemanticTokensExtension(fileName));
	}

	return extensions;
}

export function getGenericLSPCompletionSources(
	fileName: string,
	features?: LanguageFeatureSettings,
): CompletionSource[] {
	if (!fileName || features?.lspCompletion === false) return [];

	return [createLSPCompletionSource(fileName)];
}
