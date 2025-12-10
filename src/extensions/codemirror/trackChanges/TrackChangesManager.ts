// extensions/codemirror/trackingChanges/TrackChangesManager.ts
import * as Y from 'yjs';
import { PositionTracker } from './PositionTracker';

export interface TrackedChange {
    id: string;
    type: 'insertion' | 'deletion';
    start?: number;
    end?: number;
    content?: string;
    timestamp: number;
    userId: string;
    isBackwardDelete?: boolean;
    sequenceId?: number;
}

export class TrackChangesManager {
    private yText: Y.Text;
    private yDoc: Y.Doc;
    private changes: Map<string, TrackedChange> = new Map();
    private enabled: boolean = false;
    private currentUserId: string;
    private yObserver: ((event: Y.YTextEvent, transaction: Y.Transaction) => void) | null = null;
    private positionTracker: PositionTracker;
    private processingChange: boolean = false;
    private currentSequenceId: number = 0;
    private lastBackspacePosition: number | null = null;
    private lastForwardDeletePosition: number | null = null;
    private forwardDeleteSequenceStart: number | null = null;

    constructor(yDoc: Y.Doc, yText: Y.Text, userId: string) {
        this.yDoc = yDoc;
        this.yText = yText;
        this.currentUserId = userId;
        this.positionTracker = new PositionTracker(yDoc, yText);

        this.yObserver = (event: Y.YTextEvent, transaction: Y.Transaction) => {
            if (this.processingChange || !this.enabled) return;
            if (this.positionTracker.isUndoRedoOperation()) return;
            if (transaction.local) return;

            this.positionTracker.adjustChangesForDelta(this.changes, event.delta);
        };

        this.yText.observe(this.yObserver);
    }

    setUndoManager(undoManager: Y.UndoManager): void {
        this.positionTracker.setUndoManager(undoManager);
    }

    enable(): void {
        this.enabled = true;
    }

    disable(): void {
        this.enabled = false;
    }

    isEnabled(): boolean {
        return this.enabled;
    }

    trackInsertion(pos: number, text: string): void {
        if (!this.enabled) return;

        this.processingChange = true;
        const changeId = this.generateId();

        this.changes.set(changeId, {
            id: changeId,
            type: 'insertion',
            content: text,
            start: pos,
            end: pos + text.length,
            userId: this.currentUserId,
            timestamp: Date.now()
        });

        this.processingChange = false;
    }

    trackDeletion(from: number, content: string, isBackwardDelete: boolean = false): void {
        if (!this.enabled) return;
        if (this.isWithinInsertion(from, content.length)) return;

        this.processingChange = true;

        let sequenceId: number;

        if (isBackwardDelete) {
            const isContinuation = this.lastBackspacePosition !== null &&
                from === this.lastBackspacePosition - content.length;

            const existingDeletion = this.getDeletionAt(from + content.length);

            if (!isContinuation || existingDeletion) {
                if (existingDeletion && existingDeletion.sequenceId !== undefined) {
                    this.currentSequenceId = existingDeletion.sequenceId - 0.001;
                } else {
                    this.currentSequenceId++;
                }
            }
            sequenceId = this.currentSequenceId;
            this.lastBackspacePosition = from;
            this.lastForwardDeletePosition = null;
        } else {
            const isContinuation = this.lastForwardDeletePosition !== null &&
                from === this.lastForwardDeletePosition;

            const existingDeletion = this.getDeletionAt(from + content.length);

            if (!isContinuation) {
                this.currentSequenceId++;
                this.forwardDeleteSequenceStart = this.currentSequenceId;
            }

            if (existingDeletion && existingDeletion.sequenceId !== undefined) {
                const beforeSeqId = existingDeletion.sequenceId - 0.001;
                this.reassignSequence(this.forwardDeleteSequenceStart!, beforeSeqId);
                sequenceId = beforeSeqId;
                this.currentSequenceId = existingDeletion.sequenceId + 0.001;
                this.forwardDeleteSequenceStart = this.currentSequenceId;
            } else {
                sequenceId = this.currentSequenceId;
            }

            this.lastForwardDeletePosition = from;
            this.lastBackspacePosition = null;
        }

        const changeId = this.generateId();

        this.changes.set(changeId, {
            id: changeId,
            type: 'deletion',
            content: content,
            start: from,
            userId: this.currentUserId,
            timestamp: Date.now(),
            isBackwardDelete,
            sequenceId
        });

        this.processingChange = false;
    }

    private getDeletionAt(pos: number): TrackedChange | null {
        for (const change of this.changes.values()) {
            if (change.type === 'deletion' &&
                change.start === pos &&
                change.sequenceId !== this.currentSequenceId) {
                return change;
            }
        }
        return null;
    }

    private isWithinInsertion(pos: number, length: number): boolean {
        const deleteEnd = pos + length;
        for (const change of this.changes.values()) {
            if (change.type === 'insertion' && change.start !== undefined && change.end !== undefined) {
                if (pos >= change.start && deleteEnd <= change.end) {
                    return true;
                }
            }
        }
        return false;
    }

    private reassignSequence(oldSeqId: number | null, newSeqId: number): void {
        if (oldSeqId === null) return;
        for (const change of this.changes.values()) {
            if (change.type === 'deletion' && change.sequenceId === oldSeqId) {
                change.sequenceId = newSeqId;
            }
        }
    }

    adjustForLocalDeletion(pos: number, length: number): void {
        this.positionTracker.adjustChangesForDelta(this.changes, [
            { retain: pos },
            { delete: length }
        ]);
    }

    adjustForLocalInsertion(pos: number, length: number): void {
        this.positionTracker.adjustChangesForDelta(this.changes, [
            { retain: pos },
            { insert: 'x'.repeat(length) }
        ]);
    }

    getChanges(): TrackedChange[] {
        return Array.from(this.changes.values());
    }

    clearAllChanges(): void {
        this.changes.clear();
    }

    destroy(): void {
        if (this.yObserver) {
            this.yText.unobserve(this.yObserver);
            this.yObserver = null;
        }
    }

    private generateId(): string {
        return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
}