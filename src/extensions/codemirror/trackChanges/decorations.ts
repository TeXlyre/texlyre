// extensions/codemirror/trackingChanges/decorations.ts
import { Decoration } from '@codemirror/view';
import type { EditorView } from '@codemirror/view';
import type { TrackedChange } from './TrackChangesManager';
import { DeletionWidget } from './widgets';

export function buildDecorations(view: EditorView, changes: TrackedChange[]) {
    const decorations: any[] = [];
    const docLength = view.state.doc.length;

    for (const change of changes) {
        if (change.type === 'insertion' && change.start !== undefined && change.end !== undefined) {
            const start = Math.min(change.start, docLength);
            const end = Math.min(change.end, docLength);

            if (start < end && start >= 0 && end <= docLength) {
                decorations.push(
                    Decoration.mark({
                        class: 'tracked-insertion',
                        attributes: { 'data-change-id': change.id }
                    }).range(start, end)
                );
            }
        } else if (change.type === 'deletion' && change.start !== undefined) {
            const pos = Math.min(change.start, docLength);

            if (pos >= 0 && pos <= docLength) {
                decorations.push(
                    Decoration.widget({
                        widget: new DeletionWidget(change),
                        side: 1,
                        block: false
                    }).range(pos)
                );
            }
        }
    }

    return Decoration.set(decorations.sort((a, b) => a.from - b.from));
}