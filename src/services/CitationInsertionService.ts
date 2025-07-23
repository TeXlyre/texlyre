// src/services/CitationInsertionService.ts
class CitationInsertionService {
	private static instance: CitationInsertionService;

	static getInstance(): CitationInsertionService {
		if (!CitationInsertionService.instance) {
			CitationInsertionService.instance = new CitationInsertionService();
		}
		return CitationInsertionService.instance;
	}

	private constructor() {
		this.setupEventListeners();
	}

	private setupEventListeners() {
		document.addEventListener('jabref-citation-selected', this.handleCitationSelected.bind(this));
	}

	private handleCitationSelected(event: CustomEvent) {
		const { citationKey } = event.detail;
		this.insertCitation(citationKey);
	}

	insertCitation(citationKey: string, citationType: string = 'cite') {
		// Find the active CodeMirror editor
		const activeEditor = this.findActiveEditor();
		if (!activeEditor) {
			console.warn('[CitationInsertionService] No active editor found');
			return;
		}

		const view = activeEditor;
		const selection = view.state.selection.main;
		const currentLine = view.state.doc.lineAt(selection.from);
		const lineText = currentLine.text;
		const cursorInLine = selection.from - currentLine.from;

		// Check if we're inside a citation command
		const citationMatch = this.findCitationContext(lineText, cursorInLine);

		if (citationMatch) {
			// We're inside an existing citation command, add to it
			this.insertIntoCitation(view, citationMatch, citationKey, selection);
		} else {
			// Insert a new citation command
			this.insertNewCitation(view, citationType, citationKey, selection);
		}

		// Focus the editor after insertion
		view.focus();
	}

	private findActiveEditor(): any {
		// Look for CodeMirror editors in the DOM
		const editors = document.querySelectorAll('.cm-editor');

		// Find the focused editor or the most recently active one
		for (const editorElement of editors) {
			if (editorElement.contains(document.activeElement) ||
				editorElement.classList.contains('cm-focused')) {
				return (editorElement as any).CodeMirror ||
					   (editorElement as any).cmView?.view;
			}
		}

		// Fallback to the first editor found
		if (editors.length > 0) {
			const firstEditor = editors[0];
			return (firstEditor as any).CodeMirror ||
				   (firstEditor as any).cmView?.view;
		}

		return null;
	}

	private findCitationContext(lineText: string, cursorPos: number) {
		// Look for citation commands: \cite{...}, \autocite{...}, etc.
		const citationRegex = /\\(cite\w*|autocite\w*|textcite\w*|parencite\w*|footcite\w*)\{([^}]*)\}/g;
		let match;

		while ((match = citationRegex.exec(lineText)) !== null) {
			const commandStart = match.index;
			const commandEnd = match.index + match[0].length;
			const braceStart = match.index + match[1].length + 1; // Position after opening brace
			const braceEnd = commandEnd - 1; // Position of closing brace

			// Check if cursor is within the braces
			if (cursorPos >= braceStart && cursorPos <= braceEnd) {
				return {
					command: match[1],
					fullMatch: match[0],
					start: commandStart,
					end: commandEnd,
					braceStart,
					braceEnd,
					currentKeys: match[2]
				};
			}
		}

		return null;
	}

	private insertIntoCitation(view: any, citationMatch: any, citationKey: string, selection: any) {
		const { currentKeys, braceStart, braceEnd } = citationMatch;
		const lineStart = selection.from - (selection.from - view.state.doc.lineAt(selection.from).from);

		let newKeys: string;
		if (currentKeys.trim() === '') {
			// Empty citation, just add the key
			newKeys = citationKey;
		} else {
			// Add to existing keys
			const keys = currentKeys.split(',').map(k => k.trim()).filter(k => k !== '');
			if (!keys.includes(citationKey)) {
				keys.push(citationKey);
			}
			newKeys = keys.join(', ');
		}

		// Replace the content between braces
		const from = lineStart + braceStart;
		const to = lineStart + braceEnd;

		view.dispatch({
			changes: {
				from,
				to,
				insert: newKeys
			},
			selection: {
				anchor: from + newKeys.length,
				head: from + newKeys.length
			}
		});
	}

	private insertNewCitation(view: any, citationType: string, citationKey: string, selection: any) {
		const citationText = `\\${citationType}{${citationKey}}`;

		view.dispatch({
			changes: {
				from: selection.from,
				to: selection.to,
				insert: citationText
			},
			selection: {
				anchor: selection.from + citationText.length,
				head: selection.from + citationText.length
			}
		});
	}

	// Public method for programmatic citation insertion
	insertCitationAt(view: any, citationType: string, citationKey: string, position?: number) {
		const pos = position ?? view.state.selection.main.from;

		view.dispatch({
			changes: {
				from: pos,
				to: pos,
				insert: `\\${citationType}{${citationKey}}`
			}
		});
	}

	// Method to get citation suggestions based on current context
	getCitationSuggestions(lineText: string, cursorPos: number): string[] {
		const citationContext = this.findCitationContext(lineText, cursorPos);

		if (citationContext) {
			// Return different citation types that could be used
			const baseCitations = ['cite', 'autocite', 'textcite', 'parencite', 'footcite'];
			const starredCitations = baseCitations.map(c => c + '*');
			return [...baseCitations, ...starredCitations];
		}

		// Check if we should suggest citation commands
		const beforeCursor = lineText.substring(0, cursorPos);
		if (beforeCursor.endsWith('\\') || beforeCursor.endsWith('\\c')) {
			return ['cite', 'autocite', 'textcite', 'parencite', 'footcite'];
		}

		return [];
	}
}

export const citationInsertionService = CitationInsertionService.getInstance();