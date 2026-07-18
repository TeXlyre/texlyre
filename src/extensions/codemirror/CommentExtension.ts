// src/extensions/codemirror/CommentExtension.ts
import {
	Annotation,
	EditorState,
	Prec,
	RangeSet,
	StateEffect,
	StateField,
	Transaction,
} from '@codemirror/state';
import {
	Decoration,
	EditorView,
	ViewPlugin,
	WidgetType,
	keymap,
} from '@codemirror/view';

import type { Comment } from '../../types/comments';
import { commentBubbleExtension } from './CommentBubbleExtension';
import { createNamedLogger } from '@/logging';

const moduleLog = createNamedLogger('CommentExtension');

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

const removeComment = StateEffect.define<string>();
const skipCommentProtection = Annotation.define<boolean>();

class CommentWidget extends WidgetType {
	constructor(
		private type: 'open' | 'close',
		private id: string,
	) {
		super();
	}

	eq(other: CommentWidget): boolean {
		return this.type === other.type && this.id === other.id;
	}

	toDOM(): HTMLElement {
		const span = document.createElement('span');
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

interface SingleChange {
	from: number;
	to: number;
	insert: string;
}

interface Replacement {
	from: number;
	to: number;
	insert: string;
	cursorPos: number;
	removeId?: string;
	removeIds?: string[];
}

const commentRanges = StateField.define<CommentRange[]>({
	create() {
		return [];
	},

	update(ranges, tr) {
		let nextRanges = ranges.map((range) => ({
			...range,
			openStart: tr.changes.mapPos(range.openStart),
			openEnd: tr.changes.mapPos(range.openEnd),
			closeStart: tr.changes.mapPos(range.closeStart),
			closeEnd: tr.changes.mapPos(range.closeEnd),
		}));

		for (const effect of tr.effects) {
			if (effect.is(clearComments)) {
				nextRanges = [];
				break;
			}

			if (effect.is(removeComment)) {
				nextRanges = nextRanges.filter((range) => range.id !== effect.value);
			}
		}

		for (const effect of tr.effects) {
			if (!effect.is(addComment)) continue;

			const { id, positions } = effect.value;

			if (
				positions.openTag.start < positions.openTag.end &&
				positions.closeTag.start < positions.closeTag.end &&
				positions.openTag.end <= positions.closeTag.start
			) {
				nextRanges = nextRanges.filter((range) => range.id !== id);

				nextRanges.push({
					id,
					openStart: positions.openTag.start,
					openEnd: positions.openTag.end,
					closeStart: positions.closeTag.start,
					closeEnd: positions.closeTag.end,
				});
			} else {
				moduleLog.warn(`Invalid comment range for comment ${id}, skipping`);
			}
		}

		nextRanges.sort((a, b) => a.openStart - b.openStart);
		return nextRanges;
	},
});

const atomicCommentRanges = EditorView.atomicRanges.of((view) => {
	const ranges = view.state.field(commentRanges, false);
	if (!ranges?.length) return RangeSet.empty;

	const decorations = ranges
		.flatMap((range) => [
			{ from: range.openStart, to: range.openEnd },
			{ from: range.closeStart, to: range.closeEnd },
		])
		.filter((range) => range.from < range.to)
		.sort((a, b) => a.from - b.from)
		.map((range) => Decoration.mark({}).range(range.from, range.to));

	return RangeSet.of(decorations);
});

function intersects(
	from: number,
	to: number,
	rangeFrom: number,
	rangeTo: number,
): boolean {
	return from < rangeTo && to > rangeFrom;
}

function touchesTags(
	from: number,
	to: number,
	ranges: readonly CommentRange[],
): boolean {
	return ranges.some(
		(range) =>
			intersects(from, to, range.openStart, range.openEnd) ||
			intersects(from, to, range.closeStart, range.closeEnd),
	);
}

function getSingleChange(tr: Transaction): SingleChange | null {
	const changes: SingleChange[] = [];

	tr.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
		changes.push({
			from: fromA,
			to: toA,
			insert: inserted.toString(),
		});
	});

	return changes.length === 1 ? changes[0] : null;
}

function getDeleteDirection(
	tr: Transaction,
	change: SingleChange,
): 'backward' | 'forward' | null {
	if (change.insert.length > 0 || change.to - change.from !== 1) {
		return null;
	}

	const userEvent = tr.annotation(Transaction.userEvent);
	if (userEvent === 'delete.backward') return 'backward';
	if (userEvent === 'delete.forward') return 'forward';

	const selection = tr.startState.selection.main;
	if (!selection.empty) return null;

	if (selection.from === change.to) return 'backward';
	if (selection.from === change.from) return 'forward';

	return null;
}

