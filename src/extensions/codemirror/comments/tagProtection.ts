// src/extensions/codemirror/comments/tagProtection.ts
import {
	Annotation,
	EditorState,
	type Extension,
	type StateField,
	Transaction,
	type TransactionSpec,
} from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import type { NamedLogger } from '@/logging';
import {
	ANNOTATION_KINDS,
	type AnnotationKind,
	scanAnnotationTags,
	stripAnnotationTagTokens,
} from '../../../utils/annotationTagUtils';
import type { TagRange } from './tagRanges';

export const skipTagProtection = Annotation.define<boolean>();
export const normalizedTagProtection = Annotation.define<boolean>();

export interface SingleChange {
	from: number;
	to: number;
	insert: string;
}

export interface Replacement extends SingleChange {
	cursorPos: number;
}

interface AnnotationRange extends TagRange {
	kind: AnnotationKind;
}

interface SyntaxRange {
	from: number;
	to: number;
	open: boolean;
	owner: AnnotationRange;
}

export function isUserEdit(tr: Transaction): boolean {
	const event = tr.annotation(Transaction.userEvent);
	return !!event && (event.startsWith('input') || event.startsWith('delete'));
}

export function getChanges(tr: Transaction): SingleChange[] {
	const changes: SingleChange[] = [];
	tr.changes.iterChanges((from, to, _fromB, _toB, inserted) => {
		changes.push({ from, to, insert: inserted.toString() });
	});
	return changes;
}

const intersects = (from: number, to: number, range: SyntaxRange) =>
	from === to
		? from > range.from && from < range.to
		: from < range.to && to > range.from;

function rangesFor(state: EditorState): AnnotationRange[] {
	const text = state.doc.toString();
	return ANNOTATION_KINDS.flatMap((kind) =>
		scanAnnotationTags(text, kind).map((tag) => ({
			kind,
			id: tag.id,
			openStart: tag.openTagStart,
			openEnd: tag.openTagEnd,
			closeStart: tag.closeTagStart,
			closeEnd: tag.closeTagEnd,
		})),
	);
}

function syntaxFor(ranges: readonly AnnotationRange[]): SyntaxRange[] {
	return ranges
		.flatMap((owner) => [
			{ from: owner.openStart, to: owner.openEnd, open: true, owner },
			{ from: owner.closeStart, to: owner.closeEnd, open: false, owner },
		])
		.sort((a, b) => a.from - b.from);
}

function overlapsRange(from: number, to: number, range: AnnotationRange): boolean {
	return from < range.closeEnd && to > range.openStart;
}

function insideBody(from: number, to: number, range: AnnotationRange): boolean {
	return from >= range.openEnd && to <= range.closeStart;
}

/** Expand a selection until every intersected annotation is either wholly
 * inside it or wholly contains it. This keeps annotation intervals laminar. */
export function expandAnnotationSelection(
	state: EditorState,
	from: number,
	to: number,
): { from: number; to: number } {
	if (from >= to) return { from, to };

	const ranges = rangesFor(state);
	let start = from;
	let end = to;
	let changed = true;

	while (changed) {
		changed = false;

		for (const range of ranges) {
			if (!overlapsRange(start, end, range)) continue;

			const containsRange = start <= range.openStart && end >= range.closeEnd;
			if (containsRange || insideBody(start, end, range)) continue;

			const nextStart = Math.min(start, range.openStart);
			const nextEnd = Math.max(end, range.closeEnd);
			if (nextStart === start && nextEnd === end) continue;

			start = nextStart;
			end = nextEnd;
			changed = true;
		}
	}

	return { from: start, to: end };
}

function redirectSingleDelete(
	state: EditorState,
	change: SingleChange,
	event: string | undefined,
	syntax: readonly SyntaxRange[],
): SingleChange | null {
	if (change.insert || change.to - change.from !== 1) return null;
	const backward = event === 'delete.backward';
	const forward = event === 'delete.forward';
	if (!backward && !forward) return null;
	if (!syntax.some((range) => intersects(change.from, change.to, range))) return null;

	let pos = backward ? change.from - 1 : change.to;
	while (pos >= 0 && pos < state.doc.length) {
		const hidden = syntax.find((range) => pos >= range.from && pos < range.to);
		if (!hidden) return { from: pos, to: pos + 1, insert: '' };
		pos = backward ? hidden.from - 1 : hidden.to;
	}

	return {
		from: change.from,
		to: change.to,
		insert: state.doc.sliceString(change.from, change.to),
	};
}

function buildInsert(
	state: EditorState,
	change: SingleChange,
	from: number,
	to: number,
	protectedSyntax: readonly SyntaxRange[],
): { insert: string; cursorPos: number } {
	const anchorRange = protectedSyntax.find(
		(range) => change.from > range.from && change.from < range.to,
	);
	const anchor = anchorRange
		? anchorRange.open
			? anchorRange.to
			: anchorRange.from
		: change.from;

	const kept = [
		...(from < change.from ? [{ from, to: change.from }] : []),
		...protectedSyntax.map(({ from, to }) => ({ from, to })),
		...(change.to < to ? [{ from: change.to, to }] : []),
	].sort((a, b) => a.from - b.from || a.to - b.to);

	let insert = '';
	let cursorOffset = 0;
	let inserted = false;
	let lastTo = -1;

	const addInsert = () => {
		if (inserted) return;
		insert += change.insert;
		cursorOffset = insert.length;
		inserted = true;
	};

	for (const range of kept) {
		if (range.to <= lastTo) continue;
		const rangeFrom = Math.max(range.from, lastTo);
		if (!inserted && anchor <= rangeFrom) addInsert();
		insert += state.doc.sliceString(rangeFrom, range.to);
		lastTo = range.to;
	}
	addInsert();

	return { insert, cursorPos: from + cursorOffset };
}

