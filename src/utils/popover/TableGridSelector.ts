// src/utils/popover/TableGridSelector.ts
import { t } from '@/i18n';
import { PopoverAnchor } from './popoverAnchor';

export interface TableGridOptions {
	maxRows: number;
	maxCols: number;
	onSelect: (rows: number, cols: number) => void;
}

export class TableGridSelector {
	public readonly container: HTMLDivElement;
	private grid: HTMLDivElement;
	private label: HTMLDivElement;
	private cells: HTMLDivElement[][] = [];
	private anchor: PopoverAnchor;

	constructor(
		button: HTMLElement,
		private readonly options: TableGridOptions,
	) {
		this.container = this.createContainer();
		this.grid = this.createGrid();
		this.label = this.createLabel();

		this.container.appendChild(this.grid);
		this.container.appendChild(this.label);

		this.anchor = new PopoverAnchor(button, this.container);

		this.grid.addEventListener('mouseover', this.handleMouseOver.bind(this));
		this.grid.addEventListener('mouseleave', this.handleMouseLeave.bind(this));
		this.grid.addEventListener('click', this.handleClick.bind(this));
	}

	private createContainer(): HTMLDivElement {
		const container = document.createElement('div');
		container.className = 'popover';
		return container;
	}

	private createGrid(): HTMLDivElement {
		const grid = document.createElement('div');
		grid.className = 'popover-grid';

		for (let row = 0; row < this.options.maxRows; row++) {
			this.cells[row] = [];
			for (let col = 0; col < this.options.maxCols; col++) {
				const cell = document.createElement('div');
				cell.className = 'popover-grid-cell';
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
		label.className = 'popover-grid-label';
		label.textContent = t('Select size');
		return label;
	}

	private handleMouseOver(e: MouseEvent): void {
		const target = e.target as HTMLElement;
		if (!target.classList.contains('popover-grid-cell')) return;

		const row = parseInt(target.dataset.row || '0', 10);
		const col = parseInt(target.dataset.col || '0', 10);

		this.highlightCells(row + 1, col + 1);
	}

	private handleMouseLeave(): void {
		this.highlightCells(0, 0);
	}

	private handleClick(e: MouseEvent): void {
		const target = e.target as HTMLElement;
		if (!target.classList.contains('popover-grid-cell')) return;

		const row = parseInt(target.dataset.row || '0', 10);
		const col = parseInt(target.dataset.col || '0', 10);

		this.options.onSelect(row + 1, col + 1);
		this.close();
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

		this.label.textContent =
			rows > 0 && cols > 0 ? `${rows} × ${cols}` : t('Select size');
	}

	toggle(): void {
		this.anchor.toggle(() => this.highlightCells(0, 0));
	}

	open(): void {
		this.anchor.open(() => this.highlightCells(0, 0));
	}

	close(): void {
		this.anchor.close();
	}

	destroy(): void {
		this.anchor.destroy();
	}
}
