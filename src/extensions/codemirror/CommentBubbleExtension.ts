import { ViewPlugin } from "@codemirror/view";
import type { EditorView } from "codemirror";

const commentBubblePlugin = ViewPlugin.fromClass(
	class {
		constructor(private view: EditorView) {
			this.view.dom.addEventListener("click", this.onClick.bind(this));
		}

		onClick(event: MouseEvent) {
			const target = event.target as HTMLElement;
			const commentElement = target.closest(".cm-comment-content");

			if (commentElement) {
				const rect = commentElement.getBoundingClientRect();
				const mouseX = event.clientX;
				const mouseY = event.clientY;

				// Check if clicking on the comment icon area (top-right corner)
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

					const commentId = commentElement.getAttribute("data-comment-id");
					if (commentId) {
						document.dispatchEvent(
							new CustomEvent("scroll-to-comment", {
								detail: { commentId },
							}),
						);
					}
				}
			}
		}

		destroy() {
			this.view.dom.removeEventListener("click", this.onClick.bind(this));
		}
	},
);

export const commentBubbleExtension = [commentBubblePlugin];
