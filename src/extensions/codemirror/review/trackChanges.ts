// src/extensions/codemirror/review/trackChanges.ts
import {
	EditorState,
	type Extension,
	type StateField,
	Transaction,
	type TransactionSpec,
} from '@codemirror/state';

import {
	ANNOTATION_KINDS,
	containsAnnotationMarker,
	stripAnnotationTagTokens,
} from '../../../utils/annotationTagUtils';
import { reviewService } from '../../../services/ReviewService';
import {
	type SingleChange,
	getChanges,
	isUserEdit,
	normalizeAnnotationChange,
	normalizedTagProtection,
	skipTagProtection,
} from '../annotations/tagProtection';
import type { ReviewChunk } from './reviewDecorations';

export interface ReviewConfig {
	tracking: boolean;
	author: string;
}

interface TextPiece {
	docFrom: number;
	docTo: number;
	currentFrom: number;
	original: string;
	current: string;
}

interface EditChange extends SingleChange {
	cursorOffset: number;
	userInserted: boolean;
}

interface TrackChangesDeps {
	reviewChunks: StateField<ReviewChunk[]>;
	config: StateField<ReviewConfig>;
}

const visibleText = (text: string) =>
	stripAnnotationTagTokens(text, ['comment']);

function stripReviewSyntax(change: EditChange): EditChange {
	const beforeCursor = change.insert.slice(0, change.cursorOffset);
	return {
		...change,
		insert: stripAnnotationTagTokens(change.insert, ['review']),
		cursorOffset: stripAnnotationTagTokens(beforeCursor, ['review']).length,
	};
}

function collectChunks(
	change: SingleChange,
	chunks: readonly ReviewChunk[],
	author: string,
): ReviewChunk[] {
	return chunks
		.filter((chunk) =>
			chunk.openStart < change.to && chunk.closeEnd > change.from
				? true
				: (chunk.closeEnd === change.from || chunk.openStart === change.to) &&
					chunk.user === author &&
					!chunk.resolved,
		)
		.sort((a, b) => a.openStart - b.openStart);
}

function buildPieces(
	state: EditorState,
	from: number,
	to: number,
	chunks: readonly ReviewChunk[],
): TextPiece[] {
	const pieces: TextPiece[] = [];
	let pos = from;
	let currentFrom = 0;
	const push = (
		docFrom: number,
		docTo: number,
		original: string,
		current: string,
	) => {
		pieces.push({ docFrom, docTo, currentFrom, original, current });
		currentFrom += current.length;
	};

	for (const chunk of chunks) {
		if (chunk.openStart > pos) {
			const plain = state.doc.sliceString(pos, chunk.openStart);
			push(pos, chunk.openStart, plain, plain);
		}
		push(
			chunk.openEnd,
			chunk.closeStart,
			chunk.originalText,
			state.doc.sliceString(chunk.openEnd, chunk.closeStart),
		);
		pos = chunk.closeEnd;
	}
	if (pos < to) {
		const plain = state.doc.sliceString(pos, to);
		push(pos, to, plain, plain);
	}
	return pieces;
}

function mapToCurrent(pieces: readonly TextPiece[], pos: number): number {
	let mapped = 0;
	for (const piece of pieces) {
		if (pos >= piece.docTo) {
			mapped = piece.currentFrom + piece.current.length;
			continue;
		}
		if (pos >= piece.docFrom) return piece.currentFrom + (pos - piece.docFrom);
		break;
	}
	return mapped;
}

