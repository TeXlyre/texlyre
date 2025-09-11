// src/utils/latexOutlineParser.ts
export interface OutlineSection {
	id: string;
	title: string;
	level: number;
	line: number;
	type: 'part' | 'chapter' | 'section' | 'subsection' | 'subsubsection' | 'paragraph' | 'subparagraph';
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
			
			// Skip comments and empty lines
			if (line.startsWith('%') || line === '') continue;

			const sectionMatch = this.matchSectionCommand(line);
			if (!sectionMatch) continue;

			const { command, starred, title } = sectionMatch;
			const sectionInfo = this.SECTION_COMMANDS[command];
			
			if (!sectionInfo) continue;

			// Look for label on the same line or next few lines
			const label = this.findLabel(lines, lineIndex);

			const section: OutlineSection = {
				id: `section-${lineIndex}-${Date.now()}`,
				title: title || 'Untitled',
				level: sectionInfo.level,
				line: lineIndex + 1, // 1-based line numbering
				type: sectionInfo.type,
				starred,
				children: [],
				label
			};

			// Build hierarchy
			this.insertSectionIntoHierarchy(section, sections, sectionStack);
		}

		return sections;
	}

	private static matchSectionCommand(line: string): {
		command: string;
		starred: boolean;
		title: string;
	} | null {
		// Match section commands with optional star and title
		const regex = /\\(part|chapter|section|subsection|subsubsection|paragraph|subparagraph)(\*?)\s*\{([^}]*)\}/;
		const match = line.match(regex);
		
		if (!match) return null;

		return {
			command: `\\${match[1]}`,
			starred: match[2] === '*',
			title: match[3].trim()
		};
	}

	private static findLabel(lines: string[], startIndex: number): string | undefined {
		// Look for \label{} in the current line and next 2 lines
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
		sectionStack: OutlineSection[]
	): void {
		// Remove sections from stack that are at the same or deeper level
		while (sectionStack.length > 0 && sectionStack[sectionStack.length - 1].level >= section.level) {
			sectionStack.pop();
		}

		// Add to parent or root
		if (sectionStack.length === 0) {
			sections.push(section);
		} else {
			const parent = sectionStack[sectionStack.length - 1];
			parent.children.push(section);
		}

		// Add current section to stack
		sectionStack.push(section);
	}

	static getCurrentSection(sections: OutlineSection[], currentLine: number): OutlineSection | null {
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