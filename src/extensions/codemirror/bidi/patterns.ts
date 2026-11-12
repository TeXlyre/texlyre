// src/extensions/codemirror/bidi/patterns.ts
export type FileType = 'latex' | 'typst' | 'bib';

export interface BidiPattern {
	pattern: RegExp;
	fileType: FileType;
}

export const latexBidiPatterns: BidiPattern[] = [
	{ pattern: /\$[^$\n]+\$/g, fileType: 'latex' },
	{ pattern: /\\\[[\s\S]*?\\\]/g, fileType: 'latex' },
	{ pattern: /\\\([\s\S]*?\\\)/g, fileType: 'latex' },
	{
		pattern:
			/\\begin\{(?:equation|align|aligned|gather|cases|array|matrix|pmatrix|bmatrix|Bmatrix|vmatrix|Vmatrix)\*?\}[\s\S]*?\\end\{(?:equation|align|aligned|gather|cases|array|matrix|pmatrix|bmatrix|Bmatrix|vmatrix|Vmatrix)\*?\}/g,
		fileType: 'latex',
	},
	// Commands with argument groups, consuming trailing structural punctuation
	{
		pattern:
			/\\[A-Za-z@]+\*?(?:\s*(?:\[[^\]]*\]|\{[^}]*\}|\[[^\]]*$|\{[^}]*$))+[{}[\]);,]*/gm,
		fileType: 'latex',
	},
	// Standalone commands consuming trailing structural punctuation
	{ pattern: /\\[A-Za-z@]+\*?(?!\s*[[{])[{}[\]);,]*/g, fileType: 'latex' },
];

export const typstBidiPatterns: BidiPattern[] = [
	{ pattern: /\$[\s\S]*?\$/g, fileType: 'typst' },
	// Functions with argument groups, consuming trailing structural punctuation
	{
		pattern:
			/#[A-Za-z_][A-Za-z0-9_-]*(?:\s*(?:\([^)]*\)|\[[^\]]*\]|\{[^}]*\}|\([^)]*$|\[[^\]]*$|\{[^}]*$))+[{}[\]);,]*/gm,
		fileType: 'typst',
	},
	// #identifier consuming trailing structural punctuation
	{
		pattern: /#[A-Za-z_][A-Za-z0-9_-]*(?!\s*[([{])[{}[\]);,]*/g,
		fileType: 'typst',
	},
];

export const bibBidiPatterns: BidiPattern[] = [
	{ pattern: /@[A-Za-z]+\s*[({][^@]*/g, fileType: 'bib' },
	{
		pattern:
			/[A-Za-z_][A-Za-z0-9_]*\s*=\s*(?:\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}|"[^"]*")/g,
		fileType: 'bib',
	},
];

export function getPatternsForFileType(fileType: FileType): BidiPattern[] {
	switch (fileType) {
		case 'latex':
			return latexBidiPatterns;
		case 'typst':
			return typstBidiPatterns;
		case 'bib':
			return bibBidiPatterns;
	}
}

export const allBidiPatterns: BidiPattern[] = [
	...latexBidiPatterns,
	...typstBidiPatterns,
	...bibBidiPatterns,
];

export function latexCommandBracketRanges(
	text: string,
): Array<{ from: number; to: number }> {
	const ranges: Array<{ from: number; to: number }> = [];
	const tokens = /\\[A-Za-z@]+|[{}[\]]+/g;
	let seenCommand = false;
	let match: RegExpExecArray | null;
	while ((match = tokens.exec(text)) !== null) {
		if (match[0][0] === '\\') {
			seenCommand = true;
		} else {
			if (seenCommand)
				ranges.push({ from: match.index, to: match.index + match[0].length });
			seenCommand = false;
		}
	}
	return ranges;
}
