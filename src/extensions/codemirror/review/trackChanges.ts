// src/extensions/codemirror/review/trackChanges.ts
import {
	EditorState,
	type Extension,
	type StateField,
	type TransactionSpec,
} from '@codemirror/state';

import { containsAnnotationMarker } from '../../../utils/annotationTagUtils';
import { reviewService } from '../../../services/ReviewService';
import {
	type SingleChange,
	getChanges,
	isUserEdit,
	skipTagProtection,
} from '../comments/tagProtection';
import { type TagRange, touchesTags } from '../comments/tagRanges';
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

interface TrackChangesDeps {
	reviewChunks: StateField<ReviewChunk[]>;
	commentRanges: StateField<TagRange[]>;
	config: StateField<ReviewConfig>;
}

function collectChunks(
	change: SingleChange,
	chunks: readonly ReviewChunk[],
	author: string,
): ReviewChunk[] {
	return chunks
		.filter((chunk) => {
			if (chunk.openStart < change.to && chunk.closeEnd > change.from) {
				return true;
			}

			const adjacent =
				chunk.closeEnd === change.from || chunk.openStart === change.to;

			return adjacent && chunk.user === author;
		})
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
	let currentPos = 0;

	const push = (
		docFrom: number,
		docTo: number,
		original: string,
		current: string,
	) => {
		pieces.push({ docFrom, docTo, currentFrom: currentPos, original, current });
		currentPos += current.length;
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

		if (pos >= piece.docFrom) {
			return piece.currentFrom + (pos - piece.docFrom);
		}

		break;
	}

	return mapped;
}

function trackChange(
	state: EditorState,
	change: SingleChange,
	deps: TrackChangesDeps,
	config: ReviewConfig,
): { change: SingleChange; cursorPos: number } | null {
	const chunks = state.field(deps.reviewChunks, false) ?? [];
	const commentRanges = state.field(deps.commentRanges, false) ?? [];

	if (touchesTags(change.from, change.to, commentRanges)) return null;

	if (
		containsAnnotationMarker(
			state.doc.sliceString(change.from, change.to),
			'comment',
		)
	) {
		return null;
	}

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

		if (nextBody !== containing.originalText) return null;

		return {
			change: {
				from: containing.openStart,
				to: containing.closeEnd,
				insert: nextBody,
			},
			cursorPos: containing.openStart + offset + change.insert.length,
		};
	}

	const covered = collectChunks(change, chunks, config.author);
	const from = Math.min(
		change.from,
		...covered.map((chunk) => chunk.openStart),
	);
	const to = Math.max(change.to, ...covered.map((chunk) => chunk.closeEnd));

	const pieces = buildPieces(state, from, to, covered);
	const originalText = pieces.map((piece) => piece.original).join('');
	const currentText = pieces.map((piece) => piece.current).join('');

	const insertAt = mapToCurrent(pieces, change.from);
	const insertEnd = mapToCurrent(pieces, change.to);
	const nextText =
		currentText.slice(0, insertAt) +
		change.insert +
		currentText.slice(insertEnd);

	if (nextText === currentText) return null;

	if (nextText === originalText) {
		return {
			change: { from, to, insert: nextText },
			cursorPos: from + insertAt + change.insert.length,
		};
	}

	const owned =
		covered.length === 1 && covered[0].user === config.author
			? covered[0]
			: null;

	const raw = reviewService.createReview(
		originalText,
		config.author,
		owned ?? undefined,
	);

	return {
		change: {
			from,
			to,
			insert: `${raw.openTag}${nextText}${raw.closeTag}`,
		},
		cursorPos: from + raw.openTag.length + insertAt + change.insert.length,
	};
}

export function createTrackChangesFilter(deps: TrackChangesDeps): Extension {
	return EditorState.transactionFilter.of((tr) => {
		if (!tr.docChanged || tr.annotation(skipTagProtection) || !isUserEdit(tr)) {
			return tr;
		}

		const config = tr.startState.field(deps.config, false);
		if (!config?.tracking || !config.author) return tr;

		const changes = getChanges(tr);
		const tracked: SingleChange[] = [];
		let cursorPos: number | null = null;
		let modified = false;
		let lastEnd = -1;

		for (const change of changes) {
			const result = trackChange(tr.startState, change, deps, config);

			if (!result) {
				tracked.push(change);
				lastEnd = Math.max(lastEnd, change.to);
				continue;
			}

			if (result.change.from < lastEnd) return tr;

			tracked.push(result.change);
			cursorPos = result.cursorPos;
			lastEnd = result.change.to;
			modified = true;
		}

		if (!modified) return tr;

		const spec: TransactionSpec = {
			changes: tracked,
			annotations: skipTagProtection.of(true),
		};

		if (cursorPos !== null && changes.length === 1) {
			spec.selection = { anchor: cursorPos, head: cursorPos };
		}

		return spec;
	});
}
