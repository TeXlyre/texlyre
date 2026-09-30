import {
	autocompletion,
	completionKeymap,
	closeBrackets,
	closeBracketsKeymap,
	type CompletionSource,
} from '@codemirror/autocomplete';
import {
	defaultKeymap,
	history,
	historyKeymap,
	indentWithTab,
} from '@codemirror/commands';
import {
	bidiIsolates,
	bracketMatching,
	foldGutter,
	foldKeymap,
	indentOnInput,
} from '@codemirror/language';
import {
	highlightSelectionMatches,
	search,
	searchKeymap,
} from '@codemirror/search';
import { EditorState, type Extension } from '@codemirror/state';
import { EditorView, keymap, lineNumbers } from '@codemirror/view';
import { emacs } from '@replit/codemirror-emacs';
import { vim } from '@replit/codemirror-vim';
import { bibtexCompletionSource } from 'codemirror-lang-bib';
import { latexCompletionSource } from 'codemirror-lang-latex';
import { typstCompletionSource } from 'codemirror-lang-typst/lezer';
import { helix } from 'codemirror-helix';
import { useMemo } from 'react';

import {
	resolveFontFamily,
	resolveFontSize,
} from '../../contexts/EditorContext';
import { latexTypstBidiIsolates } from '../../extensions/codemirror/BidiExtension';
import { resolveHighlightTheme } from '../../extensions/codemirror/HighlightThemeExtension';
import { createLanguageExtension } from '../../extensions/codemirror/LanguageExtension';
import { createListingsExtension } from '../../extensions/codemirror/ListingsExtension';
import { createMathLiveExtension } from '../../extensions/codemirror/MathLiveExtension';
import { searchHighlightExtension } from '../../extensions/codemirror/SearchHighlightExtension';
import { detectFileType } from '../../utils/fileUtils';
import { useEditor } from '../useEditor';
import { useTheme } from '../useTheme';

export interface EditorViewExtensionOptions {
	fileName?: string;
	content: string;
	readOnly?: boolean;
}

export const useEditorViewExtensions = ({
	fileName,
	content,
	readOnly = false,
}: EditorViewExtensionOptions): Extension[] => {
	const {
		getLineNumbersEnabled,
		getSyntaxHighlightingEnabled,
		getEditorTextDirection,
		getKeymapMode,
		getSpellCheckEnabled,
		editorSettings,
	} = useEditor();
	const { currentVariant, resolvedVariant } = useTheme();

	return useMemo(() => {
		const fileType = detectFileType(fileName, content);
		const isLatex = fileType === 'latex';
		const isTypst = fileType === 'typst';
		const isBib = fileType === 'bib';
		const isMarkdown = fileType === 'markdown';
		const isStructured = isLatex || isTypst || isBib || isMarkdown;
		const detectedByContent = detectFileType(fileName) === 'unknown';
		const completionSources: CompletionSource[] = [];
		const extensions: Extension[] = [
			EditorView.theme({
				'&': {
					fontFamily: resolveFontFamily(editorSettings.fontFamily),
					fontSize: `${resolveFontSize(editorSettings.fontSize)}px`,
				},
				'.cm-scroller, .cm-content': {
					fontFamily: 'inherit',
					fontSize: 'inherit',
				},
			}),
			EditorView.lineWrapping,
			foldGutter(),
			indentOnInput(),
			bidiIsolates(),
			bracketMatching(),
			closeBrackets(),
			highlightSelectionMatches(),
			search({
				scrollToMatch: (range, view) =>
					EditorView.scrollIntoView(range, {
						y: 'start',
						yMargin: Math.min(
							view.defaultLineHeight * 5,
							Math.max(0, view.scrollDOM.clientHeight - 1),
						),
					}),
			}),
			searchHighlightExtension,
			keymap.of([
				indentWithTab,
				...closeBracketsKeymap,
				...defaultKeymap,
				...searchKeymap,
				...foldKeymap,
				...completionKeymap,
			]),
		];

		if (getSpellCheckEnabled()) {
			extensions.push(
				EditorView.contentAttributes.of({
					spellcheck: 'true',
				}),
			);
		}

		const direction = getEditorTextDirection();
		if (direction !== 'auto') {
			extensions.push(
				EditorView.editorAttributes.of({ dir: direction }),
				EditorView.contentAttributes.of({ dir: direction }),
			);
		}

		if (getLineNumbersEnabled()) extensions.push(lineNumbers());

		const keymapMode = getKeymapMode();
		if (keymapMode === 'vim') extensions.push(vim());
		else if (keymapMode === 'helix') extensions.push(helix());
		else if (keymapMode === 'emacs') extensions.push(emacs());

		if (getSyntaxHighlightingEnabled()) {
			extensions.push(
				...createLanguageExtension(fileType, {
					fileName,
					detectedByContent,
					enableLinting: editorSettings.languageFeatures.builtinDiagnostics,
					enableTooltips: editorSettings.languageFeatures.builtinTooltips,
				}),
			);
		}

		if (
			getSyntaxHighlightingEnabled() ||
			editorSettings.languageFeatures.lspHighlighting
		) {
			extensions.push(
				resolveHighlightTheme(
					editorSettings.highlightTheme || 'auto',
					resolvedVariant ?? currentVariant,
				),
			);
		}

		if (isLatex || isTypst) {
			extensions.push(createListingsExtension(fileType));
		}

		if (isLatex || isTypst || isBib) {
			extensions.push(latexTypstBidiIsolates());
		}

		if (isLatex || isTypst) {
			if (editorSettings.mathLiveEnabled) {
				extensions.push(
					createMathLiveExtension(
						fileType,
						editorSettings.mathLivePreviewMode,
						editorSettings.language,
					),
				);
			}
		}

		if (editorSettings.languageFeatures.builtinCompletion) {
			if (isLatex) completionSources.push(latexCompletionSource(true));
			else if (isTypst) completionSources.push(typstCompletionSource);
			else if (isBib) completionSources.push(bibtexCompletionSource);
		}

		if (isStructured && completionSources.length > 0) {
			extensions.push(
				autocompletion({
					override: completionSources,
					maxRenderedOptions: 20,
					closeOnBlur: false,
				}),
			);
		} else {
			extensions.push(autocompletion());
		}

		if (readOnly) {
			extensions.push(EditorState.readOnly.of(true));
		} else {
			extensions.push(history(), keymap.of(historyKeymap));
		}

		return extensions;
	}, [
		fileName,
		content,
		readOnly,
		editorSettings,
		currentVariant,
		resolvedVariant,
		getLineNumbersEnabled,
		getSyntaxHighlightingEnabled,
		getEditorTextDirection,
		getKeymapMode,
		getSpellCheckEnabled,
	]);
};
