// src/utils/textmateOutlineParser.ts
import { INITIAL, type IGrammar } from 'vscode-textmate';

import { getTextMateGrammar } from '../extensions/codemirror/languages/textmateMode';

export interface TextMateOutlineSection {
	id: string;
	title: string;
	level: number;
	line: number;
	type: 'heading1' | 'heading2' | 'heading3' | 'heading4' | 'heading5';
	children: TextMateOutlineSection[];
}

const HEADING_SCOPE = /(?:^|\.)(?:markup\.heading|entity\.name\.section)\b/;
const LEVEL_IN_SCOPE = /heading[-.](\d+)/;
const SKIPPED_SCOPE = /\b(?:marker|punctuation|space)\b/;
const RULE_ONLY = /^[-=#*_\s]+$/;

const LEVEL_BY_COMMAND: Record<string, number> = {
	part: 0,
	title: 0,
	chapter: 1,
	subject: 1,
	section: 2,
	subsection: 3,
	subsubject: 3,
	subsubsection: 4,
	subsubsubject: 4,
};

const TYPE_BY_LEVEL = [
	'heading1',
	'heading2',
	'heading3',
	'heading4',
	'heading5',
] as const;

function levelForToken(scopes: string[], line: string): number {
	for (const scope of scopes) {
		const match = LEVEL_IN_SCOPE.exec(scope);
		if (match) return Number(match[1]);
	}

	const command = /\\(\w+)/.exec(line);
	if (command) {
		const level = LEVEL_BY_COMMAND[command[1].toLowerCase()];
		if (level !== undefined) return level;
	}

	const marker = /^\s*(=+|#+)\s/.exec(line);
	if (marker) return marker[1].length - 1;

	return 0;
}

function headingForLine(
	grammar: IGrammar,
	line: string,
	stack: ReturnType<IGrammar['tokenizeLine']>['ruleStack'],
) {
	const result = grammar.tokenizeLine(line, stack);
	const parts: string[] = [];
	let level: number | null = null;

	for (const token of result.tokens) {
		if (!token.scopes.some((scope) => HEADING_SCOPE.test(scope))) continue;
		if (level === null) level = levelForToken(token.scopes, line);
		if (token.scopes.some((scope) => SKIPPED_SCOPE.test(scope))) continue;

		parts.push(line.slice(token.startIndex, token.endIndex));
	}

	const title = parts
		.join('')
		.trim()
		.replace(/^[{[(]+/, '')
		.replace(/[}\])]+$/, '')
		.trim();

	return {
		stack: result.ruleStack,
		heading:
			level === null || !title || RULE_ONLY.test(title)
				? null
				: { title, level },
	};
}

function insertSection(
	section: TextMateOutlineSection,
	sections: TextMateOutlineSection[],
	stack: TextMateOutlineSection[],
): void {
	while (stack.length > 0 && stack[stack.length - 1].level >= section.level) {
		stack.pop();
	}

	if (stack.length === 0) {
		sections.push(section);
	} else {
		stack[stack.length - 1].children.push(section);
	}
	stack.push(section);
}

export class TextMateOutlineParser {
	static async parse(
		fileName: string,
		content: string,
	): Promise<TextMateOutlineSection[]> {
		const grammar = await getTextMateGrammar(fileName);
		if (!grammar) return [];

		const sections: TextMateOutlineSection[] = [];
		const stack: TextMateOutlineSection[] = [];
		const lines = content.split('\n');
		let ruleStack = INITIAL;

		for (let index = 0; index < lines.length; index++) {
			const { stack: nextStack, heading } = headingForLine(
				grammar,
				lines[index],
				ruleStack,
			);
			ruleStack = nextStack;
			if (!heading) continue;

			insertSection(
				{
					id: `textmate-section-${index}`,
					title: heading.title,
					level: heading.level,
					line: index + 1,
					type: TYPE_BY_LEVEL[Math.min(heading.level, 4)],
					children: [],
				},
				sections,
				stack,
			);
		}

		return sections;
	}

	static getCurrentSection(
		sections: TextMateOutlineSection[],
		currentLine: number,
	): TextMateOutlineSection | null {
		let current: TextMateOutlineSection | null = null;

		const walk = (list: TextMateOutlineSection[]) => {
			for (const section of list) {
				if (section.line <= currentLine) current = section;
				if (section.children.length > 0) walk(section.children);
				if (section.line > currentLine) break;
			}
		};

		walk(sections);
		return current;
	}
}
