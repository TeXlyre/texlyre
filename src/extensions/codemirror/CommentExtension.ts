// src/extensions/codemirror/CommentExtension.ts
import {
	RangeSet,
	StateEffect,
	StateField,
	type Transaction,
} from "@codemirror/state";
import {
	Decoration,
	EditorView,
	ViewPlugin,
	WidgetType,
} from "@codemirror/view";

import type { Comment } from "../../types/comments";
import { commentBubbleExtension } from "./CommentBubbleExtension";

export const addComment = StateEffect.define<{
	id: string;
	positions: {
		openTag: { start: number; end: number };
		content: { start: number; end: number };
		closeTag: { start: number; end: number };
	};
	resolved?: boolean;
}>();
export const clearComments = StateEffect.define<null>();

class CommentWidget extends WidgetType {
	constructor(
		private type: "open" | "close",
		private id: string,
	) {
		super();
	}

	eq(other: CommentWidget): boolean {
		return this.type === other.type && this.id === other.id;
	}

	toDOM(): HTMLElement {
		const span = document.createElement("span");
		span.className = `comment-${this.type}-tag`;
		span.dataset.commentId = this.id;
		return span;
	}

	get estimatedHeight() {
		return 0;
	}

	ignoreEvent() {
		return true;
	}
}

interface CommentRange {
	id: string;
	openStart: number;
	openEnd: number;
	closeStart: number;
	closeEnd: number;
}

const commentRanges = StateField.define<CommentRange[]>({
	create() {
		return [];
	},
	update(ranges, tr) {
		let newRanges = ranges.map((range) => ({
			...range,
			openStart: tr.changes.mapPos(range.openStart),
			openEnd: tr.changes.mapPos(range.openEnd),
			closeStart: tr.changes.mapPos(range.closeStart),
			closeEnd: tr.changes.mapPos(range.closeEnd),
		}));

		for (const e of tr.effects) {
			if (e.is(clearComments)) {
				newRanges = [];
				break;
			}
		}

		for (const e of tr.effects) {
			if (e.is(addComment)) {
				const { id, positions } = e.value;

				if (
					positions.openTag.start < positions.openTag.end &&
					positions.closeTag.start < positions.closeTag.end &&
					positions.openTag.end <= positions.closeTag.start
				) {
					newRanges.push({
						id,
						openStart: positions.openTag.start,
						openEnd: positions.openTag.end,
						closeStart: positions.closeTag.start,
						closeEnd: positions.closeTag.end,
					});
				} else {
					console.warn(`Invalid comment range for comment ${id}, skipping`);
				}
			}
		}

		newRanges.sort((a, b) => a.openStart - b.openStart);
		return newRanges;
	},
});

function preventTagEdits(tr: Transaction): Transaction | null {
	const ranges = tr.startState.field(commentRanges, false);
	if (!ranges || ranges.length === 0 || !tr.changes.length) {
		return tr;
	}

	let hasTagEdit = false;
	const changesArray: Array<{ from: number; to: number; insert: string }> = [];

	tr.changes.iterChanges((fromA, toA, fromB, toB, inserted) => {
		for (const range of ranges) {
			if (
				(fromA < range.openEnd && toA > range.openStart) ||
				(fromA < range.closeEnd && toA > range.closeStart)
			) {
				hasTagEdit = true;
			}
		}
		changesArray.push({
			from: fromA,
			to: toA,
			insert: inserted.toString(),
		});
	});

	if (!hasTagEdit) {
		return tr;
	}

	const adjustedChanges: Array<{ from: number; to: number; insert: string }> =
		[];

	for (const change of changesArray) {
		let { from, to, insert } = change;
		let processed = false;

		const sortedRanges = [...ranges].sort((a, b) => a.openStart - b.openStart);

		for (const range of sortedRanges) {
			if (from < range.openEnd && to > range.openStart) {
				if (from < range.openStart && to > range.openEnd) {
					adjustedChanges.push({ from, to: range.openStart, insert });
					adjustedChanges.push({ from: range.openEnd, to, insert: "" });
					processed = true;
					break;
				} else if (from < range.openStart) {
					to = range.openStart;
				} else if (to > range.openEnd) {
					from = range.openEnd;
				} else {
					processed = true;
					break;
				}
			}

			if (!processed && from < range.closeEnd && to > range.closeStart) {
				if (from < range.closeStart && to > range.closeEnd) {
					adjustedChanges.push({ from, to: range.closeStart, insert });
					adjustedChanges.push({ from: range.closeEnd, to, insert: "" });
					processed = true;
					break;
				} else if (from < range.closeStart) {
					to = range.closeStart;
				} else if (to > range.closeEnd) {
					from = range.closeEnd;
				} else {
					processed = true;
					break;
				}
			}
		}

		if (!processed && from < to) {
			adjustedChanges.push({ from, to, insert });
		}
	}

	if (adjustedChanges.length === 0) {
		return null;
	}

	try {
		return tr.startState.update({
			changes: adjustedChanges,
			selection: tr.selection,
			effects: tr.effects,
		});
	} catch (error) {
		console.error("Error creating adjusted transaction:", error);
		return tr;
	}
}

