// extensions/codemirror/trackingChanges/TrackChangesManager.ts
import * as Y from 'yjs';

export interface TrackedChange {
    id: string;
    type: 'insertion' | 'deletion';
    content: string;
    start: number;
    end?: number;
    userId: string;
    timestamp: number;
}

export class TrackChangesManager {
    private yText: Y.Text;
    private yDoc: Y.Doc;
    private changes: Map<string, TrackedChange> = new Map();
    private enabled: boolean = false;
    private currentUserId: string;
    private yObserver: ((event: Y.YTextEvent) => void) | null = null;

    constructor(yDoc: Y.Doc, yText: Y.Text, userId: string) {
        this.yDoc = yDoc;
        this.yText = yText;
        this.currentUserId = userId;

        this.yObserver = (event: Y.YTextEvent) => {
            if (!this.enabled) return;

            event.delta.forEach((change: any) => {
                if (change.retain !== undefined) {
                    const retained = change.retain;
                    this.adjustPositions(retained, 0, true);
                }
            });
        };

        this.yText.observe(this.yObserver);
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

        const changeId = this.generateId();

        this.adjustPositions(pos, text.length, false);

        this.changes.set(changeId, {
            id: changeId,
            type: 'insertion',
            content: text,
            start: pos,
            end: pos + text.length,
            userId: this.currentUserId,
            timestamp: Date.now()
        });
    }

    trackDeletion(from: number, to: number, content?: string): void {
        if (!this.enabled) return;

        const deletedContent = content || this.yText.toString().slice(from, to);
        const changeId = this.generateId();

        const length = deletedContent.length;
        this.adjustPositions(from, -length, false);

        this.changes.set(changeId, {
            id: changeId,
            type: 'deletion',
            content: deletedContent,
            start: from,
            userId: this.currentUserId,
            timestamp: Date.now()
        });
    }

    private adjustPositions(threshold: number, delta: number, onlyAfter: boolean): void {
        this.changes.forEach((change) => {
            if (change.type === 'insertion' && change.end !== undefined) {
                if (onlyAfter) {
                    if (change.start >= threshold) {
                        change.start += delta;
                        change.end += delta;
                    }
                } else {
                    if (change.start >= threshold) {
                        change.start += delta;
                        change.end += delta;
                    }
                }
            } else if (change.type === 'deletion') {
                if (onlyAfter) {
                    if (change.start >= threshold) {
                        change.start += delta;
                    }
                } else {
                    if (change.start >= threshold) {
                        change.start += delta;
                    }
                }
            }
        });
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