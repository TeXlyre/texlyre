// src/extensions/codemirror/PathAndBibAutocompleteExtension.ts
import { type CompletionContext, type CompletionResult, type CompletionSource } from '@codemirror/autocomplete';
import { StateEffect, StateField, type Extension } from '@codemirror/state';
import { ViewPlugin, type EditorView } from '@codemirror/view';

import { isTypstFile } from '../../utils/fileUtils';
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

	private async getMergedTypstCompletions(context: CompletionContext, refInfo: any): Promise<CompletionResult | null> {
		const refLabels: Array<{ label: string; filePath: string }> = [];
		const typstLabels = this.referenceHandler['typstLabels'];

		for (const [filePath, labels] of typstLabels.entries()) {
			for (const label of labels) {
				refLabels.push({ label, filePath });
			}
		}

		const bibCache = this.bibliographyHandler['bibliographyCache'];
		const partial = refInfo.partial;

		const filteredRefs = refLabels.filter(({ label }) =>
			!partial || label.toLowerCase().includes(partial.toLowerCase())
		);

		const filteredCitations = bibCache.filter(entry =>
			!partial ||
			entry.key.toLowerCase().includes(partial.toLowerCase()) ||
			entry.title.toLowerCase().includes(partial.toLowerCase()) ||
			entry.authors.some(author => author.toLowerCase().includes(partial.toLowerCase()))
		);

		const refOptions = this.referenceHandler['createLabelOptions'](filteredRefs, partial);
		const citationOptions = this.bibliographyHandler['createCitationOptions'](filteredCitations, partial);

		const mergedOptions = [
			...refOptions.map(opt => ({ ...opt, section: 'References' })),
			...citationOptions.map(opt => ({ ...opt, section: 'Citations' }))
		].sort((a, b) => {
			const aStartsWith = a.label.toLowerCase().startsWith(partial.toLowerCase());
			const bStartsWith = b.label.toLowerCase().startsWith(partial.toLowerCase());
			if (aStartsWith && !bStartsWith) return -1;
			if (!aStartsWith && bStartsWith) return 1;
			return (b.boost || 0) - (a.boost || 0);
		}).slice(0, 20);

		if (mergedOptions.length === 0) return null;

		const { typstReferencePatterns } = await import('./autocomplete/patterns');
		const partialStart = this.referenceHandler['getReferenceCompletionStart'](context, typstReferencePatterns);

		return {
			from: partialStart,
			options: mergedOptions,
			validFor: /^[^>\s]*$/,
		};
	}

	getCompletions = async (context: CompletionContext): Promise<CompletionResult | null> => {
		const refResult = this.referenceHandler.getCompletions(context, this.currentFilePath);
		if (refResult) return refResult;

		if (isTypstFile(this.currentFilePath)) {
			const refInfo = this.referenceHandler['findTypstReferenceCommand'](context);
			if (refInfo && (refInfo.type as any) === 'reference-or-citation') {
				return this.getMergedTypstCompletions(context, refInfo);
			}
		}

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