import type { EditorView } from '@codemirror/view';

export interface ColorPickerOptions {
    onSelect: (view: EditorView, color: string) => void;
}

const PRESET_COLORS = [
    '#000000', '#333333', '#666666', '#999999', '#CCCCCC', '#FFFFFF',
    '#FF0000', '#FF6600', '#FFCC00', '#00FF00', '#00CCFF', '#0066FF',
    '#CC00FF', '#FF0066', '#8B4513', '#FFD700', '#008000', '#4B0082',
];

export class ColorPicker {
    public readonly container: HTMLDivElement;
    private grid: HTMLDivElement;
    private customInput: HTMLInputElement;
    private isOpen = false;
    private boundHandleDocumentClick: (e: MouseEvent) => void;

    constructor(
        private readonly view: EditorView,
        private readonly button: HTMLElement,
        private readonly options: ColorPickerOptions
    ) {
        this.boundHandleDocumentClick = this.handleDocumentClick.bind(this);
        this.container = this.createContainer();
        this.grid = this.createGrid();
        this.customInput = this.createCustomInput();

        this.container.appendChild(this.grid);
        this.container.appendChild(this.customInput);

        this.setupEventListeners();
    }

    private createContainer(): HTMLDivElement {
        const container = document.createElement('div');
        container.className = 'cm-color-picker-container';
        return container;
    }

    private createGrid(): HTMLDivElement {
        const grid = document.createElement('div');
        grid.className = 'cm-color-picker-grid';

        for (const color of PRESET_COLORS) {
            const cell = document.createElement('div');
            cell.className = 'cm-color-picker-cell';
            cell.style.backgroundColor = color;
            cell.dataset.color = color;
            grid.appendChild(cell);
        }

        return grid;
    }

    private createCustomInput(): HTMLInputElement {
        const input = document.createElement('input');
        input.type = 'color';
        input.className = 'cm-color-picker-custom';
        input.value = '#000000';
        return input;
    }

    private setupEventListeners(): void {
        this.grid.addEventListener('click', this.handleGridClick.bind(this));
        this.customInput.addEventListener('change', this.handleCustomChange.bind(this));
        document.addEventListener('click', this.boundHandleDocumentClick);
    }

    private handleGridClick(e: MouseEvent): void {
        const target = e.target as HTMLElement;
        if (!target.classList.contains('cm-color-picker-cell')) return;

        const color = target.dataset.color;
        if (color) {
            this.options.onSelect(this.view, color);
            this.close();
        }
    }

    private handleCustomChange(): void {
        const color = this.customInput.value;
        this.options.onSelect(this.view, color);
        this.close();
    }

    private handleDocumentClick(e: MouseEvent): void {
        if (!this.isOpen) return;

        const target = e.target as HTMLElement;
        if (!this.container.contains(target) && !this.button.contains(target)) {
            this.close();
        }
    }

    toggle(): void {
        if (this.isOpen) {
            this.close();
        } else {
            setTimeout(() => this.open(), 0);
        }
    }

    open(): void {
        if (this.isOpen) return;

        const buttonRect = this.button.getBoundingClientRect();
        const toolbar = this.button.closest('.codemirror-toolbar');

        if (toolbar) {
            toolbar.appendChild(this.container);
        } else {
            document.body.appendChild(this.container);
        }

        const toolbarRect = toolbar?.getBoundingClientRect();
        if (toolbarRect) {
            this.container.style.top = `${buttonRect.bottom - toolbarRect.top + 4}px`;
            this.container.style.left = `${buttonRect.left - toolbarRect.left}px`;
        } else {
            this.container.style.top = `${buttonRect.bottom + 4}px`;
            this.container.style.left = `${buttonRect.left}px`;
        }

        this.isOpen = true;
    }

    close(): void {
        if (!this.isOpen) return;

        this.container.remove();
        this.isOpen = false;
    }

    destroy(): void {
        document.removeEventListener('click', this.boundHandleDocumentClick);
        this.container.remove();
    }
}