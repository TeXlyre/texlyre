// src/utils/typstOutlineParser.ts
export interface TypstOutlineSection {
    id: string;
    title: string;
    level: number;
    line: number;
    type: 'heading1' | 'heading2' | 'heading3' | 'heading4' | 'heading5';
    children: TypstOutlineSection[];
    label?: string;
}

export class TypstOutlineParser {
    private static readonly HEADING_LEVELS = {
        '= ': { level: 0, type: 'heading1' as const },
        '== ': { level: 1, type: 'heading2' as const },
        '=== ': { level: 2, type: 'heading3' as const },
        '==== ': { level: 3, type: 'heading4' as const },
        '===== ': { level: 4, type: 'heading5' as const },
    };

    static parse(content: string): TypstOutlineSection[] {
        const lines = content.split('\n');
        const sections: TypstOutlineSection[] = [];
        const sectionStack: TypstOutlineSection[] = [];

        for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
            const line = lines[lineIndex].trim();

            if (line.startsWith('//') || line === '') continue;

            const sectionMatch = this.matchHeadingCommand(line);
            if (!sectionMatch) continue;

            const { level, type, title } = sectionMatch;

            const label = this.findLabel(lines, lineIndex);

            const section: TypstOutlineSection = {
                id: `section-${lineIndex}-${Date.now()}`,
                title: title || 'Untitled',
                level,
                line: lineIndex + 1,
                type,
                children: [],
                label
            };

            this.insertSectionIntoHierarchy(section, sections, sectionStack);
        }

        return sections;
    }

    private static matchHeadingCommand(line: string): {
        level: number;
        type: 'heading1' | 'heading2' | 'heading3' | 'heading4' | 'heading5';
        title: string;
    } | null {
        for (const [prefix, info] of Object.entries(this.HEADING_LEVELS)) {
            if (line.startsWith(prefix)) {
                const title = line.substring(prefix.length).trim();
                return {
                    level: info.level,
                    type: info.type,
                    title
                };
            }
        }
        return null;
    }

    private static findLabel(lines: string[], startIndex: number): string | undefined {
        for (let i = startIndex; i < Math.min(startIndex + 3, lines.length); i++) {
            const line = lines[i];
            const labelMatch = line.match(/<([^>]+)>/);
            if (labelMatch) {
                return labelMatch[1];
            }
        }
        return undefined;
    }

    private static insertSectionIntoHierarchy(
        section: TypstOutlineSection,
        sections: TypstOutlineSection[],
        sectionStack: TypstOutlineSection[]
    ): void {
        while (sectionStack.length > 0 && sectionStack[sectionStack.length - 1].level >= section.level) {
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

    static getCurrentSection(sections: TypstOutlineSection[], currentLine: number): TypstOutlineSection | null {
        let currentSection: TypstOutlineSection | null = null;

        const findCurrentSection = (sectionList: TypstOutlineSection[]) => {
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