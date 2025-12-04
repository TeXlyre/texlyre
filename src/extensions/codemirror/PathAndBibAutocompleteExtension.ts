// src/extensions/codemirror/PathAndBibAutocompleteExtension.ts
import { type CompletionContext, type CompletionResult, type CompletionSource } from '@codemirror/autocomplete';
import { StateEffect, StateField, type Extension } from '@codemirror/state';
import { ViewPlugin, type EditorView } from '@codemirror/view';

import type { FileNode, FilePathCache } from '../../types/files';
import { filePathCacheService } from '../../services/FilePathCacheService';
import { BibliographyCompletionHandler } from './autocomplete/BibliographyCompletionHandler';
import { FilePathCompletionHandler } from './autocomplete/FilePathCompletionHandler';
import { ReferenceCompletionHandler } from './autocomplete/ReferenceCompletionHandler';

export const updateFileCache = StateEffect.define<FileNode[]>();

export const filePathCacheField = StateField.define<FilePathCache>({
	create() {
		return {
			files: [],
			imageFiles: [],
			bibFiles: [],
			texFiles: [],
			typstFiles: [],
			allFiles: [],
			lastUpdate: 0,
		};
	},
	update(cache, tr) {
		for (const effect of tr.effects) {
			if (effect.is(updateFileCache)) {
				return filePathCacheService.buildCacheFromFiles(effect.value);
			}
		}
		return cache;
	},
});

class AutocompleteProcessor {
	private view: EditorView;
	private currentFilePath: string = '';
	private bibliographyHandler: BibliographyCompletionHandler;
	private filePathHandler: FilePathCompletionHandler;
	private referenceHandler: ReferenceCompletionHandler;

	constructor(view: EditorView) {
		this.view = view;
		this.bibliographyHandler = new BibliographyCompletionHandler();
		this.filePathHandler = new FilePathCompletionHandler();
		this.referenceHandler = new ReferenceCompletionHandler();

		setTimeout(() => {
			filePathCacheService.onCacheUpdate(this.handleCacheUpdate);
			filePathCacheService.onFilePathUpdate(this.handleFilePathUpdate);
			filePathCacheService.onLabelsUpdate(this.handleLabelsUpdate);
			this.bibliographyHandler.initialize();
			this.referenceHandler.initialize();
		}, 0);
	}

	destroy() {
		filePathCacheService.offCacheUpdate(this.handleCacheUpdate);
		filePathCacheService.offFilePathUpdate(this.handleFilePathUpdate);
		filePathCacheService.offLabelsUpdate(this.handleLabelsUpdate);
		this.bibliographyHandler.destroy();
		this.referenceHandler.destroy();
	}

	private handleCacheUpdate = (files: FileNode[]) => {
		this.view.dispatch({
			effects: updateFileCache.of(files)
		});
		this.bibliographyHandler.updateCache();
	};

	private handleFilePathUpdate = (filePath: string) => {
		this.currentFilePath = filePath;
	};

	private handleLabelsUpdate = (labels: Map<string, string[]>) => {
		this.referenceHandler.updateLabels(labels);
	};

	setCurrentFilePath(filePath: string) {
		this.currentFilePath = filePath;
	}

	update(update: any) {
	}

	getCompletions = async (context: CompletionContext): Promise<CompletionResult | null> => {
		const refResult = this.referenceHandler.getCompletions(context, this.currentFilePath);
		if (refResult) return refResult;

		const bibResult = await this.bibliographyHandler.getCompletions(context, this.currentFilePath);
		if (bibResult) return bibResult;

		const fileResult = this.filePathHandler.getCompletions(context, this.currentFilePath);
		if (fileResult) return fileResult;

		return null;
	};
}

let globalProcessor: AutocompleteProcessor | null = null;

export function createFilePathAutocompleteExtension(currentFilePath: string = ''): [Extension, Extension, CompletionSource] {
	const plugin = ViewPlugin.fromClass(
		class {
			processor: AutocompleteProcessor;

			constructor(view: EditorView) {
				this.processor = new AutocompleteProcessor(view);
				this.processor.setCurrentFilePath(currentFilePath);
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
		return await globalProcessor?.getCompletions(context) || null;
	};

	const stateExtensions = [filePathCacheField];

	return [
		stateExtensions,
		plugin,
		completionSource,
	];
}

export function setCurrentFilePath(view: EditorView, filePath: string) {
	if (globalProcessor && typeof globalProcessor.setCurrentFilePath === 'function') {
		globalProcessor.setCurrentFilePath(filePath);
	}
}

export function refreshBibliographyCache(view: EditorView) {
	if (globalProcessor) {
		globalProcessor['bibliographyHandler']?.updateCache();
	}
}