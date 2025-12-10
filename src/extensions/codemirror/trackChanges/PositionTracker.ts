// src/extensions/codemirror/trackChanges
import * as Y from 'yjs';
import type { TrackedChange } from './TrackChangesManager';

export class PositionTracker {
    private yText: Y.Text;
    private yDoc: Y.Doc;
    private undoManager: Y.UndoManager | null = null;

    constructor(yDoc: Y.Doc, yText: Y.Text) {
        this.yDoc = yDoc;
        this.yText = yText;
    }

    setUndoManager(undoManager: Y.UndoManager): void {
        this.undoManager = undoManager;
    }

    adjustChangesForDelta(changes: Map<string, TrackedChange>, delta: any[]): void {
        let offset = 0;

        for (const op of delta) {
            if (op.retain !== undefined) {
                offset += op.retain;
            } else if (op.insert !== undefined) {
                const insertLength = typeof op.insert === 'string' ? op.insert.length : 1;
                this.shiftChangesAfter(changes, offset, insertLength);
                offset += insertLength;
            } else if (op.delete !== undefined) {
                const deleteLength = op.delete;
                this.handleDeletion(changes, offset, deleteLength);
            }
        }
    }

    private shiftChangesAfter(changes: Map<string, TrackedChange>, position: number, delta: number): void {
        for (const [id, change] of changes.entries()) {
            if (change.type === 'insertion' && change.end !== undefined) {
                if (change.start >= position) {
                    change.start += delta;
                    change.end += delta;
                } else if (change.start < position && change.end > position) {
                    change.end += delta;
                }
            } else if (change.type === 'deletion') {
                if (change.start >= position) {
                    change.start += delta;
                }
            }
        }
    }

    private handleDeletion(changes: Map<string, TrackedChange>, position: number, length: number): void {
        const toRemove: string[] = [];
        const deleteEnd = position + length;

        for (const [id, change] of changes.entries()) {
            if (change.type === 'insertion' && change.end !== undefined) {
                const changeStart = change.start!;
                const changeEnd = change.end;

                if (changeEnd <= position) {
                    continue;
                } else if (changeStart >= deleteEnd) {
                    change.start = changeStart - length;
                    change.end = changeEnd - length;
                } else if (changeStart >= position && changeEnd <= deleteEnd) {
                    toRemove.push(id);
                } else if (changeStart < position && changeEnd > deleteEnd) {
                    change.end = changeEnd - length;
                } else if (changeStart < position && changeEnd > position) {
                    change.end = position;
                } else if (changeStart >= position && changeStart < deleteEnd && changeEnd > deleteEnd) {
                    const overlap = deleteEnd - changeStart;
                    change.start = position;
                    change.end = changeEnd - overlap;
                }
            } else if (change.type === 'deletion' && change.start !== undefined) {
                if (change.start >= deleteEnd) {
                    change.start -= length;
                } else if (change.start > position) {
                    change.start = position;
                }
            }
        }

        toRemove.forEach(id => changes.delete(id));
    }

    isUndoRedoOperation(): boolean {
        if (!this.undoManager) return false;
        return this.undoManager.undoing || this.undoManager.redoing;
    }
}