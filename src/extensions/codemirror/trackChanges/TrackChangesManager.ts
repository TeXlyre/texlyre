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

        const isSelection = content.length > 1;
        let combinedContent = content;

        if (isSelection) {
            const overlappingDeletions = this.getDeletionsInRange(from, from + content.length);

            if (overlappingDeletions.length > 0) {
                const groupedByPosition = new Map<number, TrackedChange[]>();

                for (const deletion of overlappingDeletions) {
                    const pos = deletion.start ?? 0;
                    if (!groupedByPosition.has(pos)) {
                        groupedByPosition.set(pos, []);
                    }
                    groupedByPosition.get(pos)!.push(deletion);
                }

                const sortedPositions = Array.from(groupedByPosition.keys()).sort((a, b) => a - b);

                let insertOffset = 0;
                for (const pos of sortedPositions) {
                    const deletionsAtPos = groupedByPosition.get(pos)!;

                    const groupedBySequence = new Map<number, TrackedChange[]>();
                    for (const deletion of deletionsAtPos) {
                        const seqId = deletion.sequenceId ?? 0;
                        if (!groupedBySequence.has(seqId)) {
                            groupedBySequence.set(seqId, []);
                        }
                        groupedBySequence.get(seqId)!.push(deletion);
                    }

                    const sequenceIds = Array.from(groupedBySequence.keys()).sort((a, b) => a - b);

                    for (const seqId of sequenceIds) {
                        const deletions = groupedBySequence.get(seqId)!;
                        const isBackward = deletions[0]?.isBackwardDelete ?? false;

                        if (isBackward) {
                            deletions.sort((a, b) => b.timestamp - a.timestamp);
                        } else {
                            deletions.sort((a, b) => a.timestamp - b.timestamp);
                        }

                        const reconstructedContent = deletions.map(d => d.content).join('');
                        const relativePos = pos - from + insertOffset;

                        combinedContent = combinedContent.slice(0, relativePos) + reconstructedContent + combinedContent.slice(relativePos);
                        insertOffset += reconstructedContent.length;

                        for (const deletion of deletions) {
                            this.changes.delete(deletion.id);
                        }
                    }
                }
            }
        }

        if (!isSelection && this.isWithinInsertion(from, content.length)) {
            return;
        }

        this.processingChange = true;

        let sequenceId: number;
        let finalIsBackwardDelete = isBackwardDelete;

        if (isSelection) {
            this.currentSequenceId++;
            sequenceId = this.currentSequenceId;
            this.lastBackspacePosition = null;
            this.lastForwardDeletePosition = null;
            this.forwardDeleteSequenceStart = null;
            finalIsBackwardDelete = false;
        } else if (isBackwardDelete) {
            const isContinuation = this.lastBackspacePosition !== null &&
                from === this.lastBackspacePosition - content.length;

            const existingDeletion = this.getDeletionAt(from + content.length);

            if (!isContinuation || existingDeletion) {
                if (existingDeletion && existingDeletion.sequenceId !== undefined) {
                    sequenceId = existingDeletion.sequenceId - 0.001;
                } else {
                    this.currentSequenceId++;
                    sequenceId = this.currentSequenceId;
                }
            } else {
                sequenceId = this.currentSequenceId;
            }
            this.lastBackspacePosition = from;
            this.lastForwardDeletePosition = null;
            this.forwardDeleteSequenceStart = null;
        } else {
            const isContinuation = this.lastForwardDeletePosition !== null &&
                from === this.lastForwardDeletePosition;

            if (!isContinuation) {
                this.currentSequenceId++;
                this.forwardDeleteSequenceStart = this.currentSequenceId;
            }

            const existingDeletion = this.getDeletionAt(from + content.length);

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
            content: combinedContent,
            start: from,
            userId: this.currentUserId,
            timestamp: Date.now(),
            isBackwardDelete: finalIsBackwardDelete,
            sequenceId
        });

        this.processingChange = false;
    }

    private getDeletionsInRange(from: number, to: number): TrackedChange[] {
        const result: TrackedChange[] = [];
        for (const change of this.changes.values()) {
            if (change.type === 'deletion' && change.start !== undefined) {
                if (change.start >= from && change.start < to) {
                    result.push(change);
                }
            }
        }
        return result;
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