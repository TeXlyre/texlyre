import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view';
import { StateEffect, StateField } from '@codemirror/state';

const highlightMark = Decoration.mark({ class: 'cm-search-highlight' });

export const setSearchHighlights = StateEffect.define<{ query: string; caseSensitive: boolean }>();
export const clearSearchHighlights = StateEffect.define<null>();

const searchHighlightField = StateField.define<DecorationSet>({
    create() {
        return Decoration.none;
    },
    update(decorations, tr) {
        decorations = decorations.map(tr.changes);

        for (const effect of tr.effects) {
            if (effect.is(setSearchHighlights)) {
                const { query, caseSensitive } = effect.value;
                if (!query) {
                    decorations = Decoration.none;
                    continue;
                }

                const highlights: Array<{ from: number; to: number }> = [];
                const text = tr.state.doc.toString();
                const searchQuery = caseSensitive ? query : query.toLowerCase();
                const searchText = caseSensitive ? text : text.toLowerCase();

                let index = 0;
                while ((index = searchText.indexOf(searchQuery, index)) !== -1) {
                    highlights.push({
                        from: index,
                        to: index + query.length,
                    });
                    index += query.length;
                }

                decorations = Decoration.set(
                    highlights.map((range) => highlightMark.range(range.from, range.to))
                );
            } else if (effect.is(clearSearchHighlights)) {
                decorations = Decoration.none;
            }
        }

        return decorations;
    },
    provide: (field) => EditorView.decorations.from(field),
});

export const searchHighlightExtension = [searchHighlightField];