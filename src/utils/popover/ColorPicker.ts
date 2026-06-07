// src/utils/popover/ColorPicker.ts
import type { EditorView } from '@codemirror/view';

import { PopoverAnchor } from './popoverAnchor';

export interface ColorPickerOptions {
	onSelect: (view: EditorView, color: string) => void;
}

const PRESET_COLORS = [
	'#000000',
	'#333333',
	'#666666',
	'#999999',
	'#CCCCCC',
	'#FFFFFF',
	'#FF0000',
	'#FF6600',
	'#FFCC00',
	'#00FF00',
	'#00CCFF',
	'#0066FF',
	'#CC00FF',
	'#FF0066',
	'#8B4513',
	'#FFD700',
	'#008000',
	'#4B0082',
];

export class ColorPicker {
	public readonly container: HTMLDivElement;
	private grid: HTMLDivElement;
	private customInput: HTMLInputElement;
	private anchor: PopoverAnchor;

	constructor(
		private readonly view: EditorView,
		button: HTMLElement,
		private readonly options: ColorPickerOptions,
	) {
		this.container = this.createContainer();
		this.grid = this.createGrid();
		this.customInput = this.createCustomInput();

		this.container.appendChild(this.grid);
		this.container.appendChild(this.customInput);

		this.anchor = new PopoverAnchor(button, this.container);

		this.grid.addEventListener('click', this.handleGridClick.bind(this));
		this.customInput.addEventListener(
			'change',
			this.handleCustomChange.bind(this),
		);
	}

	private createContainer(): HTMLDivElement {
		const container = document.createElement('div');
		container.className = 'popover';
		return container;
	}

	private createGrid(): HTMLDivElement {
		const grid = document.createElement('div');
		grid.className = 'popover-color-grid';

		for (const color of PRESET_COLORS) {
			const cell = document.createElement('div');
			cell.className = 'popover-color-cell';
			cell.style.backgroundColor = color;
			cell.dataset.color = color;
			grid.appendChild(cell);
		}

		return grid;
	}

	private createCustomInput(): HTMLInputElement {
		const input = document.createElement('input');
		input.type = 'color';
		input.className = 'popover-color-custom';
		input.value = '#000000';
		return input;
	}

	private handleGridClick(e: MouseEvent): void {
		const target = e.target as HTMLElement;
		if (!target.classList.contains('popover-color-cell')) return;

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

	toggle(): void {
		this.anchor.toggle();
	}

	open(): void {
		this.anchor.open();
	}

	close(): void {
		this.anchor.close();
	}

	destroy(): void {
		this.anchor.destroy();
	}
}
