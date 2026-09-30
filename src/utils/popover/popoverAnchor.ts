// src/utils/popover/popoverAnchor.ts
export class PopoverAnchor {
	private isOpen = false;
	private boundDocumentClick: (e: MouseEvent) => void;

	constructor(
		private readonly button: HTMLElement,
		private readonly container: HTMLElement,
		private readonly onClose?: () => void,
	) {
		this.boundDocumentClick = this.handleDocumentClick.bind(this);
		document.addEventListener('click', this.boundDocumentClick);
	}

	get opened(): boolean {
		return this.isOpen;
	}

	toggle(onOpen?: () => void): void {
		if (this.isOpen) {
			this.close();
		} else {
			setTimeout(() => this.open(onOpen), 0);
		}
	}

	open(onOpen?: () => void): void {
		if (this.isOpen) return;

		const buttonRect = this.button.getBoundingClientRect();

		// NOTE (fabawi): Popovers are overlays, so are kept outside scrollable toolbars while
		// keeping them inside the active fullscreen tree when necessary.
		const host = document.fullscreenElement ?? document.body;
		host.appendChild(this.container);
		this.container.style.position = 'fixed';
		this.container.style.top = `${buttonRect.bottom + 4}px`;
		this.container.style.left = `${buttonRect.left}px`;

		this.isOpen = true;
		onOpen?.();
	}

	close(): void {
		if (!this.isOpen) return;

		this.container.remove();
		this.isOpen = false;
		this.onClose?.();
	}

	destroy(): void {
		document.removeEventListener('click', this.boundDocumentClick);
		this.container.remove();
	}

	private handleDocumentClick(e: MouseEvent): void {
		if (!this.isOpen) return;

		const target = e.target as Node;
		if (!this.container.contains(target) && !this.button.contains(target)) {
			this.close();
		}
	}
}
