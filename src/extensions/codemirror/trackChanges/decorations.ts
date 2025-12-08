// extensions/codemirror/trackingChanges/decorations.ts
import { Decoration } from '@codemirror/view';
import type { EditorView } from '@codemirror/view';
import type { TrackedChange } from './TrackChangesManager';
import { DeletionWidget } from './widgets';

export function buildDecorations(view: EditorView, changes: TrackedChange[]) {
    const decorations: Array<{ from: number; to: number; decoration: any }> = [];
    const docLength = view.state.doc.length;

    for (const change of changes) {
        if (change.type === 'insertion' && change.start !== undefined && change.end !== undefined) {
            const start = Math.max(0, Math.min(change.start, docLength));
            const end = Math.max(start, Math.min(change.end, docLength));

            if (start < end) {
                decorations.push({
                    from: start,
                    to: end,
                    decoration: Decoration.mark({
                        class: 'tracked-insertion',
                        attributes: { 'data-change-id': change.id }
                    })
                });
            }
        } else if (change.type === 'deletion' && change.start !== undefined) {
            const pos = Math.max(0, Math.min(change.start, docLength));

            decorations.push({
                from: pos,
                to: pos,
                decoration: Decoration.widget({
                    widget: new DeletionWidget(change),
                    side: 1,
                    block: false
                })
            });
        }
    }

    decorations.sort((a, b) => {
        if (a.from !== b.from) return a.from - b.from;
        if (a.to !== b.to) return a.to - b.to;
        const aSide = a.decoration.spec?.side ?? 0;
        const bSide = b.decoration.spec?.side ?? 0;
        return aSide - bSide;
    });

    return Decoration.set(decorations.map(d => d.decoration.range(d.from, d.to)));
}