function removeCommentEffects(
	replacement: Replacement,
): StateEffect<unknown>[] {
	const ids =
		replacement.removeIds ??
		(replacement.removeId ? [replacement.removeId] : []);

	return [...new Set(ids)].map((id) => removeComment.of(id));
}

function unwrapCommentReplacement(
	state: EditorState,
	range: CommentRange,
): Replacement {
	const content = state.doc.sliceString(range.openEnd, range.closeStart);

	return {
		from: range.openStart,
		to: range.closeEnd,
		insert: content,
		cursorPos: range.openStart,
		removeId: range.id,
	};
}

function getBoundaryDeletion(
	tr: Transaction,
	change: SingleChange,
	ranges: readonly CommentRange[],
): Replacement | null {
	const direction = getDeleteDirection(tr, change);
	if (!direction) return null;

	const cursorPos = direction === 'backward' ? change.to : change.from;

	for (const range of ranges) {
		const atOpenBoundary =
			direction === 'backward'
				? cursorPos === range.openEnd
				: cursorPos === range.openStart;

		const atCloseBoundary =
			direction === 'backward'
				? cursorPos === range.closeEnd
				: cursorPos === range.closeStart;

		if (atOpenBoundary || atCloseBoundary) {
			return unwrapCommentReplacement(tr.startState, range);
		}
	}

	return null;
}

function getProtectedCursorMove(
	tr: Transaction,
	change: SingleChange,
	ranges: readonly CommentRange[],
): number | null {
	const direction = getDeleteDirection(tr, change);
	if (!direction) return null;

	for (const range of ranges) {
		if (intersects(change.from, change.to, range.openStart, range.openEnd)) {
			return direction === 'backward' ? range.openStart : range.openEnd;
		}

		if (intersects(change.from, change.to, range.closeStart, range.closeEnd)) {
			return direction === 'backward' ? range.closeStart : range.closeEnd;
		}
	}

	return null;
}

function buildProtectedReplacement(
	state: EditorState,
	change: SingleChange,
	ranges: readonly CommentRange[],
): Replacement | null {
	const from = Math.min(change.from, change.to);
	const to = Math.max(change.from, change.to);

	if (!touchesTags(from, to, ranges)) {
		return null;
	}

	const protectedPieces: Array<{ from: number; to: number }> = [];
	const removeIds: string[] = [];

	for (const range of ranges) {
		if (range.closeEnd <= from || range.openStart >= to) {
			continue;
		}

		if (from <= range.openStart && to >= range.closeEnd) {
			removeIds.push(range.id);
			continue;
		}

		for (const protectedRange of [
			{ from: range.openStart, to: range.openEnd },
			{ from: range.closeStart, to: range.closeEnd },
		]) {
			const protectedFrom = Math.max(protectedRange.from, from);
			const protectedTo = Math.min(protectedRange.to, to);

			if (protectedFrom < protectedTo) {
				protectedPieces.push({
					from: protectedFrom,
					to: protectedTo,
				});
			}
		}
	}

	protectedPieces.sort((a, b) => a.from - b.from || a.to - b.to);

	const mergedPieces: Array<{ from: number; to: number }> = [];

	for (const piece of protectedPieces) {
		const last = mergedPieces[mergedPieces.length - 1];

		if (last && piece.from <= last.to) {
			last.to = Math.max(last.to, piece.to);
		} else {
			mergedPieces.push({ ...piece });
		}
	}

	let insert = '';
	let cursorOffset = 0;
	let inserted = false;

	const appendInsertedText = () => {
		if (inserted) return;

		insert += change.insert;
		cursorOffset = insert.length;
		inserted = true;
	};

	for (const piece of mergedPieces) {
		appendInsertedText();
		insert += state.doc.sliceString(piece.from, piece.to);
	}

	appendInsertedText();

	return {
		from,
		to,
		insert,
		cursorPos: from + cursorOffset,
		removeIds,
	};
}

function dispatchReplacement(view: EditorView, replacement: Replacement): void {
	view.dispatch({
		changes: {
			from: replacement.from,
			to: replacement.to,
			insert: replacement.insert,
		},
		selection: {
			anchor: replacement.cursorPos,
			head: replacement.cursorPos,
		},
		effects: removeCommentEffects(replacement),
		annotations: skipCommentProtection.of(true),
	});
}

