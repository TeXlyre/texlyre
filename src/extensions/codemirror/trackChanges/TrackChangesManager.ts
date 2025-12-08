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

    constructor(yDoc: Y.Doc, yText: Y.Text, userId: string) {
        this.yDoc = yDoc;
        this.yText = yText;
        this.currentUserId = userId;
        this.positionTracker = new PositionTracker(yDoc, yText);

        this.yObserver = (event: Y.YTextEvent, transaction: Y.Transaction) => {
            if (this.processingChange || !this.enabled) return;
            if (this.positionTracker.isUndoRedoOperation()) return;

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

        this.processingChange = true;
        const changeId = this.generateId();

        this.changes.set(changeId, {
            id: changeId,
            type: 'deletion',
            content: content,
            start: from,
            userId: this.currentUserId,
            timestamp: Date.now(),
            isBackwardDelete
        });

        this.processingChange = false;
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