export const commentState = StateField.define<RangeSet<Decoration>>({
	create() {
		return RangeSet.empty;
	},

	update(value, tr) {
		value = value.map(tr.changes);

		for (const e of tr.effects) {
			if (e.is(clearComments)) {
				value = RangeSet.empty;
				break;
			}
		}

		const allDecorations = [];

		for (const e of tr.effects) {
			if (e.is(addComment)) {
				const { id, positions, resolved } = e.value;

				// Always hide the comment tags (both resolved and unresolved)
				if (
					positions.openTag &&
					positions.openTag.start !== undefined &&
					positions.openTag.end !== undefined
				) {
					allDecorations.push({
						decoration: Decoration.replace({
							widget: new CommentWidget("open", id),
							inclusive: false,
						}),
						from: positions.openTag.start,
						to: positions.openTag.end,
						priority: 1000 + positions.openTag.start,
					});
				}

				if (
					positions.closeTag &&
					positions.closeTag.start !== undefined &&
					positions.closeTag.end !== undefined
				) {
					allDecorations.push({
						decoration: Decoration.replace({
							widget: new CommentWidget("close", id),
							inclusive: false,
						}),
						from: positions.closeTag.start,
						to: positions.closeTag.end,
						priority: 1000 + positions.closeTag.start,
					});
				}

				// Only apply content highlighting to unresolved comments
				if (
					!resolved &&
					positions.content &&
					positions.content.start !== undefined &&
					positions.content.end !== undefined &&
					positions.content.start < positions.content.end
				) {
					allDecorations.push({
						decoration: Decoration.mark({
							class: "cm-comment-content",
							attributes: { "data-comment-id": id },
						}),
						from: positions.content.start,
						to: positions.content.end,
						priority: 500 + positions.content.start,
					});
				}
			}
		}

		if (allDecorations.length > 0) {
			allDecorations.sort((a, b) => a.from - b.from || b.priority - a.priority);

			const decorationRanges = allDecorations.map((d) =>
				d.decoration.range(d.from, d.to),
			);

			value = value.update({ add: decorationRanges });
		}

		return value;
	},

	provide: (field) => EditorView.decorations.from(field),
});

export function processComments(view: EditorView, comments: Comment[]): void {
	if (!view || !comments || !Array.isArray(comments)) return;

	try {
		const effects: (
			| StateEffect<null>
			| StateEffect<{
					id: string;
					positions: {
						openTag: { start: number; end: number };
						content: { start: number; end: number };
						closeTag: { start: number; end: number };
					};
					resolved?: boolean;
			  }>
		)[] = [];

		const clearEffect = clearComments.of(null);
		effects.push(clearEffect);

		const docLength = view.state.doc.length;
		const docContent = view.state.doc.toString();

		console.log("Processing comments:", comments.length);

		// Process ALL comments to hide their tags, but only highlight unresolved ones
		const sortedComments = [...comments].sort(
			(a, b) => a.openTagStart - b.openTagStart,
		);

		for (const comment of sortedComments) {
			if (
				comment.openTagStart !== undefined &&
				comment.openTagEnd !== undefined &&
				comment.closeTagStart !== undefined &&
				comment.closeTagEnd !== undefined
			) {
				console.log(
					`Comment ${comment.id}: open(${comment.openTagStart}-${comment.openTagEnd}) close(${comment.closeTagStart}-${comment.closeTagEnd}) resolved: ${comment.resolved}`,
				);

				if (
					comment.openTagStart < 0 ||
					comment.closeTagEnd > docLength ||
					comment.openTagStart >= comment.openTagEnd ||
					comment.closeTagStart >= comment.closeTagEnd ||
					comment.openTagEnd > comment.closeTagStart
				) {
					console.warn(
						`Invalid comment positions for comment ${comment.id}, skipping`,
					);
					continue;
				}

				const positions = {
					openTag: {
						start: comment.openTagStart,
						end: comment.openTagEnd,
					},
					content: {
						start: comment.openTagEnd,
						end: comment.closeTagStart,
					},
					closeTag: {
						start: comment.closeTagStart,
						end: comment.closeTagEnd,
					},
				};

				effects.push(
					addComment.of({
						id: comment.id,
						positions,
						resolved: comment.resolved,
					}),
				);
			}
		}

		console.log("Dispatching effects:", effects.length);
		if (view.state) {
			view.dispatch({ effects });
		}
	} catch (error) {
		console.error("Error dispatching comment effects:", error);
	}
}

