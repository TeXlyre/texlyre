export interface EditorLanguageFeatures {
	syntaxHighlighting: boolean;
	tooltips: boolean;
	diagnostics: boolean;
	symbolHighlights: boolean;
}

type EditorLanguageFeature = keyof EditorLanguageFeatures;

const features: EditorLanguageFeatures = {
	syntaxHighlighting: true,
	tooltips: true,
	diagnostics: true,
	symbolHighlights: true,
};

const dataAttributeNames: Record<EditorLanguageFeature, string> = {
	syntaxHighlighting: 'editorSyntaxHighlighting',
	tooltips: 'editorLanguageTooltips',
	diagnostics: 'editorLanguageDiagnostics',
	symbolHighlights: 'editorLanguageSymbolHighlights',
};

export function setEditorLanguageFeature<K extends EditorLanguageFeature>(
	feature: K,
	enabled: EditorLanguageFeatures[K],
): void {
	features[feature] = enabled;
	if (typeof document !== 'undefined') {
		document.documentElement.dataset[dataAttributeNames[feature]] = String(enabled);
	}
}

export function getEditorLanguageFeatures(): Readonly<EditorLanguageFeatures> {
	return features;
}
