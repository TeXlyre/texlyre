import { RangeSetBuilder, type Extension, StateField, StateEffect } from "@codemirror/state";
import {
    Decoration,
    Direction,
    EditorView,
    ViewPlugin,
    ViewUpdate,
    type DecorationSet,
} from "@codemirror/view";

type Range = { from: number; to: number };

export const setMathEditRegion = StateEffect.define<Range | null>();

const mathEditRegionField = StateField.define<Range | null>({
    create() {
        return null;
    },
    update(value, tr) {
        for (const effect of tr.effects) {
            if (effect.is(setMathEditRegion)) {
                return effect.value;
            }
        }
        return value;
    },
});

function findBalancedRange(
    text: string,
    start: number,
    open: string,
    close: string
): number | null {
    if (text[start] !== open) return null;
    let depth = 0;
    for (let i = start; i < text.length; i++) {
        const ch = text[i];
        if (ch === open) depth++;
        else if (ch === close) {
            depth--;
            if (depth === 0) return i + 1;
        }
    }
    return null;
}

function findLatexRangesInLine(lineText: string, lineFrom: number): Range[] {
    const ranges: Range[] = [];

    for (let i = 0; i < lineText.length; i++) {
        if (lineText[i] !== "\\") continue;

        let j = i + 1;
        if (j >= lineText.length || !/[A-Za-z@]/.test(lineText[j])) continue;
        while (j < lineText.length && /[A-Za-z@]/.test(lineText[j])) j++;
        if (j < lineText.length && lineText[j] === "*") j++;
        while (j < lineText.length && /\s/.test(lineText[j])) j++;

        if (j < lineText.length && lineText[j] === "[") {
            const end = findBalancedRange(lineText, j, "[", "]");
            if (end == null) continue;
            j = end;
            while (j < lineText.length && /\s/.test(lineText[j])) j++;
        }

        if (j < lineText.length && lineText[j] === "{") {
            const end = findBalancedRange(lineText, j, "{", "}");
            if (end == null) continue;
            ranges.push({ from: lineFrom + i, to: lineFrom + end });
            i = end - 1;
            continue;
        }

        ranges.push({ from: lineFrom + i, to: lineFrom + j });
        i = j - 1;
    }

    return ranges;
}

function findTypstRangesInLine(lineText: string, lineFrom: number): Range[] {
    const ranges: Range[] = [];

    for (let i = 0; i < lineText.length; i++) {
        if (lineText[i] !== "#") continue;

        let j = i + 1;
        if (j >= lineText.length || !/[A-Za-z_]/.test(lineText[j])) continue;
        while (j < lineText.length && /[A-Za-z0-9_\-]/.test(lineText[j])) j++;
        while (j < lineText.length && /\s/.test(lineText[j])) j++;

        if (j < lineText.length && (lineText[j] === "(" || lineText[j] === "[" || lineText[j] === "{")) {
            const open = lineText[j];
            const close = open === "(" ? ")" : open === "[" ? "]" : "}";
            const end = findBalancedRange(lineText, j, open, close);
            if (end != null) {
                ranges.push({ from: lineFrom + i, to: lineFrom + end });
                i = end - 1;
                continue;
            }
        }

        ranges.push({ from: lineFrom + i, to: lineFrom + j });
        i = j - 1;
    }

    return ranges;
}

const isolate = Decoration.mark({
    attributes: { style: "unicode-bidi: isolate; direction: ltr;" },
    bidiIsolate: Direction.LTR,
});

function rangesOverlap(r1: Range, r2: Range): boolean {
    return r1.from < r2.to && r2.from < r1.to;
}

class LatexTypstBidiIsolatesValue {
    decorations: DecorationSet;

    constructor(readonly view: EditorView) {
        this.decorations = this.build(view);
    }

    update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged) {
            this.decorations = this.build(update.view);
        }
    }

    private build(view: EditorView): DecorationSet {
        const b = new RangeSetBuilder<Decoration>();
        const skipRegion = view.state.field(mathEditRegionField, false);

        for (const { from, to } of view.visibleRanges) {
            let pos = from;
            while (pos <= to) {
                const line = view.state.doc.lineAt(pos);
                const latex = findLatexRangesInLine(line.text, line.from);
                const typst = findTypstRangesInLine(line.text, line.from);

                for (const r of latex) {
                    if (!skipRegion || !rangesOverlap(r, skipRegion)) {
                        b.add(r.from, r.to, isolate);
                    }
                }

                for (const r of typst) {
                    if (!skipRegion || !rangesOverlap(r, skipRegion)) {
                        b.add(r.from, r.to, isolate);
                    }
                }

                pos = line.to + 1;
            }
        }

        return b.finish();
    }
}

export function latexTypstBidiIsolates(): Extension {
    const plugin = ViewPlugin.fromClass(LatexTypstBidiIsolatesValue, {
        decorations: (v) => v.decorations,
    });

    return [
        mathEditRegionField,
        plugin,
        EditorView.bidiIsolatedRanges.of((view) => {
            const v = view.plugin(plugin);
            return v ? v.decorations : Decoration.none;
        }),
    ];
}