// src/extensions/codemirror/LSPExtension.ts
import { type CompletionContext, type CompletionResult, type CompletionSource } from "@codemirror/autocomplete";
import { StateEffect, StateField, type Extension } from "@codemirror/state";
import { ViewPlugin, type EditorView } from "@codemirror/view";
import { type LSPRequest, type LSPResponse, type LSPCompletionItem } from "../../types/lsp";
import type { LSPPlugin } from "../../plugins/PluginInterface";

export const updateLSPPlugins = StateEffect.define<LSPPlugin[]>();

const lspPluginsField = StateField.define<LSPPlugin[]>({
	create() {
		return [];
	},
	update(plugins, tr) {
		for (const effect of tr.effects) {
			if (effect.is(updateLSPPlugins)) {
				return effect.value;
			}
		}
		return plugins;
	},
});

class LSPProcessor {
	private view: EditorView;
	private plugins: LSPPlugin[] = [];
	private activeConnections = new Map<string, boolean>();

	constructor(view: EditorView) {
		this.view = view;
	}

	updatePlugins(plugins: LSPPlugin[]) {
		this.plugins = plugins;
		// Initialize connections for enabled plugins
		this.plugins.forEach(plugin => {
			if (plugin.isEnabled() && !this.activeConnections.has(plugin.id)) {
				this.initializePlugin(plugin);
			}
		});
	}

	private async initializePlugin(plugin: LSPPlugin) {
		try {
			await plugin.initialize();
			this.activeConnections.set(plugin.id, true);
			console.log(`[LSPExtension] Initialized plugin: ${plugin.name}`);
		} catch (error) {
			console.warn(`[LSPExtension] Failed to initialize plugin ${plugin.name}:`, error);
		}
	}

	async getCompletions(context: CompletionContext): Promise<LSPCompletionItem[]> {
		const document = context.state.doc.toString();
		const position = context.pos;
		const line = context.state.doc.lineAt(position);
		const character = position - line.from;

		const allCompletions: LSPCompletionItem[] = [];

		for (const plugin of this.plugins) {
			if (!plugin.isEnabled() || !this.activeConnections.has(plugin.id)) {
				continue;
			}

			try {
				if (plugin.shouldTriggerCompletion(document, position, line.text)) {
					const request: LSPRequest = {
						method: 'textDocument/completion',
						params: {
							textDocument: { uri: this.getDocumentUri() },
							position: { line: line.number - 1, character }
						}
					};

					const response = await plugin.sendRequest(request);
					if (response.result && Array.isArray(response.result.items)) {
						allCompletions.push(...response.result.items);
					}
				}
			} catch (error) {
				console.error(`[LSPExtension] Error getting completions from ${plugin.name}:`, error);
			}
		}

		return allCompletions;
	}

	private getDocumentUri(): string {
		// Generate a unique URI for the current document
		const currentUrl = window.location.hash;
		return `texlyre://${currentUrl}`;
	}

	destroy() {
		this.plugins.forEach(plugin => {
			try {
				plugin.shutdown();
			} catch (error) {
				console.error(`[LSPExtension] Error shutting down plugin ${plugin.name}:`, error);
			}
		});
		this.activeConnections.clear();
	}

	update(update: any) {
		const plugins = update.state.field(lspPluginsField, false);
		if (plugins && plugins !== this.plugins) {
			this.updatePlugins(plugins);
		}
	}
}

let globalProcessor: LSPProcessor | null = null;

export function createLSPExtension(): [Extension, Extension, CompletionSource] {
	const plugin = ViewPlugin.fromClass(
		class {
			processor: LSPProcessor;

			constructor(view: EditorView) {
				this.processor = new LSPProcessor(view);
				globalProcessor = this.processor;
			}

			update(update: any) {
				this.processor?.update(update);
			}

			destroy() {
				this.processor?.destroy();
				if (globalProcessor === this.processor) {
					globalProcessor = null;
				}
			}
		}
	);

	const completionSource: CompletionSource = async (context: CompletionContext) => {
		if (!globalProcessor) return null;

		const completions = await globalProcessor.getCompletions(context);
		if (completions.length === 0) return null;

		const options = completions.map(item => ({
			label: item.label,
			detail: item.detail,
			info: item.documentation,
			apply: item.insertText || item.label,
			boost: item.sortText ? parseInt(item.sortText) : 0,
		}));

		return {
			from: context.pos,
			options,
			validFor: /^[a-zA-Z_][\w]*$/,
		} as CompletionResult;
	};

	return [
		lspPluginsField,
		plugin,
		completionSource,
	];
}

export function updateLSPPluginsInView(view: EditorView, plugins: LSPPlugin[]) {
	view.dispatch({
		effects: updateLSPPlugins.of(plugins)
	});
}