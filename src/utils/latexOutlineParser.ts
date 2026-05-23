// src/utils/latexOutlineParser.ts
export interface OutlineSection {
	id: string;
	title: string;
	level: number;
	line: number;
	type:
		| 'part'
		| 'chapter'
		| 'section'
		| 'subsection'
		| 'subsubsection'
		| 'paragraph'
		| 'subparagraph';
	starred: boolean;
	children: OutlineSection[];
	label?: string;
}

export class LaTeXOutlineParser {
	private static readonly SECTION_COMMANDS = {
		'\\part': { level: 0, type: 'part' as const },
		'\\chapter': { level: 1, type: 'chapter' as const },
		'\\section': { level: 2, type: 'section' as const },
		'\\subsection': { level: 3, type: 'subsection' as const },
		'\\subsubsection': { level: 4, type: 'subsubsection' as const },
		'\\paragraph': { level: 5, type: 'paragraph' as const },
		'\\subparagraph': { level: 6, type: 'subparagraph' as const },
	};

	static parse(content: string): OutlineSection[] {
		const lines = content.split('\n');
		const sections: OutlineSection[] = [];
		const sectionStack: OutlineSection[] = [];

		for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
			const line = lines[lineIndex].trim();

			if (line.startsWith('%') || line === '') continue;

			const sectionMatch = LaTeXOutlineParser.matchSectionCommand(line);
			if (!sectionMatch) continue;

			const { command, starred, title } = sectionMatch;
			const sectionInfo = LaTeXOutlineParser.SECTION_COMMANDS[command];

			if (!sectionInfo) continue;

			const label = LaTeXOutlineParser.findLabel(lines, lineIndex);

			const section: OutlineSection = {
				id: `section-${lineIndex}-${Date.now()}`,
				title: title || 'Untitled',
				level: sectionInfo.level,
				line: lineIndex + 1,
				type: sectionInfo.type,
				starred,
				children: [],
				label,
			};

			LaTeXOutlineParser.insertSectionIntoHierarchy(
				section,
				sections,
				sectionStack,
			);
		}

		return sections;
	}

	private static matchSectionCommand(line: string): {
		command: string;
		starred: boolean;
		title: string;
	} | null {
		const regex =
			/\\(part|chapter|section|subsection|subsubsection|paragraph|subparagraph)(\*?)\s*\{([^}]*)\}/;
		const match = line.match(regex);

		if (!match) return null;

		return {
			command: `\\${match[1]}`,
			starred: match[2] === '*',
			title: match[3].trim(),
		};
	}

	private static findLabel(
		lines: string[],
		startIndex: number,
	): string | undefined {
		for (let i = startIndex; i < Math.min(startIndex + 3, lines.length); i++) {
			const line = lines[i];
			const labelMatch = line.match(/\\label\{([^}]+)\}/);
			if (labelMatch) {
				return labelMatch[1];
			}
		}
		return undefined;
	}

	private static insertSectionIntoHierarchy(
		section: OutlineSection,
		sections: OutlineSection[],
		sectionStack: OutlineSection[],
	): void {
		while (
			sectionStack.length > 0 &&
			sectionStack[sectionStack.length - 1].level >= section.level
		) {
			sectionStack.pop();
		}

		if (sectionStack.length === 0) {
			sections.push(section);
		} else {
			const parent = sectionStack[sectionStack.length - 1];
			parent.children.push(section);
		}

		sectionStack.push(section);
	}

	static getCurrentSection(
		sections: OutlineSection[],
		currentLine: number,
	): OutlineSection | null {
		let currentSection: OutlineSection | null = null;

		const findCurrentSection = (sectionList: OutlineSection[]) => {
			for (const section of sectionList) {
				if (section.line <= currentLine) {
					currentSection = section;
				}
				if (section.children.length > 0) {
					findCurrentSection(section.children);
				}
				if (section.line > currentLine) {
					break;
				}
			}
		};

		findCurrentSection(sections);
		return currentSection;
	}
}
