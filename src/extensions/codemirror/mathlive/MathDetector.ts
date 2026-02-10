import type { EditorView } from '@codemirror/view';
import { getPatternsForFileType, type FileType, type MathPattern } from './patterns';

export interface MathRegion {
    from: number;
    to: number;
    type: 'inline' | 'display';
    content: string;
    contentStart: number;
    contentEnd: number;
    fileType: FileType;
    delimiterStart: string;
    delimiterEnd: string;
}

export class MathDetector {
    private currentFileType: FileType = 'latex';

    setFileType(fileType: FileType): void {
        this.currentFileType = fileType;
    }

    detectMathAtPosition(view: EditorView, pos: number): MathRegion | null {
        const doc = view.state.doc.toString();
        const patterns = getPatternsForFileType(this.currentFileType);

        for (const patternConfig of patterns) {
            const { pattern, type, fileType, getDelimiters } = patternConfig;
            pattern.lastIndex = 0;
            let match;

            while ((match = pattern.exec(doc)) !== null) {
                const matchStart = match.index;
                const matchEnd = matchStart + match[0].length;

                if (pos >= matchStart && pos <= matchEnd) {
                    const fullMatch = match[0];
                    const delims = getDelimiters(fullMatch);

                    const contentStart = matchStart + delims.start.length;
                    const contentEnd = matchEnd - delims.end.length;
                    const content = doc.substring(contentStart, contentEnd);

                    return {
                        from: matchStart,
                        to: matchEnd,
                        type,
                        content: content.trim(),
                        contentStart,
                        contentEnd,
                        fileType,
                        delimiterStart: delims.start,
                        delimiterEnd: delims.end,
                    };
                }
            }
        }

        return null;
    }

    findAllMathRegions(doc: string, fileType: FileType): MathRegion[] {
        const regions: MathRegion[] = [];
        const patterns = getPatternsForFileType(fileType);

        for (const patternConfig of patterns) {
            const { pattern, type, getDelimiters } = patternConfig;
            pattern.lastIndex = 0;
            let match;

            while ((match = pattern.exec(doc)) !== null) {
                const matchStart = match.index;
                const matchEnd = matchStart + match[0].length;
                const fullMatch = match[0];
                const delims = getDelimiters(fullMatch);

                const contentStart = matchStart + delims.start.length;
                const contentEnd = matchEnd - delims.end.length;
                const content = doc.substring(contentStart, contentEnd);

                regions.push({
                    from: matchStart,
                    to: matchEnd,
                    type,
                    content: content.trim(),
                    contentStart,
                    contentEnd,
                    fileType,
                    delimiterStart: delims.start,
                    delimiterEnd: delims.end,
                });
            }
        }

        return regions.sort((a, b) => a.from - b.from);
    }
}