const commentProtectionTransactionFilter = EditorState.transactionFilter.of(
	(tr) => {
		if (!tr.docChanged || tr.annotation(skipCommentProtection)) {
			return tr;
		}

		const ranges = tr.startState.field(commentRanges, false);
		if (!ranges?.length) return tr;

		const change = getSingleChange(tr);
		if (!change || !touchesTags(change.from, change.to, ranges)) {
			return tr;
		}

		const boundaryDeletion = getBoundaryDeletion(tr, change, ranges);
		if (boundaryDeletion) {
			return {
				changes: {
					from: boundaryDeletion.from,
					to: boundaryDeletion.to,
					insert: boundaryDeletion.insert,
				},
				selection: {
					anchor: boundaryDeletion.cursorPos,
					head: boundaryDeletion.cursorPos,
				},
				effects: removeCommentEffects(boundaryDeletion),
				annotations: skipCommentProtection.of(true),
			};
		}

		const cursorMove = getProtectedCursorMove(tr, change, ranges);
		if (cursorMove !== null) {
			return {
				selection: {
					anchor: cursorMove,
					head: cursorMove,
				},
				annotations: skipCommentProtection.of(true),
			};
		}

		const replacement = buildProtectedReplacement(
			tr.startState,
			change,
			ranges,
		);
		if (!replacement) return tr;

		const originalText = tr.startState.doc.sliceString(
			replacement.from,
			replacement.to,
		);

		if (originalText === replacement.insert) {
			return {
				selection: {
					anchor: replacement.cursorPos,
					head: replacement.cursorPos,
				},
				annotations: skipCommentProtection.of(true),
			};
		}

		return {
			changes: {
				from: replacement.from,
				to: replacement.to,
				insert: replacement.insert,
			},
			selection: {
				anchor: replacement.cursorPos,
				head: replacement.cursorPos,
			},
			effects: removeCommentEffects(replacement),
			annotations: skipCommentProtection.of(true),
		};
	},
);

function getBoundaryComment(
	view: EditorView,
	direction: 'forward' | 'backward',
): CommentRange | null {
	const selection = view.state.selection.main;
	if (!selection.empty) return null;

	const ranges = view.state.field(commentRanges, false);
	if (!ranges?.length) return null;

	const pos = selection.from;

	for (const range of ranges) {
		const atOpenBoundary =
			direction === 'backward'
				? pos === range.openEnd
				: pos === range.openStart;

		const atCloseBoundary =
			direction === 'backward'
				? pos === range.closeEnd
				: pos === range.closeStart;

		if (atOpenBoundary || atCloseBoundary) {
			return range;
		}
	}

	return null;
}

function deleteWholeCommentIfBoundary(
	view: EditorView,
	direction: 'forward' | 'backward',
): boolean {
	const range = getBoundaryComment(view, direction);
	if (!range) return false;

	try {
		dispatchReplacement(view, unwrapCommentReplacement(view.state, range));

		return true;
	} catch (error) {
		moduleLog.error('Error deleting comment chunk:', error);
		return false;
	}
}

const commentDeletionKeymap = Prec.highest(
	keymap.of([
		{
			key: 'Backspace',
			run: (view) => deleteWholeCommentIfBoundary(view, 'backward'),
		},
		{
			key: 'Delete',
			run: (view) => deleteWholeCommentIfBoundary(view, 'forward'),
		},
	]),
);

function getDecorationCommentId(decoration: Decoration): string | undefined {
	const spec = (decoration as unknown as { spec?: any }).spec;
	return spec?.attributes?.['data-comment-id'] ?? spec?.widget?.id;
}

export const commentState = StateField.define<RangeSet<Decoration>>({
	create() {
		return RangeSet.empty;
	},

	update(value, tr) {
		value = value.map(tr.changes);

		for (const effect of tr.effects) {
			if (effect.is(clearComments)) {
				value = RangeSet.empty;
			}

			if (effect.is(removeComment)) {
				value = value.update({
					filter: (_from, _to, decoration) =>
						getDecorationCommentId(decoration) !== effect.value,
				});
			}
		}

		const decorations: Array<{
			decoration: Decoration;
			from: number;
			to: number;
			priority: number;
		}> = [];

		for (const effect of tr.effects) {
			if (!effect.is(addComment)) continue;

			const { id, positions, resolved } = effect.value;

			value = value.update({
				filter: (_from, _to, decoration) =>
					getDecorationCommentId(decoration) !== id,
			});

			decorations.push({
				decoration: Decoration.replace({
					widget: new CommentWidget('open', id),
					inclusive: false,
				}),
				from: positions.openTag.start,
				to: positions.openTag.end,
				priority: 1000 + positions.openTag.start,
			});

			decorations.push({
				decoration: Decoration.replace({
					widget: new CommentWidget('close', id),
					inclusive: false,
				}),
				from: positions.closeTag.start,
				to: positions.closeTag.end,
				priority: 1000 + positions.closeTag.start,
			});

			if (!resolved && positions.content.start < positions.content.end) {
				decorations.push({
					decoration: Decoration.mark({
						class: 'cm-comment-content',
						attributes: { 'data-comment-id': id },
					}),
					from: positions.content.start,
					to: positions.content.end,
					priority: 500 + positions.content.start,
				});
			}
		}

		if (!decorations.length) return value;

		decorations.sort((a, b) => a.from - b.from || b.priority - a.priority);

		return value.update({
			add: decorations.map((item) => item.decoration.range(item.from, item.to)),
		});
	},

	provide: (field) => EditorView.decorations.from(field),
});

