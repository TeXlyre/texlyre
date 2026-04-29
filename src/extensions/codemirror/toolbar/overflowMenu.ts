// src/extensions/codemirror/toolbar/overflowMenu.ts
import type { EditorView } from '@codemirror/view';
import type { ToolbarItem } from 'codemirror-toolbar';

export interface CollapsedGroup {
    items: ToolbarItem[];
}

export interface OverflowMenuOptions {
    getGroups: () => CollapsedGroup[];
}

export class OverflowMenu {
    public readonly container: HTMLDivElement;
    private isOpen = false;
    private boundHandleDocumentClick = (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        if (this.isOpen && !this.container.contains(target) && !this.button.contains(target)) {
            this.close();
        }
    };

    constructor(
        private readonly view: EditorView,
        private readonly button: HTMLElement,
        private readonly options: OverflowMenuOptions,
    ) {
        this.container = document.createElement('div');
        this.container.className = 'cm-toolbar-overflow-menu dropdown-menu';
    }

    private render(): void {
        this.container.innerHTML = '';
        const groups = this.options.getGroups();
        const allItems: ToolbarItem[] = [];

        groups.forEach((group, idx) => {
            const section = document.createElement('div');
            section.className = 'cm-toolbar-overflow-section';

            for (const item of group.items) {
                allItems.push(item);
                const entry = document.createElement('button');
                entry.type = 'button';
                entry.className = 'dropdown-item cm-toolbar-overflow-item';
                entry.dataset.idx = String(allItems.length - 1);
                entry.innerHTML = `<span class="cm-toolbar-overflow-icon">${item.icon ?? ''}</span><span>${item.label ?? item.key}</span>`;
                section.appendChild(entry);
            }

            this.container.appendChild(section);

            if (idx < groups.length - 1) {
                const sep = document.createElement('div');
                sep.className = 'cm-toolbar-overflow-separator';
                this.container.appendChild(sep);
            }
        });

        this.container.onclick = (e) => {
            const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-idx]');
            if (!btn) return;
            e.stopPropagation();
            const item = allItems[Number(btn.dataset.idx)];
            if (!item) return;

            const original = this.button.dataset.item;
            this.button.dataset.item = item.key;
            this.close();
            item.command(this.view);
            queueMicrotask(() => {
                if (original) this.button.dataset.item = original;
                else delete this.button.dataset.item;
            });
        };
    }

    toggle(): void {
        this.isOpen ? this.close() : setTimeout(() => this.open(), 0);
    }

    open(): void {
        if (this.isOpen) return;

        this.render();
        document.body.appendChild(this.container);

        const buttonRect = this.button.getBoundingClientRect();
        this.container.style.position = 'fixed';
        this.container.style.top = `${buttonRect.bottom + 4}px`;
        this.container.style.left = `${buttonRect.left}px`;

        const menuRect = this.container.getBoundingClientRect();
        if (menuRect.right > window.innerWidth - 4) {
            this.container.style.left = `${Math.max(4, window.innerWidth - menuRect.width - 4)}px`;
        }

        document.addEventListener('click', this.boundHandleDocumentClick);
        this.isOpen = true;
    }

    close(): void {
        if (!this.isOpen) return;
        document.removeEventListener('click', this.boundHandleDocumentClick);
        this.container.remove();
        this.isOpen = false;
    }

    destroy(): void {
        this.close();
    }
}
