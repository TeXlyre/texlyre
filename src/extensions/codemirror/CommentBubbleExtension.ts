// src/extensions/codemirror/CommentBubbleExtension.ts
import { ViewPlugin } from '@codemirror/view';
import type { EditorView } from 'codemirror';

const commentBubblePlugin = ViewPlugin.fromClass(
	class {
		private floatingButton: HTMLElement | null = null;
		private hideTimeout: number | null = null;
		private modalOpen: boolean = false;

		constructor(private view: EditorView) {
			this.view.dom.addEventListener('click', this.onClick.bind(this));
			this.view.dom.addEventListener('mouseup', this.onMouseUp.bind(this));
			this.view.dom.addEventListener('selectionchange', this.onSelectionChange.bind(this));
			document.addEventListener('selectionchange', this.onSelectionChange.bind(this));
			document.addEventListener('show-comment-modal', this.onModalOpen.bind(this));
			document.addEventListener('comment-modal-closed', this.onModalClose.bind(this));
			document.addEventListener('hide-floating-comment-button', this.hideFloatingButton.bind(this));
		}

		onModalOpen() {
			this.modalOpen = true;
			this.hideFloatingButton();
		}

		onModalClose() {
			this.modalOpen = false;
		}

		onClick(event: MouseEvent) {
			const target = event.target as HTMLElement;

			if (target.closest('.floating-comment-button')) {
				return;
			}

			const commentElement = target.closest('.cm-comment-content');

			if (commentElement) {
				const rect = commentElement.getBoundingClientRect();
				const mouseX = event.clientX;
				const mouseY = event.clientY;

				const iconArea = {
					left: rect.right - 20,
					right: rect.right,
					top: rect.top - 15,
					bottom: rect.top + 5,
				};

				if (
					mouseX >= iconArea.left &&
					mouseX <= iconArea.right &&
					mouseY >= iconArea.top &&
					mouseY <= iconArea.bottom
				) {
					event.preventDefault();
					event.stopPropagation();

					const commentId = commentElement.getAttribute('data-comment-id');
					if (commentId) {
						document.dispatchEvent(
							new CustomEvent('scroll-to-comment', {
								detail: { commentId },
							}),
						);
					}
				}
			} else {
				this.hideFloatingButton();
			}
		}

		onMouseUp(event: MouseEvent) {
			const target = event.target as HTMLElement;
			if (target.closest('.floating-comment-button')) {
				return;
			}

			setTimeout(() => {
				this.updateFloatingButton();
			}, 10);
		}

		onSelectionChange() {
			if (this.hideTimeout) {
				clearTimeout(this.hideTimeout);
				this.hideTimeout = null;
			}

			this.hideTimeout = window.setTimeout(() => {
				this.updateFloatingButton();
			}, 100);
		}

		updateFloatingButton() {
			if (this.modalOpen) {
				this.hideFloatingButton();
				return;
			}

			const selection = this.view.state.selection.main;

			if (selection.from === selection.to || selection.to - selection.from < 1) {
				this.hideFloatingButton();
				return;
			}

			if (!this.floatingButton) {
				this.createFloatingButton();
			}

			this.positionFloatingButton(selection);
		}

		createFloatingButton() {
			this.floatingButton = document.createElement('button');
			this.floatingButton.className = 'floating-comment-button';
			this.floatingButton.title = 'Add comment (Alt+C)';
			this.floatingButton.innerText = 'Add comment';
			this.floatingButton.addEventListener('click', (e) => {
				e.preventDefault();
				e.stopPropagation();

				const selection = this.view.state.selection.main;
				this.modalOpen = true;
				document.dispatchEvent(
					new CustomEvent('show-comment-modal', {
						detail: { selection: { from: selection.from, to: selection.to } },
					})
				);

				this.hideFloatingButton();
			});

			document.body.appendChild(this.floatingButton);
		}

		positionFloatingButton(selection: { from: number; to: number }) {
			if (!this.floatingButton) return;

			const coords = this.view.coordsAtPos(selection.to);
			if (!coords) {
				this.hideFloatingButton();
				return;
			}

			const editorRect = this.view.dom.getBoundingClientRect();
			const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
			const scrollTop = window.pageYOffset || document.documentElement.scrollTop;

			this.floatingButton.style.position = 'absolute';
			this.floatingButton.style.left = `${coords.left + scrollLeft + 10}px`;
			this.floatingButton.style.top = `${coords.top + scrollTop - 35}px`;
			this.floatingButton.style.display = 'block';
			this.floatingButton.style.zIndex = '1000';
		}

		hideFloatingButton() {
			if (this.floatingButton) {
				this.floatingButton.style.display = 'none';
			}
		}

		destroy() {
			this.view.dom.removeEventListener('click', this.onClick.bind(this));
			this.view.dom.removeEventListener('mouseup', this.onMouseUp.bind(this));
			this.view.dom.removeEventListener('selectionchange', this.onSelectionChange.bind(this));
			document.removeEventListener('selectionchange', this.onSelectionChange.bind(this));
			document.removeEventListener('show-comment-modal', this.onModalOpen.bind(this));
			document.removeEventListener('comment-modal-closed', this.onModalClose.bind(this));
			document.removeEventListener('hide-floating-comment-button', this.hideFloatingButton.bind(this));

			if (this.hideTimeout) {
				clearTimeout(this.hideTimeout);
			}

			if (this.floatingButton) {
				this.floatingButton.remove();
				this.floatingButton = null;
			}
		}
	},
);

export const commentBubbleExtension = [commentBubblePlugin];