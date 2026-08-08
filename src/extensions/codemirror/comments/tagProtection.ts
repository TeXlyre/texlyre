// src/extensions/codemirror/comments/tagProtection.ts
import {
	Annotation,
	EditorState,
	type Extension,
	Prec,
	type StateEffect,
	type StateField,
	Transaction,
	type TransactionSpec,
} from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';

import type { NamedLogger } from '@/logging';
import { stripAnnotationTagTokens } from '../../../utils/annotationTagUtils';
import {
	type TagEffects,
	type TagPayload,
	type TagRange,
	intersects,
	touchesTags,
} from './tagRanges';

export const skipTagProtection = Annotation.define<boolean>();

export interface SingleChange {
	from: number;
	to: number;
	insert: string;
}

export interface Replacement {
	from: number;
	to: number;
	insert: string;
	cursorPos: number;
	removeId?: string;
	removeIds?: string[];
}

export function isUserEdit(tr: Transaction): boolean {
	const userEvent = tr.annotation(Transaction.userEvent);

	return (
		!!userEvent &&
		(userEvent.startsWith('input') || userEvent.startsWith('delete'))
	);
}

export function getChanges(tr: Transaction): SingleChange[] {
	const changes: SingleChange[] = [];

	tr.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
		changes.push({
			from: fromA,
			to: toA,
			insert: inserted.toString(),
		});
	});

	return changes;
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

export function unwrapTagReplacement(
	state: EditorState,
	range: TagRange,
): Replacement {
	return {
		from: range.openStart,
		to: range.closeEnd,
		insert: state.doc.sliceString(range.openEnd, range.closeStart),
		cursorPos: range.openStart,
		removeId: range.id,
	};
}

function getBoundaryDeletion(
	tr: Transaction,
	change: SingleChange,
	ranges: readonly TagRange[],
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
			return unwrapTagReplacement(tr.startState, range);
		}
	}

	return null;
}

function getProtectedCursorMove(
	tr: Transaction,
	change: SingleChange,
	ranges: readonly TagRange[],
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
	ranges: readonly TagRange[],
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

export interface TagProtection {
	extension: Extension;
	dispatchReplacement: (view: EditorView, replacement: Replacement) => void;
	unwrapById: (view: EditorView, id: string) => boolean;
	replaceById: (view: EditorView, id: string, insert: string) => boolean;
}

export const annotationPasteSanitizer = EditorView.domEventHandlers({
	paste(event, view) {
		const text = event.clipboardData?.getData('text/plain');
		if (!text) return false;

		const cleaned = stripAnnotationTagTokens(text);
		if (cleaned === text) return false;

		event.preventDefault();
		view.dispatch({
			...view.state.replaceSelection(cleaned),
			userEvent: 'input.paste',
		});

		return true;
	},
});

export function createTagProtection<P extends TagPayload>(
	field: StateField<TagRange[]>,
	effects: TagEffects<P> | null,
	log: NamedLogger,
	options: { boundaryUnwrap?: boolean } = {},
): TagProtection {
	const { boundaryUnwrap = true } = options;
	const removeEffects = (replacement: Replacement): StateEffect<unknown>[] => {
		const ids =
			replacement.removeIds ??
			(replacement.removeId ? [replacement.removeId] : []);

		if (!effects) return [];

		return [...new Set(ids)].map((id) => effects.remove.of(id));
	};

	const buildProtectedSpec = (
		state: EditorState,
		changes: SingleChange[],
		ranges: readonly TagRange[],
	): TransactionSpec => {
		const protectedChanges: SingleChange[] = [];
		const specEffects: StateEffect<unknown>[] = [];

		for (const change of changes) {
			const replacement = buildProtectedReplacement(state, change, ranges);

			if (!replacement) {
				protectedChanges.push(change);
				continue;
			}

			protectedChanges.push({
				from: replacement.from,
				to: replacement.to,
				insert: replacement.insert,
			});
			specEffects.push(...removeEffects(replacement));
		}

		return {
			changes: protectedChanges,
			effects: specEffects,
			annotations: skipTagProtection.of(true),
		};
	};

	const dispatchReplacement = (
		view: EditorView,
		replacement: Replacement,
	): void => {
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
			effects: removeEffects(replacement),
			annotations: skipTagProtection.of(true),
		});
	};

	const transactionFilter = EditorState.transactionFilter.of((tr) => {
		if (!tr.docChanged || tr.annotation(skipTagProtection) || !isUserEdit(tr)) {
			return tr;
		}

		const ranges = tr.startState.field(field, false);
		if (!ranges?.length) return tr;

		const changes = getChanges(tr);
		if (!changes.some((entry) => touchesTags(entry.from, entry.to, ranges))) {
			return tr;
		}

		if (changes.length > 1) {
			return buildProtectedSpec(tr.startState, changes, ranges);
		}

		const change = changes[0];

		const boundaryDeletion = boundaryUnwrap
			? getBoundaryDeletion(tr, change, ranges)
			: null;

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
				effects: removeEffects(boundaryDeletion),
				annotations: skipTagProtection.of(true),
			};
		}

		const cursorMove = getProtectedCursorMove(tr, change, ranges);
		if (cursorMove !== null) {
			return {
				selection: {
					anchor: cursorMove,
					head: cursorMove,
				},
				annotations: skipTagProtection.of(true),
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
				annotations: skipTagProtection.of(true),
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
			effects: removeEffects(replacement),
			annotations: skipTagProtection.of(true),
		};
	});

	const getBoundaryTag = (
		view: EditorView,
		direction: 'forward' | 'backward',
	): TagRange | null => {
		const selection = view.state.selection.main;
		if (!selection.empty) return null;

		const ranges = view.state.field(field, false);
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
	};

	const deleteWholeTagIfBoundary = (
		view: EditorView,
		direction: 'forward' | 'backward',
	): boolean => {
		const range = getBoundaryTag(view, direction);
		if (!range) return false;

		try {
			dispatchReplacement(view, unwrapTagReplacement(view.state, range));
			return true;
		} catch (error) {
			log.error('Error deleting tagged chunk:', error);
			return false;
		}
	};

	const deletionKeymap = Prec.highest(
		keymap.of([
			{
				key: 'Backspace',
				run: (view) => deleteWholeTagIfBoundary(view, 'backward'),
			},
			{
				key: 'Delete',
				run: (view) => deleteWholeTagIfBoundary(view, 'forward'),
			},
		]),
	);

	const findRange = (view: EditorView, id: string) =>
		view.state.field(field, false)?.find((range) => range.id === id) ?? null;

	return {
		extension: boundaryUnwrap
			? [transactionFilter, deletionKeymap]
			: [transactionFilter],
		dispatchReplacement,

		unwrapById(view, id) {
			const range = findRange(view, id);
			if (!range) return false;

			try {
				dispatchReplacement(view, unwrapTagReplacement(view.state, range));
				return true;
			} catch (error) {
				log.error('Error unwrapping tagged chunk:', error);
				return false;
			}
		},

		replaceById(view, id, insert) {
			const range = findRange(view, id);
			if (!range) return false;

			try {
				dispatchReplacement(view, {
					from: range.openStart,
					to: range.closeEnd,
					insert,
					cursorPos: range.openStart + insert.length,
					removeId: id,
				});
				return true;
			} catch (error) {
				log.error('Error replacing tagged chunk:', error);
				return false;
			}
		},
	};
}