function trackChange(
	state: EditorState,
	input: EditChange,
	chunks: readonly ReviewChunk[],
	config: ReviewConfig,
	forward: boolean,
): { change: SingleChange; cursorPos: number } | null {
	const change = stripReviewSyntax(input);
	const containing = chunks.find(
		(chunk) => chunk.openEnd <= change.from && change.to <= chunk.closeStart,
	);

	if (containing) {
		const body = state.doc.sliceString(
			containing.openEnd,
			containing.closeStart,
		);
		const offset = change.from - containing.openEnd;
		const nextBody =
			body.slice(0, offset) +
			change.insert +
			body.slice(change.to - containing.openEnd);

		if (visibleText(nextBody) !== containing.originalText) return null;
		return {
			change: {
				from: containing.openStart,
				to: containing.closeEnd,
				insert: nextBody,
			},
			cursorPos: containing.openStart + offset + change.cursorOffset,
		};
	}

	const covered = collectChunks(change, chunks, config.author);
	const from = Math.min(
		change.from,
		...covered.map((chunk) => chunk.openStart),
	);
	const to = Math.max(change.to, ...covered.map((chunk) => chunk.closeEnd));
	const pieces = buildPieces(state, from, to, covered);
	const originalText = visibleText(
		pieces.map((piece) => piece.original).join(''),
	);
	const currentText = pieces.map((piece) => piece.current).join('');
	const insertAt = mapToCurrent(pieces, change.from);
	const insertEnd = mapToCurrent(pieces, change.to);
	const nextText =
		currentText.slice(0, insertAt) +
		change.insert +
		currentText.slice(insertEnd);

	if (nextText === currentText) return null;
	if (visibleText(nextText) === originalText) {
		return {
			change: { from, to, insert: nextText },
			cursorPos: from + insertAt + change.cursorOffset,
		};
	}

	const existing =
		covered.length === 1 &&
		covered[0].user === config.author &&
		!covered[0].resolved
			? covered[0]
			: undefined;
	const raw = reviewService.createReview(originalText, config.author, existing);
	const insert = `${raw.openTag}${nextText}${raw.closeTag}`;
	return {
		change: { from, to, insert },
		cursorPos: change.userInserted
			? from + raw.openTag.length + insertAt + change.cursorOffset
			: forward
				? from + insert.length
				: from,
	};
}

export function createTrackChangesFilter(deps: TrackChangesDeps): Extension {
	return EditorState.transactionFilter.of((tr) => {
		if (!tr.docChanged || tr.annotation(skipTagProtection) || !isUserEdit(tr))
			return tr;

		const config = tr.startState.field(deps.config, false);
		if (!config?.tracking || !config.author) return tr;

		const event = tr.annotation(Transaction.userEvent);
		const forward = event === 'delete.forward';
		const alreadyNormalized = !!tr.annotation(normalizedTagProtection);
		const chunks = tr.startState.field(deps.reviewChunks, false) ?? [];
		const original = getChanges(tr);
		const tracked: SingleChange[] = [];
		let cursorPos: number | null = null;
		let modified = false;
		let lastEnd = -1;

		for (const raw of original) {
			if (
				!alreadyNormalized &&
				ANNOTATION_KINDS.some((kind) =>
					containsAnnotationMarker(raw.insert, kind),
				)
			) {
				tracked.push(raw);
				continue;
			}

			const normalized = alreadyNormalized
				? null
				: normalizeAnnotationChange(tr.startState, raw, event);
			const change: EditChange = {
				from: normalized?.from ?? raw.from,
				to: normalized?.to ?? raw.to,
				insert: normalized?.insert ?? raw.insert,
				cursorOffset: normalized
					? normalized.cursorPos - normalized.from
					: raw.insert.length,
				userInserted: !!event?.startsWith('input') && raw.insert.length > 0,
			};
			const result = trackChange(
				tr.startState,
				change,
				chunks,
				config,
				forward,
			);
			const next = result?.change ?? change;
			if (next.from < lastEnd) return tr;

			tracked.push({ from: next.from, to: next.to, insert: next.insert });
			lastEnd = next.to;
			cursorPos = result?.cursorPos ?? cursorPos;
			modified ||=
				!!result ||
				change.from !== raw.from ||
				change.to !== raw.to ||
				change.insert !== raw.insert;
		}

		if (!modified) return tr;
		const spec: TransactionSpec = {
			changes: tracked,
			effects: tr.effects,
			annotations: skipTagProtection.of(true),
			userEvent: event,
			scrollIntoView: tr.scrollIntoView,
		};
		if (cursorPos !== null && original.length === 1)
			spec.selection = { anchor: cursorPos };
		return spec;
	});
}
