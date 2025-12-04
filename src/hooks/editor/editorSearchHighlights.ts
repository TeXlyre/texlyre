// src/hooks/editor/editorSearchHighlights.ts
import type { MutableRefObject } from 'react';
import type { EditorView } from 'codemirror';
import {
    clearSearchHighlights,
    setSearchHighlights,
} from '../../extensions/codemirror/SearchHighlightExtension';

export const registerEditorSearchHighlightEvents = (
    viewRef: MutableRefObject<EditorView | null>,
) => {
    const handleHighlightSearch = (event: Event) => {
        const customEvent = event as CustomEvent<{
            query: string;
            caseSensitive: boolean;
        }>;
        const { query, caseSensitive } = customEvent.detail;

        if (viewRef.current && query) {
            viewRef.current.dispatch({
                effects: setSearchHighlights.of({ query, caseSensitive }),
            });
        }
    };

    const handleClearHighlights = () => {
        if (viewRef.current) {
            viewRef.current.dispatch({
                effects: clearSearchHighlights.of(null),
            });
        }
    };

    document.addEventListener(
        'highlight-search-in-editor',
        handleHighlightSearch,
    );
    document.addEventListener('clear-search-highlights', handleClearHighlights);

    return () => {
        document.removeEventListener(
            'highlight-search-in-editor',
            handleHighlightSearch,
        );
        document.removeEventListener(
            'clear-search-highlights',
            handleClearHighlights,
        );
    };
};