/**
 * Whole comments may be removed with their selected text. Review wrappers are
 * never removed by ordinary editing. Partial annotation syntax stays atomic.
 */
export function normalizeAnnotationChange(
	state: EditorState,
	input: SingleChange,
	event?: string,
): Replacement | null {
	const ranges = rangesFor(state);
	if (!ranges.length) return null;

	const syntax = syntaxFor(ranges);
	const change = redirectSingleDelete(state, input, event, syntax) ?? input;
	const droppedComments = new Set(
		ranges
			.filter(
				(range) =>
					range.kind === 'comment' &&
					change.from < change.to &&
					change.from <= range.openStart &&
					change.to >= range.closeEnd,
			)
			.map((range) => range.id),
	);

	const protectedSyntax = syntax.filter(
		(range) =>
			(range.owner.kind === 'review' || !droppedComments.has(range.owner.id)) &&
			intersects(change.from, change.to, range),
	);
	const envelope = expandAnnotationSelection(state, change.from, change.to);

	if (
		!protectedSyntax.length &&
		envelope.from === change.from &&
		envelope.to === change.to &&
		change === input
	) {
		return null;
	}

	const from = Math.min(envelope.from, ...protectedSyntax.map((range) => range.from));
	const to = Math.max(envelope.to, ...protectedSyntax.map((range) => range.to));
	const rendered = buildInsert(state, change, from, to, protectedSyntax);

	return { from, to, insert: rendered.insert, cursorPos: rendered.cursorPos };
}

export const annotationPasteSanitizer = EditorView.domEventHandlers({
	paste(event, view) {
		const text = event.clipboardData?.getData('text/plain');
		if (!text) return false;
		const cleaned = stripAnnotationTagTokens(text);
		if (cleaned === text) return false;

		event.preventDefault();
		view.dispatch({ ...view.state.replaceSelection(cleaned), userEvent: 'input.paste' });
		return true;
	},
});

export function createTagActions<T extends TagRange>(
	field: StateField<T[]>,
	log: NamedLogger,
) {
	const find = (view: EditorView, id: string) =>
		view.state.field(field, false)?.find((range) => range.id === id) ?? null;

	const replace = (view: EditorView, replacement: Replacement) => {
		view.dispatch({
			changes: replacement,
			selection: { anchor: replacement.cursorPos },
			annotations: skipTagProtection.of(true),
		});
	};

	return {
		unwrapById(view: EditorView, id: string) {
			const range = find(view, id);
			if (!range) return false;
			try {
				replace(view, {
					from: range.openStart,
					to: range.closeEnd,
					insert: view.state.doc.sliceString(range.openEnd, range.closeStart),
					cursorPos: range.openStart,
				});
				return true;
			} catch (error) {
				log.error('Error unwrapping tagged chunk:', error);
				return false;
			}
		},

		replaceById(view: EditorView, id: string, insert: string) {
			const range = find(view, id);
			if (!range) return false;
			try {
				replace(view, {
					from: range.openStart,
					to: range.closeEnd,
					insert,
					cursorPos: range.openStart + insert.length,
				});
				return true;
			} catch (error) {
				log.error('Error replacing tagged chunk:', error);
				return false;
			}
		},
	};
}

export function createTagProtection(): Extension {
	const filter = EditorState.transactionFilter.of((tr) => {
		if (
			!tr.docChanged ||
			tr.annotation(skipTagProtection) ||
			tr.annotation(normalizedTagProtection) ||
			!isUserEdit(tr)
		) {
			return tr;
		}

		const event = tr.annotation(Transaction.userEvent);
		const original = getChanges(tr);
		const normalized = original.map(
			(change) =>
				normalizeAnnotationChange(tr.startState, change, event) ?? {
					...change,
					cursorPos: change.from + change.insert.length,
				},
		);

		if (
			!normalized.some(
				(change, index) =>
					change.from !== original[index].from ||
					change.to !== original[index].to ||
					change.insert !== original[index].insert,
			)
		) {
			return tr;
		}

		for (let i = 1; i < normalized.length; i++) {
			if (normalized[i].from < normalized[i - 1].to) return [];
		}

		const spec: TransactionSpec = {
			changes: normalized.map(({ from, to, insert }) => ({ from, to, insert })),
			effects: tr.effects,
			annotations: normalizedTagProtection.of(true),
			userEvent: event,
			scrollIntoView: tr.scrollIntoView,
		};
		if (normalized.length === 1) spec.selection = { anchor: normalized[0].cursorPos };
		return spec;
	});

	return [filter, annotationPasteSanitizer];
}
