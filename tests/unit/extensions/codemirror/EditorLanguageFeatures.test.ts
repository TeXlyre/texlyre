import {
	getEditorLanguageFeatures,
	setEditorLanguageFeature,
} from '@src/extensions/codemirror/EditorLanguageFeatures';
import { resolveHighlightTheme } from '@src/extensions/codemirror/HighlightThemeExtension';

describe('editor language feature settings', () => {
	afterEach(() => {
		setEditorLanguageFeature('syntaxHighlighting', true);
		setEditorLanguageFeature('tooltips', true);
		setEditorLanguageFeature('diagnostics', true);
		setEditorLanguageFeature('symbolHighlights', true);
	});

	it('updates feature state and matching root data attributes independently', () => {
		setEditorLanguageFeature('syntaxHighlighting', false);
		setEditorLanguageFeature('tooltips', false);

		expect(getEditorLanguageFeatures()).toMatchObject({
			syntaxHighlighting: false,
			tooltips: false,
			diagnostics: true,
			symbolHighlights: true,
		});
		expect(document.documentElement.dataset.editorSyntaxHighlighting).toBe(
			'false',
		);
		expect(document.documentElement.dataset.editorLanguageTooltips).toBe('false');
	});

	it('keeps parsing separate from syntax coloring', () => {
		setEditorLanguageFeature('syntaxHighlighting', false);
		expect(resolveHighlightTheme('light')).toEqual([]);
	});
});
