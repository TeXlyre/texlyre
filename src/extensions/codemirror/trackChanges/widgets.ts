// extensions/codemirror/trackingChanges/widgets.ts
import { WidgetType } from '@codemirror/view';
import type { TrackedChange } from './TrackChangesManager';

export class DeletionWidget extends WidgetType {
    constructor(private change: TrackedChange) {
        super();
    }

    toDOM(): HTMLElement {
        const span = document.createElement('span');
        span.className = 'tracked-deletion';
        span.setAttribute('data-change-id', this.change.id);
        span.contentEditable = 'false';
        span.textContent = this.change.content;
        span.style.display = 'inline';
        span.style.backgroundColor = 'rgba(255, 0, 0, 0.3)';
        span.style.textDecoration = 'line-through';
        span.style.color = 'red';
        span.style.userSelect = 'none';
        span.title = `Deleted: "${this.change.content}"`;
        return span;
    }

    eq(other: DeletionWidget): boolean {
        return this.change.id === other.change.id;
    }

    ignoreEvent(): boolean {
        return true;
    }

    get estimatedHeight() {
        return -1;
    }

    updateDOM(): boolean {
        return false;
    }
}