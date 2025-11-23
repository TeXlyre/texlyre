// src/extensions/codemirror/toolbar/tableGird.ts
import type { EditorView } from '@codemirror/view';

export interface TableGridOptions {
    maxRows: number;
    maxCols: number;
    onSelect: (view: EditorView, rows: number, cols: number) => void;
}

export class TableGridSelector {
    private container: HTMLDivElement;
    private grid: HTMLDivElement;
    private label: HTMLDivElement;
    private cells: HTMLDivElement[][] = [];
    private isOpen = false;
    private boundHandleDocumentClick: (e: MouseEvent) => void;

    constructor(
        private readonly view: EditorView,
        private readonly button: HTMLElement,
        private readonly options: TableGridOptions
    ) {
        this.boundHandleDocumentClick = this.handleDocumentClick.bind(this);
        this.container = this.createContainer();
        this.grid = this.createGrid();
        this.label = this.createLabel();

        this.container.appendChild(this.grid);
        this.container.appendChild(this.label);

        this.setupEventListeners();
    }

    private createContainer(): HTMLDivElement {
        const container = document.createElement('div');
        container.className = 'cm-table-grid-container';
        return container;
    }

    private createGrid(): HTMLDivElement {
        const grid = document.createElement('div');
        grid.className = 'cm-table-grid';

        for (let row = 0; row < this.options.maxRows; row++) {
            this.cells[row] = [];
            for (let col = 0; col < this.options.maxCols; col++) {
                const cell = document.createElement('div');
                cell.className = 'cm-table-grid-cell';
                cell.dataset.row = String(row);
                cell.dataset.col = String(col);
                this.cells[row][col] = cell;
                grid.appendChild(cell);
            }
        }

        return grid;
    }

    private createLabel(): HTMLDivElement {
        const label = document.createElement('div');
        label.className = 'cm-table-grid-label';
        label.textContent = 'Select size';
        return label;
    }

    private setupEventListeners(): void {
        this.grid.addEventListener('mouseover', this.handleMouseOver.bind(this));
        this.grid.addEventListener('mouseleave', this.handleMouseLeave.bind(this));
        this.grid.addEventListener('click', this.handleClick.bind(this));

        document.addEventListener('click', this.boundHandleDocumentClick);
    }

    private handleMouseOver(e: MouseEvent): void {
        const target = e.target as HTMLElement;
        if (!target.classList.contains('cm-table-grid-cell')) return;

        const row = parseInt(target.dataset.row || '0', 10);
        const col = parseInt(target.dataset.col || '0', 10);

        this.highlightCells(row + 1, col + 1);
    }

    private handleMouseLeave(): void {
        this.highlightCells(0, 0);
    }

    private handleClick(e: MouseEvent): void {
        const target = e.target as HTMLElement;
        if (!target.classList.contains('cm-table-grid-cell')) return;

        const row = parseInt(target.dataset.row || '0', 10);
        const col = parseInt(target.dataset.col || '0', 10);

        this.options.onSelect(this.view, row + 1, col + 1);
        this.close();
    }

    private handleDocumentClick(e: MouseEvent): void {
        if (!this.isOpen) return;

        const target = e.target as HTMLElement;
        if (!this.container.contains(target) && !this.button.contains(target)) {
            this.close();
        }
    }

    private highlightCells(rows: number, cols: number): void {
        for (let row = 0; row < this.options.maxRows; row++) {
            for (let col = 0; col < this.options.maxCols; col++) {
                const cell = this.cells[row][col];
                if (row < rows && col < cols) {
                    cell.classList.add('highlighted');
                } else {
                    cell.classList.remove('highlighted');
                }
            }
        }

        this.label.textContent = rows > 0 && cols > 0 ? `${rows} × ${cols}` : 'Select size';
    }

    toggle(): void {
        if (this.isOpen) {
            this.close();
        } else {
            this.open();
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
        this.highlightCells(0, 0);
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