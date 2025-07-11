// src/extensions/codemirror/FilePathAutocompleteExtension.ts
import { type CompletionContext, type CompletionResult } from "@codemirror/autocomplete";
import { StateEffect, StateField } from "@codemirror/state";
import { ViewPlugin, type EditorView } from "@codemirror/view";

import type { FileNode } from "../../types/files";

interface FilePathCache {
	files: FileNode[];
	imageFiles: string[];
	bibFiles: string[];
	texFiles: string[];
	allFiles: string[];
	lastUpdate: number;
}

export const updateFileCache = StateEffect.define<FileNode[]>();

const filePathCacheField = StateField.define<FilePathCache>({
	create() {
		return {
			files: [],
			imageFiles: [],
			bibFiles: [],
			texFiles: [],
			allFiles: [],
			lastUpdate: 0,
		};
	},
	update(cache, tr) {
		for (const effect of tr.effects) {
			if (effect.is(updateFileCache)) {
				const files = effect.value;
				return {
					files,
					imageFiles: files
						.filter(f => f.type === "file" && isImageFile(f.name))
						.map(f => f.path),
					bibFiles: files
						.filter(f => f.type === "file" && f.name.endsWith('.bib'))
						.map(f => f.path),
					texFiles: files
						.filter(f => f.type === "file" && (f.name.endsWith('.tex') || f.name.endsWith('.sty') || f.name.endsWith('.cls')))
						.map(f => f.path),
					allFiles: files
						.filter(f => f.type === "file")
						.map(f => f.path),
					lastUpdate: Date.now(),
				};
			}
		}
		return cache;
	},
});

const isImageFile = (filename: string): boolean => {
	const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.svg', '.pdf', '.eps', '.ps'];
	return imageExtensions.some(ext => filename.toLowerCase().endsWith(ext));
};

const getRelativePath = (fromPath: string, toPath: string): string => {
	if (!fromPath || fromPath === '/') {
		return toPath.startsWith('/') ? toPath.slice(1) : toPath;
	}

	const fromDir = fromPath.substring(0, fromPath.lastIndexOf('/')) || '/';
	const toDir = toPath.substring(0, toPath.lastIndexOf('/')) || '/';
	const toFileName = toPath.substring(toPath.lastIndexOf('/') + 1);

	// If files are in the same directory (siblings), show just the filename
	if (fromDir === toDir) {
		return toFileName;
	}

	// If target is in a subdirectory of the current file's directory
	if (toPath.startsWith(fromDir + '/')) {
		return toPath.substring(fromDir.length + 1);
	}

	// If current file is in a subdirectory and target is in root
	if (fromDir !== '/' && toDir === '/') {
		return toFileName;
	}

	// For all other cases, return path relative to root
	return toPath.startsWith('/') ? toPath.slice(1) : toPath;
};

const latexCommandPatterns = [
	{
		commands: ['includegraphics', 'includesvg'],
		pattern: /\\(includegraphics|includesvg)(?:\[[^\]]*\])?\{([^}]*)/,
		fileTypes: 'images' as const,
	},
	{
		commands: ['input', 'include', 'subfile'],
		pattern: /\\(input|include|subfile)\{([^}]*)/,
		fileTypes: 'tex' as const,
	},
	{
		commands: ['bibliography', 'addbibresource'],
		pattern: /\\(bibliography|addbibresource)(?:\[[^\]]*\])?\{([^}]*)/,
		fileTypes: 'bib' as const,
	},
	{
		commands: ['lstinputlisting', 'verbatiminput'],
		pattern: /\\(lstinputlisting|verbatiminput)(?:\[[^\]]*\])?\{([^}]*)/,
		fileTypes: 'all' as const,
	},
];

class FilePathAutocompleteProcessor {
	private view: EditorView;
	private currentFilePath: string = '';

	constructor(view: EditorView) {
		this.view = view;
	}

	setCurrentFilePath(filePath: string) {
		this.currentFilePath = filePath;
	}

	update(update: any) {
		// Handle any view updates if needed
	}

	private findLatexCommand(context: CompletionContext): { command: string; partial: string; fileTypes: 'images' | 'tex' | 'bib' | 'all' } | null {
		const line = context.state.doc.lineAt(context.pos);
		const lineText = line.text;
		const posInLine = context.pos - line.from;

		for (const { pattern, fileTypes } of latexCommandPatterns) {
			const matches = Array.from(lineText.matchAll(new RegExp(pattern.source, 'g')));

			for (const match of matches) {
				const matchStart = match.index!;
				const commandEnd = matchStart + match[0].length;

				if (posInLine >= matchStart && posInLine <= commandEnd + 1) {
					return {
						command: match[1],
						partial: match[2] || '',
						fileTypes,
					};
				}
			}
		}

		return null;
	}

