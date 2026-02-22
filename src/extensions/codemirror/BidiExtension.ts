// src/extensions/codemirror/BidiExtension.ts
import { RangeSetBuilder, type Extension, StateField, StateEffect } from "@codemirror/state";
import {
    Decoration,
    Direction,
    EditorView,
    ViewPlugin,
    ViewUpdate,
    type DecorationSet,
} from "@codemirror/view";

import { allBidiPatterns } from "./bidi/patterns";

type TextRange = { from: number; to: number };

export const setMathEditRegion = StateEffect.define<TextRange | null>();

const mathEditRegionField = StateField.define<TextRange | null>({
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

const isolate = Decoration.mark({
    attributes: { style: "unicode-bidi: isolate; direction: ltr;" },
    bidiIsolate: Direction.LTR,
});

function rangesOverlap(r1: TextRange, r2: TextRange): boolean {
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
        const doc = view.state.doc.toString();
        const allRanges: TextRange[] = [];

        for (const { from: vpFrom, to: vpTo } of view.visibleRanges) {
            for (const { pattern } of allBidiPatterns) {
                pattern.lastIndex = 0;
                let match: RegExpExecArray | null;
                while ((match = pattern.exec(doc)) !== null) {
                    const from = match.index;
                    const to = from + match[0].length;
                    if (to < vpFrom) continue;
                    if (from > vpTo) break;
                    allRanges.push({ from, to });
                }
            }
        }

        allRanges.sort((a, b) => a.from - b.from || a.to - b.to);

        const merged: TextRange[] = [];
        for (const range of allRanges) {
            if (merged.length === 0) {
                merged.push({ ...range });
            } else {
                const last = merged[merged.length - 1];
                if (range.from < last.to) {
                    last.to = Math.max(last.to, range.to);
                } else {
                    merged.push({ ...range });
                }
            }
        }

        for (const r of merged) {
            if (!skipRegion || !rangesOverlap(r, skipRegion)) {
                b.add(r.from, r.to, isolate);
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