class CommentProcessor {
	private view: EditorView;
	private lastContent = "";
	private pendingUpdate: number | null = null;
	private commentRanges: CommentRange[] = [];
	private inputHandler: ((event: Event) => boolean) | null = null;
	private keydownHandler: ((event: KeyboardEvent) => boolean) | null = null;

	constructor(view: EditorView) {
		this.view = view;
		this.setupEventHandlers();
		this.scheduleProcess();
	}

	private setupEventHandlers() {
		this.inputHandler = (event: Event) => {
			const inputEvent = event as InputEvent;
			if (this.commentRanges.length === 0) return false;

			const selection = this.view.state.selection.main;
			const { from, to } = selection;

			if (
				inputEvent.inputType &&
				(inputEvent.inputType.includes("delete") ||
					inputEvent.inputType.includes("insert") ||
					inputEvent.inputType === "insertText" ||
					inputEvent.inputType === "insertCompositionText")
			) {
				if (this.wouldAffectTags(from, to, inputEvent.inputType)) {
					event.preventDefault();
					event.stopPropagation();
					this.handleSkipOperation(
						from,
						to,
						inputEvent.inputType,
						inputEvent.data,
					);
					return true;
				}
			}

			return false;
		};

		this.keydownHandler = (event: KeyboardEvent) => {
			if (this.commentRanges.length === 0) return false;

			const selection = this.view.state.selection.main;
			const { from, to } = selection;

			if (event.key === "Backspace" || event.key === "Delete") {
				let deleteFrom: number;
				let deleteTo: number;

				if (from === to) {
					if (event.key === "Backspace") {
						deleteFrom = Math.max(0, from - 1);
						deleteTo = from;
					} else {
						deleteFrom = from;
						deleteTo = Math.min(this.view.state.doc.length, from + 1);
					}
				} else {
					deleteFrom = from;
					deleteTo = to;
				}

				if (
					deleteFrom < deleteTo &&
					this.wouldAffectTags(deleteFrom, deleteTo, "deleteContentBackward")
				) {
					event.preventDefault();
					event.stopPropagation();
					this.handleSkipOperation(
						deleteFrom,
						deleteTo,
						event.key === "Backspace"
							? "deleteContentBackward"
							: "deleteContentForward",
					);
					return true;
				}
			}

			if (from !== to && this.wouldAffectTags(from, to)) {
				if (
					event.key === "Backspace" ||
					event.key === "Delete" ||
					event.key === "Enter" ||
					event.key === "Tab" ||
					(!event.ctrlKey &&
						!event.altKey &&
						!event.metaKey &&
						event.key.length === 1)
				) {
					event.preventDefault();
					event.stopPropagation();

					const inputType =
						event.key === "Backspace"
							? "deleteContentBackward"
							: event.key === "Delete"
								? "deleteContentForward"
								: "insertText";
					const data =
						event.key.length === 1 &&
						!event.ctrlKey &&
						!event.altKey &&
						!event.metaKey
							? event.key
							: null;

					this.handleSkipOperation(from, to, inputType, data);
					return true;
				}
			}

			return false;
		};

		this.view.dom.addEventListener("beforeinput", this.inputHandler, true);
		this.view.dom.addEventListener("keydown", this.keydownHandler, true);
	}

	private wouldAffectTags(
		from: number,
		to: number,
		inputType?: string,
	): boolean {
		const sortedRanges = [...this.commentRanges].sort(
			(a, b) => a.openStart - b.openStart,
		);

		for (const range of sortedRanges) {
			if (
				(from < range.openEnd && to > range.openStart) ||
				(from < range.closeEnd && to > range.closeStart)
			) {
				return true;
			}
		}
		return false;
	}