	getCompletions = (context: CompletionContext): CompletionResult | null => {
		const commandInfo = this.findLatexCommand(context);
		if (!commandInfo) return null;

		const cache = context.state.field(filePathCacheField, false);
		if (!cache || cache.files.length === 0) return null;

		const { partial, fileTypes } = commandInfo;

		let candidates: string[];
		switch (fileTypes) {
			case 'images':
				candidates = cache.imageFiles;
				break;
			case 'tex':
				candidates = cache.texFiles;
				break;
			case 'bib':
				candidates = cache.bibFiles;
				break;
			case 'all':
			default:
				candidates = cache.allFiles;
				break;
		}

		const options = candidates
			.map(filePath => {
				const relativePath = getRelativePath(this.currentFilePath, filePath);
				const fileName = filePath.substring(filePath.lastIndexOf('/') + 1);

				// For bibliography commands, remove .bib extension
				const displayPath = fileTypes === 'bib' && relativePath.endsWith('.bib')
					? relativePath.slice(0, -4)
					: relativePath;

				return {
					fullPath: filePath,
					relativePath: displayPath,
					fileName,
				};
			})
			.filter(({ relativePath }) =>
				!partial || relativePath.toLowerCase().includes(partial.toLowerCase())
			)
			.sort((a, b) => {
				// Prioritize exact prefix matches
				const aStartsWith = a.relativePath.toLowerCase().startsWith(partial.toLowerCase());
				const bStartsWith = b.relativePath.toLowerCase().startsWith(partial.toLowerCase());
				if (aStartsWith && !bStartsWith) return -1;
				if (!aStartsWith && bStartsWith) return 1;

				const lenDiff = a.relativePath.length - b.relativePath.length;
				if (lenDiff !== 0) return lenDiff;

				// Finally alphabetically
				return a.relativePath.localeCompare(b.relativePath);
			})
			.slice(0, 20) // Limit results
			.map(({ relativePath, fileName, fullPath }) => ({
				label: relativePath,
				detail: fileName !== relativePath ? fileName : undefined,
				info: fullPath,
				apply: relativePath,
				boost: partial && relativePath.toLowerCase().startsWith(partial.toLowerCase()) ? 10 : 0,
			}));

		if (options.length === 0) return null;

		const line = context.state.doc.lineAt(context.pos);
		const lineText = line.text;
		const posInLine = context.pos - line.from;

		// Find the start of the current partial path
		let partialStart = posInLine;
		for (const { pattern } of latexCommandPatterns) {
			const match = lineText.match(pattern);
			if (match && match.index !== undefined) {
				const bracePos = lineText.indexOf('{', match.index);
				if (bracePos !== -1 && posInLine > bracePos) {
					partialStart = line.from + bracePos + 1;
					break;
				}
			}
		}

		return {
			from: partialStart,
			options,
			validFor: /^[^}]*$/,
		};
	};
}

// Store processor globally for access
let globalProcessor: FilePathAutocompleteProcessor | null = null;

export function createFilePathAutocompleteExtension(currentFilePath: string = '') {
	const plugin = ViewPlugin.fromClass(
		class {
			processor: FilePathAutocompleteProcessor;

			constructor(view: EditorView) {
				this.processor = new FilePathAutocompleteProcessor(view);
				this.processor.setCurrentFilePath(currentFilePath);
				globalProcessor = this.processor;
			}

			update(update: any) {
				this.processor?.update(update);
			}

			destroy() {
				if (globalProcessor === this.processor) {
					globalProcessor = null;
				}
			}
		}
	);

	const completionSource = (context: CompletionContext) => {
		return globalProcessor?.getCompletions(context) || null;
	};

	return [
		filePathCacheField,
		plugin,
		completionSource,
	];
}

export function updateFilePathCache(view: EditorView, files: FileNode[]) {
	view.dispatch({
		effects: updateFileCache.of(files)
	});
}

export function setCurrentFilePath(view: EditorView, filePath: string) {
	if (globalProcessor && typeof globalProcessor.setCurrentFilePath === 'function') {
		globalProcessor.setCurrentFilePath(filePath);
	}
}