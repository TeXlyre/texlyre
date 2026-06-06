// extras/viewers/milkdown/toolbar/ImagePicker.ts
import { t } from '@/i18n';
import { filePathCacheService } from '@/services/FilePathCacheService';

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
	private isOpen = false;
	private boundHandleDocumentClick: (e: MouseEvent) => void;

	constructor(
		private readonly button: HTMLElement,
		private readonly options: ImagePickerOptions,
	) {
		this.boundHandleDocumentClick = this.handleDocumentClick.bind(this);
		this.container = this.createContainer();
		this.input = this.createInput();
		this.list = this.createList();

		this.container.appendChild(this.input);
		this.container.appendChild(this.list);

		this.setupEventListeners();
	}

	private createContainer(): HTMLDivElement {
		const container = document.createElement('div');
		container.className = 'milkdown-image-picker';
		return container;
	}

	private createInput(): HTMLInputElement {
		const input = document.createElement('input');
		input.type = 'text';
		input.className = 'milkdown-image-picker-input';
		input.placeholder = t('Image path or URL');
		return input;
	}

	private createList(): HTMLDivElement {
		const list = document.createElement('div');
		list.className = 'milkdown-image-picker-list';
		return list;
	}

	private setupEventListeners(): void {
		this.input.addEventListener('input', () => this.renderSuggestions());
		this.input.addEventListener('keydown', this.handleKeyDown.bind(this));
		this.list.addEventListener('click', this.handleListClick.bind(this));
		document.addEventListener('click', this.boundHandleDocumentClick);
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
			item.className = 'milkdown-image-picker-item';
			item.dataset.path = path;
			item.textContent = path;
			this.list.appendChild(item);
		}
	}

	private handleListClick(e: MouseEvent): void {
		const target = (e.target as HTMLElement).closest(
			'.milkdown-image-picker-item',
		) as HTMLElement | null;
		if (!target?.dataset.path) return;
		this.commit(target.dataset.path);
	}

	private handleKeyDown(e: KeyboardEvent): void {
		const items = Array.from(
			this.list.querySelectorAll<HTMLElement>('.milkdown-image-picker-item'),
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
		const toolbar = this.button.closest('.plugin-toolbar');

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
		this.input.value = '';
		this.list.replaceChildren();
		this.loadSuggestions();
		this.input.focus();
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
