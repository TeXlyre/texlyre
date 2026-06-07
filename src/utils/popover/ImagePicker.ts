// src/utils/popover/ImagePicker.ts
import { t } from '@/i18n';
import { filePathCacheService } from '@/services/FilePathCacheService';
import { PopoverAnchor } from './popoverAnchor';

const IMAGE_EXTENSIONS = new Set([
	'png',
	'jpg',
	'jpeg',
	'gif',
	'bmp',
	'svg',
	'webp',
	'ico',
	'eps',
]);

export interface ImagePickerOptions {
	getCurrentFilePath: () => string;
	onSelect: (src: string) => void;
}

const isHttpUrl = (value: string): boolean =>
	/^https?:\/\//i.test(value.trim());

export class ImagePicker {
	public readonly container: HTMLDivElement;
	private input: HTMLInputElement;
	private list: HTMLDivElement;
	private suggestions: string[] = [];
	private activeIndex = -1;
	private anchor: PopoverAnchor;

	constructor(
		button: HTMLElement,
		private readonly options: ImagePickerOptions,
	) {
		this.container = this.createContainer();
		this.input = this.createInput();
		this.list = this.createList();

		this.container.appendChild(this.input);
		this.container.appendChild(this.list);

		this.anchor = new PopoverAnchor(button, this.container);

		this.input.addEventListener('input', () => this.renderSuggestions());
		this.input.addEventListener('keydown', this.handleKeyDown.bind(this));
		this.list.addEventListener('click', this.handleListClick.bind(this));
	}

	private createContainer(): HTMLDivElement {
		const container = document.createElement('div');
		container.className = 'popover';
		return container;
	}

	private createInput(): HTMLInputElement {
		const input = document.createElement('input');
		input.type = 'text';
		input.className = 'popover-image-input';
		input.placeholder = t('Image path or URL');
		return input;
	}

	private createList(): HTMLDivElement {
		const list = document.createElement('div');
		list.className = 'popover-image-list';
		return list;
	}

	private async loadSuggestions(): Promise<void> {
		const fromPath = this.options.getCurrentFilePath();
		const files = filePathCacheService.flattenFiles(
			await filePathCacheService.getCachedFiles(),
		);

		this.suggestions = files
			.filter((file) => {
				if (file.type !== 'file' || file.isDeleted) return false;
				const ext = file.name.split('.').pop()?.toLowerCase();
				return !!ext && IMAGE_EXTENSIONS.has(ext);
			})
			.map((file) =>
				filePathCacheService.getLatexRelativePath(fromPath, file.path),
			)
			.sort((a, b) => a.localeCompare(b));

		this.renderSuggestions();
	}

	private filtered(): string[] {
		const query = this.input.value.trim().toLowerCase();
		if (!query || isHttpUrl(query)) return [];
		return this.suggestions.filter((path) =>
			path.toLowerCase().includes(query),
		);
	}

	private renderSuggestions(): void {
		const matches = this.filtered();
		this.activeIndex = -1;
		this.list.replaceChildren();

		for (const path of matches) {
			const item = document.createElement('div');
			item.className = 'popover-image-item';
			item.dataset.path = path;
			item.textContent = path;
			this.list.appendChild(item);
		}
	}

	private handleListClick(e: MouseEvent): void {
		const target = (e.target as HTMLElement).closest(
			'.popover-image-item',
		) as HTMLElement | null;
		if (!target?.dataset.path) return;
		this.commit(target.dataset.path);
	}

	private handleKeyDown(e: KeyboardEvent): void {
		const items = Array.from(
			this.list.querySelectorAll<HTMLElement>('.popover-image-item'),
		);

		if (e.key === 'ArrowDown' && items.length) {
			e.preventDefault();
			this.activeIndex = (this.activeIndex + 1) % items.length;
			this.highlight(items);
		} else if (e.key === 'ArrowUp' && items.length) {
			e.preventDefault();
			this.activeIndex = (this.activeIndex - 1 + items.length) % items.length;
			this.highlight(items);
		} else if (e.key === 'Enter') {
			e.preventDefault();
			const chosen =
				this.activeIndex >= 0
					? items[this.activeIndex]?.dataset.path
					: this.input.value.trim();
			if (chosen) this.commit(chosen);
		} else if (e.key === 'Escape') {
			e.preventDefault();
			this.close();
		}
	}

	private highlight(items: HTMLElement[]): void {
		items.forEach((item, idx) => {
			item.classList.toggle('active', idx === this.activeIndex);
		});
	}

	private commit(src: string): void {
		this.options.onSelect(src);
		this.close();
	}

	toggle(): void {
		this.anchor.toggle(() => this.onOpen());
	}

	open(): void {
		this.anchor.open(() => this.onOpen());
	}

	close(): void {
		this.anchor.close();
	}

	destroy(): void {
		this.anchor.destroy();
	}

	private onOpen(): void {
		this.input.value = '';
		this.list.replaceChildren();
		this.loadSuggestions();
		this.input.focus();
	}
}
