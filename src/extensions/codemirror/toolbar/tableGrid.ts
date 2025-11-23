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

    constructor(
        private readonly view: EditorView,
        private readonly button: HTMLElement,
        private readonly options: TableGridOptions
    ) {
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
        container.style.cssText = `
			position: absolute;
			display: none;
			flex-direction: column;
			align-items: center;
			background: #fff;
			border: 1px solid #ddd;
			border-radius: 4px;
			padding: 8px;
			box-shadow: 0 2px 8px rgba(0,0,0,0.15);
			z-index: 1000;
		`;
        return container;
    }

    private createGrid(): HTMLDivElement {
        const grid = document.createElement('div');
        grid.className = 'cm-table-grid';
        grid.style.cssText = `
			display: grid;
			grid-template-columns: repeat(${this.options.maxCols}, 16px);
			grid-template-rows: repeat(${this.options.maxRows}, 16px);
			gap: 2px;
		`;

        for (let row = 0; row < this.options.maxRows; row++) {
            this.cells[row] = [];
            for (let col = 0; col < this.options.maxCols; col++) {
                const cell = document.createElement('div');
                cell.className = 'cm-table-grid-cell';
                cell.dataset.row = String(row);
                cell.dataset.col = String(col);
                cell.style.cssText = `
					width: 16px;
					height: 16px;
					border: 1px solid #ddd;
					background: #fff;
					cursor: pointer;
					transition: background-color 0.1s;
				`;
                this.cells[row][col] = cell;
                grid.appendChild(cell);
            }
        }

        return grid;
    }

    private createLabel(): HTMLDivElement {
        const label = document.createElement('div');
        label.className = 'cm-table-grid-label';
        label.style.cssText = `
			margin-top: 6px;
			font-size: 12px;
			color: #666;
		`;
        label.textContent = 'Select size';
        return label;
    }

    private setupEventListeners(): void {
        this.grid.addEventListener('mouseover', this.handleMouseOver.bind(this));
        this.grid.addEventListener('mouseleave', this.handleMouseLeave.bind(this));
        this.grid.addEventListener('click', this.handleClick.bind(this));

        document.addEventListener('click', this.handleDocumentClick.bind(this));
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
                    cell.style.background = '#1EA7FD';
                    cell.style.borderColor = '#1EA7FD';
                } else {
                    cell.style.background = '#fff';
                    cell.style.borderColor = '#ddd';
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

        this.container.style.display = 'flex';
        this.isOpen = true;
        this.highlightCells(0, 0);
    }

    close(): void {
        if (!this.isOpen) return;

        this.container.style.display = 'none';
        this.isOpen = false;
    }

    destroy(): void {
        document.removeEventListener('click', this.handleDocumentClick.bind(this));
        this.container.remove();
    }
}