	private handleSkipOperation(
		from: number,
		to: number,
		inputType?: string,
		data?: string | null,
	) {
		if (
			data &&
			(inputType === "insertText" || inputType === "insertCompositionText")
		) {
			const deleteChanges = this.calculateSkipChanges(from, to, "delete");
			if (deleteChanges.changes.length > 0) {
				try {
					this.view.dispatch({
						changes: deleteChanges.changes,
						selection: {
							anchor: deleteChanges.cursorPos,
							head: deleteChanges.cursorPos,
						},
					});

					setTimeout(() => {
						this.view.dispatch({
							changes: {
								from: deleteChanges.cursorPos,
								to: deleteChanges.cursorPos,
								insert: data,
							},
							selection: {
								anchor: deleteChanges.cursorPos + data.length,
								head: deleteChanges.cursorPos + data.length,
							},
						});
					}, 0);
				} catch (error) {
					console.error("Error applying insertion with skip operation:", error);
				}
			}
			return;
		}

		if (from + 1 === to || from - 1 === to) {
			const newCursorPos = this.handleSingleCharDeletion(from, to, inputType);
			if (newCursorPos !== null) {
				try {
					this.view.dispatch({
						selection: { anchor: newCursorPos, head: newCursorPos },
					});
				} catch (error) {
					console.error("Error moving cursor for single char deletion:", error);
				}
				return;
			}
		}

		const result = this.calculateSkipChanges(from, to, "delete");

		if (result.changes.length > 0) {
			try {
				this.view.dispatch({
					changes: result.changes,
					selection: { anchor: result.cursorPos, head: result.cursorPos },
				});
			} catch (error) {
				console.error("Error applying skip operation:", error);
			}
		} else if (result.cursorPos !== from) {
			try {
				this.view.dispatch({
					selection: { anchor: result.cursorPos, head: result.cursorPos },
				});
			} catch (error) {
				console.error("Error moving cursor:", error);
			}
		}
	}

	private handleSingleCharDeletion(
		from: number,
		to: number,
		inputType?: string,
	): number | null {
		const isBackspace = inputType === "deleteContentBackward";
		const sortedRanges = [...this.commentRanges].sort(
			(a, b) => a.openStart - b.openStart,
		);

		for (const range of sortedRanges) {
			if (from < range.openEnd && to > range.openStart) {
				if (isBackspace) {
					return range.openStart;
				} else {
					return range.openEnd;
				}
			}

			if (from < range.closeEnd && to > range.closeStart) {
				if (isBackspace) {
					return range.closeStart;
				} else {
					return range.closeEnd;
				}
			}
		}

		return null;
	}

	private calculateSkipChanges(
		from: number,
		to: number,
		operation: "delete",
	): {
		changes: Array<{ from: number; to: number; insert: string }>;
		cursorPos: number;
	} {
		const changes = [];
		let newCursorPos = from;
		const sortedRanges = [...this.commentRanges].sort(
			(a, b) => a.openStart - b.openStart,
		);

		let currentFrom = from;
		const currentTo = to;

		for (const range of sortedRanges) {
			if (currentTo <= range.openStart || currentFrom >= range.closeEnd) {
				continue;
			}

			if (currentFrom < range.openEnd && currentTo > range.openStart) {
				if (currentFrom < range.openStart) {
					changes.push({ from: currentFrom, to: range.openStart, insert: "" });
					newCursorPos = range.openStart;
				}

				if (currentTo > range.openEnd) {
					currentFrom = range.openEnd;
				} else {
					newCursorPos = range.openStart;
					break;
				}
			}

			if (currentFrom >= range.openEnd && currentFrom < range.closeStart) {
				const contentEnd = Math.min(currentTo, range.closeStart);
				if (currentFrom < contentEnd) {
					changes.push({ from: currentFrom, to: contentEnd, insert: "" });
					newCursorPos = currentFrom;
				}
				currentFrom = contentEnd;
			}

			if (currentFrom < range.closeEnd && currentTo > range.closeStart) {
				if (currentTo > range.closeEnd) {
					currentFrom = range.closeEnd;
				} else {
					newCursorPos = range.closeStart;
					break;
				}
			}
		}

		if (currentFrom < currentTo) {
			changes.push({ from: currentFrom, to: currentTo, insert: "" });
			if (changes.length === 1 && currentFrom === from) {
				newCursorPos = currentFrom;
			}
		}

		return { changes, cursorPos: newCursorPos };
	}

	scheduleProcess() {
		if (this.pendingUpdate === null) {
			this.pendingUpdate = requestAnimationFrame(() => {
				this.pendingUpdate = null;
				this.checkContent();
			});
		}
	}

	checkContent() {
		const content = this.view.state.doc.toString();
		if (content !== this.lastContent) {
			this.lastContent = content;

			const event = new CustomEvent("codemirror-content-changed", {
				detail: { content, view: this.view },
			});
			document.dispatchEvent(event);
		}
	}

	update(update: any) {
		const ranges = update.state.field(commentRanges, false);
		if (ranges) {
			this.commentRanges = ranges;
		}

		this.scheduleProcess();
	}

	destroy() {
		if (this.pendingUpdate !== null) {
			cancelAnimationFrame(this.pendingUpdate);
			this.pendingUpdate = null;
		}

		if (this.inputHandler) {
			this.view.dom.removeEventListener("beforeinput", this.inputHandler, true);
		}
		if (this.keydownHandler) {
			this.view.dom.removeEventListener("keydown", this.keydownHandler, true);
		}
	}
}

export const commentSystemExtension = [
	commentRanges,
	commentState,
	ViewPlugin.define((view) => new CommentProcessor(view)),
	...commentBubbleExtension,
];