export function processComments(view: EditorView, comments: Comment[]): void {
	if (!view || !Array.isArray(comments)) return;

	if (comments.length === 0) {
		const currentState = view.state.field(commentState, false);

		if (currentState && currentState.size > 0) {
			view.dispatch({ effects: [clearComments.of(null)] });
		}

		return;
	}

	try {
		const effects: StateEffect<unknown>[] = [clearComments.of(null)];
		const docLength = view.state.doc.length;

		const sortedComments = Array.from(
			new Map(comments.map((comment) => [comment.id, comment])).values(),
		).sort((a, b) => a.openTagStart - b.openTagStart);

		for (const comment of sortedComments) {
			if (
				comment.openTagStart === undefined ||
				comment.openTagEnd === undefined ||
				comment.closeTagStart === undefined ||
				comment.closeTagEnd === undefined
			) {
				continue;
			}

			if (
				comment.openTagStart < 0 ||
				comment.closeTagEnd > docLength ||
				comment.openTagStart >= comment.openTagEnd ||
				comment.closeTagStart >= comment.closeTagEnd ||
				comment.openTagEnd > comment.closeTagStart
			) {
				moduleLog.warn(
					`Invalid comment positions for comment ${comment.id}, skipping`,
				);
				continue;
			}

			effects.push(
				addComment.of({
					id: comment.id,
					positions: {
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
					},
					resolved: comment.resolved,
				}),
			);
		}

		if (effects.length > 1) {
			view.dispatch({ effects });
		}
	} catch (error) {
		moduleLog.error('Error dispatching comment effects:', error);
	}
}

export function unwrapCommentById(view: EditorView, id: string): boolean {
	const ranges = view.state.field(commentRanges, false);
	const range = ranges?.find((commentRange) => commentRange.id === id);

	if (!range) return false;

	try {
		dispatchReplacement(view, unwrapCommentReplacement(view.state, range));

		return true;
	} catch (error) {
		moduleLog.error('Error unwrapping comment:', error);
		return false;
	}
}

export function deleteCommentById(view: EditorView, id: string): boolean {
	const ranges = view.state.field(commentRanges, false);
	const range = ranges?.find((commentRange) => commentRange.id === id);

	if (!range) return false;

	try {
		dispatchReplacement(view, {
			from: range.openStart,
			to: range.closeEnd,
			insert: '',
			cursorPos: range.openStart,
			removeId: id,
		});

		return true;
	} catch (error) {
		moduleLog.error('Error deleting comment:', error);
		return false;
	}
}

class CommentProcessor {
	private lastContent = '';
	private contentChangeTimeout: number | null = null;
	private lastProcessTime = 0;
	private readonly PROCESS_DEBOUNCE_DELAY = 150;

	constructor(private view: EditorView) {
		this.scheduleProcess();
	}

	scheduleProcess() {
		if (this.contentChangeTimeout !== null) {
			clearTimeout(this.contentChangeTimeout);
		}

		this.contentChangeTimeout = window.setTimeout(() => {
			this.contentChangeTimeout = null;
			this.checkContent();
		}, this.PROCESS_DEBOUNCE_DELAY);
	}

	checkContent() {
		const content = this.view.state.doc.toString();

		if (content === this.lastContent) return;

		const now = Date.now();

		if (now - this.lastProcessTime < 100) {
			this.scheduleProcess();
			return;
		}

		this.lastContent = content;
		this.lastProcessTime = now;

		document.dispatchEvent(
			new CustomEvent('codemirror-content-changed', {
				detail: { content, view: this.view },
			}),
		);
	}

	update(update: { docChanged: boolean }) {
		if (update.docChanged) {
			this.scheduleProcess();
		}
	}

	destroy() {
		if (this.contentChangeTimeout !== null) {
			clearTimeout(this.contentChangeTimeout);
			this.contentChangeTimeout = null;
		}
	}
}

export const commentSystemExtension = [
	commentRanges,
	commentState,
	atomicCommentRanges,
	commentProtectionTransactionFilter,
	commentDeletionKeymap,
	ViewPlugin.define((view) => new CommentProcessor(view)),
	...commentBubbleExtension,
];
