import {
	RangeSet,
	StateField,
	type ChangeSet,
	type Text,
	type Transaction,
} from '@codemirror/state';
import {
	Decoration,
	EditorView,
	ViewPlugin,
	WidgetType,
	type ViewUpdate,
} from '@codemirror/view';

import type { CommentResponse } from '../../../types/comments';
import type { ReviewSegment, ReviewSnapshot } from '../../../types/review';
import { stripAnnotationTagTokens } from '../../../utils/annotationTagUtils';
import {
	annotationIndex,
	tagSyntaxUntouched,
} from '../annotations/annotationIndex';
import {
	type DecorationEntry,
	hiddenTagEntries,
} from '../annotations/tagDecorations';
import { isValidTagRange, type TagRange } from '../annotations/tagRanges';
import { computeReviewSegments, readReviewBody } from './reviewSegments';

export interface ReviewChunk extends TagRange {
	user: string;
	timestamp: number;
	originalText: string;
	responses: CommentResponse[];
	resolved: boolean;
	hasNestedComments: boolean;
	ancestorIndexes: readonly number[];
}

const SEGMENT_CACHE_LIMIT = 200;
const segmentCache = new Map<string, Map<string, ReviewSegment[]>>();
let segmentCacheSize = 0;

function cachedSegments(
	originalText: string,
	currentText: string,
): ReviewSegment[] {
	if (!originalText || !currentText || originalText === currentText) {
		return computeReviewSegments(originalText, currentText);
	}

	let variants = segmentCache.get(originalText);
	const cached = variants?.get(currentText);
	if (cached) return cached;

	if (segmentCacheSize >= SEGMENT_CACHE_LIMIT) {
		segmentCache.clear();
		segmentCacheSize = 0;
		variants = undefined;
	}

	if (!variants) {
		variants = new Map();
		segmentCache.set(originalText, variants);
	}

	const segments = computeReviewSegments(originalText, currentText);
	variants.set(currentText, segments);
	segmentCacheSize++;
	return segments;
}

class DeletedTextWidget extends WidgetType {
	constructor(
		readonly text: string,
		readonly id: string,
	) {
		super();
	}

	eq(other: DeletedTextWidget): boolean {
		return this.text === other.text && this.id === other.id;
	}

	toDOM(): HTMLElement {
		const span = document.createElement('span');
		span.className = 'cm-review-deleted';
		span.dataset.reviewId = this.id;
		span.textContent = this.text;
		return span;
	}

	ignoreEvent() {
		return false;
	}
}

export function buildReviewDecorations(
	chunk: ReviewChunk,
	doc: Text,
): DecorationEntry[] {
	const positions = {
		openTag: { start: chunk.openStart, end: chunk.openEnd },
		content: { start: chunk.openEnd, end: chunk.closeStart },
		closeTag: { start: chunk.closeStart, end: chunk.closeEnd },
	};

	const entries = hiddenTagEntries(
		chunk.id,
		positions,
		'review-open-tag',
		'review-close-tag',
	);

	if (chunk.resolved) return entries;

	if (!chunk.hasNestedComments && !chunk.originalText) {
		if (chunk.openEnd < chunk.closeStart) {
			entries.push({
				decoration: Decoration.mark({
					class: 'cm-review-inserted',
					attributes: { 'data-review-id': chunk.id },
				}),
				from: chunk.openEnd,
				to: chunk.closeStart,
				priority: 500,
			});
		}
		return entries;
	}

	if (
		!chunk.hasNestedComments &&
		chunk.openEnd === chunk.closeStart &&
		chunk.originalText
	) {
		entries.push({
			decoration: Decoration.widget({
				widget: new DeletedTextWidget(chunk.originalText, chunk.id),
				side: -1,
			}),
			from: chunk.openEnd,
			to: chunk.openEnd,
			priority: 400,
		});
		return entries;
	}

	const rawBody = doc.sliceString(chunk.openEnd, chunk.closeStart);
	const body = chunk.hasNestedComments
		? readReviewBody(rawBody)
		: { text: rawBody, docOffset: (position: number) => position };

	for (const segment of cachedSegments(chunk.originalText, body.text)) {
		if (segment.type === 'equal') continue;

		if (segment.type === 'delete') {
			entries.push({
				decoration: Decoration.widget({
					widget: new DeletedTextWidget(segment.text, chunk.id),
					side: -1,
				}),
				from: chunk.openEnd + body.docOffset(segment.from),
				to: chunk.openEnd + body.docOffset(segment.from),
				priority: 400 + segment.from,
			});
			continue;
		}

		entries.push({
			decoration: Decoration.mark({
				class: 'cm-review-inserted',
				attributes: { 'data-review-id': chunk.id },
			}),
			from: chunk.openEnd + body.docOffset(segment.from),
			to: chunk.openEnd + body.docOffset(segment.to),
			priority: 500 + segment.from,
		});
	}

	return entries;
}

function entriesFor(
	chunks: readonly ReviewChunk[],
	doc: Text,
): DecorationEntry[] {
	const entries = chunks
		.filter((chunk) => isValidTagRange(chunk, doc.length))
		.flatMap((chunk) => buildReviewDecorations(chunk, doc))
		.filter(
			(entry) =>
				entry.from >= 0 && entry.from <= entry.to && entry.to <= doc.length,
		);

	entries.sort(
		(a, b) =>
			a.from - b.from ||
			a.decoration.startSide - b.decoration.startSide ||
			b.priority - a.priority,
	);
	return entries;
}

function decorationSet(
	chunks: readonly ReviewChunk[],
	doc: Text,
): RangeSet<Decoration> {
	return RangeSet.of(
		entriesFor(chunks, doc).map((entry) =>
			entry.decoration.range(entry.from, entry.to),
		),
	);
}

function reviewIndexesAtPoint(
	chunks: readonly ReviewChunk[],
	pos: number,
	bodyOnly: boolean,
): number[] {
	let low = 0;
	let high = chunks.length;
	while (low < high) {
		const mid = (low + high) >> 1;
		if (chunks[mid].openStart <= pos) low = mid + 1;
		else high = mid;
	}

	const index = low - 1;
	if (index < 0) return [];
	const candidate = chunks[index];
	const possible = [...candidate.ancestorIndexes, index];
	return possible.filter((chunkIndex) => {
		const chunk = chunks[chunkIndex];
		return bodyOnly
			? pos >= chunk.openEnd && pos <= chunk.closeStart
			: pos > chunk.openStart && pos < chunk.closeEnd;
	});
}

function decorationOwner(value: Decoration): string | undefined {
	const attributes = value.spec.attributes as
		| Record<string, string>
		| undefined;
	const marked = attributes?.['data-review-id'];
	if (marked) return marked;

	const widget = value.spec.widget as { id?: string } | undefined;
	return widget?.id;
}

function touchedReviewIds(
	chunks: readonly ReviewChunk[],
	changes: ChangeSet,
): Set<string> {
	const ids = new Set<string>();

	changes.iterChanges((fromA, toA) => {
		if (fromA === toA) {
			for (const index of reviewIndexesAtPoint(chunks, fromA, true)) {
				ids.add(chunks[index].id);
			}
			return;
		}

		for (const chunk of chunks) {
			if (fromA < chunk.closeStart && toA > chunk.openEnd) ids.add(chunk.id);
		}
	});

	return ids;
}

/**
 * Review decorations are body-sensitive, but only for the review whose body
 * changed. Mapping the existing RangeSet and rebuilding that review avoids a
 * full diff/decorations pass across every review on each keystroke.
 */
export function createReviewDecorationField(
	field: StateField<ReviewChunk[]>,
): StateField<RangeSet<Decoration>> {
	return StateField.define<RangeSet<Decoration>>({
		create(state) {
			return decorationSet(state.field(field), state.doc);
		},

		update(value, tr) {
			if (!tr.docChanged) {
				return tr.startState.field(field) === tr.state.field(field)
					? value
					: decorationSet(tr.state.field(field), tr.state.doc);
			}

			const before = tr.startState.field(field);
			const syntaxRanges =
				tr.startState.field(annotationIndex, false) ?? before;

			if (!tagSyntaxUntouched(tr, before, syntaxRanges)) {
				return decorationSet(tr.state.field(field), tr.state.doc);
			}

			let mapped = value.map(tr.changes);
			const touched = touchedReviewIds(before, tr.changes);
			if (!touched.size) return mapped;

			const after = tr.state.field(field);
			const affected = after.filter((chunk) => touched.has(chunk.id));

			if (affected.length !== touched.size) {
				return decorationSet(after, tr.state.doc);
			}

			for (const chunk of affected) {
				mapped = mapped.update({
					filterFrom: chunk.openStart,
					filterTo: chunk.closeEnd,
					filter: (_from, _to, value) => decorationOwner(value) !== chunk.id,
				});
			}

			const add = entriesFor(affected, tr.state.doc).map((entry) =>
				entry.decoration.range(entry.from, entry.to),
			);
			return add.length ? mapped.update({ add, sort: true }) : mapped;
		},

		provide: (self) => EditorView.decorations.from(self),
	});
}

function snapshotForChunk(
	chunk: ReviewChunk,
	doc: Text,
	blockTopAt: (pos: number) => number,
	geometry?: Pick<ReviewSnapshot, 'line' | 'docTop'>,
): ReviewSnapshot {
	const rawBody = doc.sliceString(chunk.openEnd, chunk.closeStart);
	const currentText = chunk.hasNestedComments
		? stripAnnotationTagTokens(readReviewBody(rawBody).text, ['comment'])
		: rawBody;

	return {
		id: chunk.id,
		user: chunk.user,
		timestamp: chunk.timestamp,
		originalText: chunk.originalText,
		currentText,
		responses: chunk.responses,
		resolved: chunk.resolved,
		line: geometry?.line ?? doc.lineAt(chunk.openStart).number,
		docTop: geometry?.docTop ?? blockTopAt(chunk.openStart),
	};
}

export function reviewSnapshots(
	chunks: readonly ReviewChunk[],
	doc: Text,
	blockTopAt: (pos: number) => number,
): ReviewSnapshot[] {
	return chunks.map((chunk) => snapshotForChunk(chunk, doc, blockTopAt));
}

function sameReviewMetadata(a: ReviewChunk, b: ReviewChunk): boolean {
	return (
		a.id === b.id &&
		a.user === b.user &&
		a.timestamp === b.timestamp &&
		a.originalText === b.originalText &&
		a.responses === b.responses &&
		a.resolved === b.resolved &&
		a.hasNestedComments === b.hasNestedComments &&
		a.ancestorIndexes === b.ancestorIndexes
	);
}

function markTouchedSnapshots(
	chunks: readonly ReviewChunk[],
	changes: ChangeSet,
	dirty: Set<string>,
) {
	changes.iterChanges((fromA, toA) => {
		if (fromA === toA) {
			for (const index of reviewIndexesAtPoint(chunks, fromA, false)) {
				dirty.add(chunks[index].id);
			}
			return;
		}

		for (const chunk of chunks) {
			if (fromA < chunk.closeEnd && toA > chunk.openStart) dirty.add(chunk.id);
		}
	});
}

function lineStructureChanged(update: ViewUpdate): boolean {
	let changed = false;
	update.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
		if (changed) return;
		changed =
			inserted.lines > 1 ||
			(toA > fromA &&
				update.startState.doc.sliceString(fromA, toA).includes('\n'));
	});
	return changed;
}

function reviewSyntaxUntouched(
	update: ViewUpdate,
	field: StateField<ReviewChunk[]>,
): boolean {
	return update.transactions.every((tr) => {
		if (!tr.docChanged) return true;
		const ranges = tr.startState.field(field, false) ?? [];
		const syntaxRanges = tr.startState.field(annotationIndex, false) ?? ranges;
		return tagSyntaxUntouched(tr, ranges, syntaxRanges);
	});
}

export function createReviewReporter(field: StateField<ReviewChunk[]>) {
	return ViewPlugin.define((view) => {
		let frame: number | null = null;
		let active = true;
		let requested = true;
		let forceFull = true;
		let geometryDirty = true;
		let panelSyncDirty = true;
		let lastChunks: readonly ReviewChunk[] | null = null;
		let lastReviews: ReviewSnapshot[] = [];
		const dirty = new Set<string>();

		const report = () => {
			frame = null;
			requested = false;

			const chunks = view.state.field(field, false);
			if (!chunks) return;

			const blockTopAt = (pos: number) => view.lineBlockAt(pos).top;
			let reviews: ReviewSnapshot[];
			let reviewsChanged = false;

			if (
				forceFull ||
				!lastChunks ||
				lastChunks.length !== chunks.length ||
				lastReviews.length !== chunks.length
			) {
				reviews = reviewSnapshots(chunks, view.state.doc, blockTopAt);
				reviewsChanged = true;
			} else {
				reviews = chunks.map((chunk, index) => {
					const previous = lastReviews[index];
					if (!previous || dirty.has(chunk.id)) {
						reviewsChanged = true;
						return snapshotForChunk(
							chunk,
							view.state.doc,
							blockTopAt,
							!geometryDirty && previous
								? { line: previous.line, docTop: previous.docTop }
								: undefined,
						);
					}
					if (!geometryDirty) return previous;

					const line = view.state.doc.lineAt(chunk.openStart).number;
					const docTop = blockTopAt(chunk.openStart);
					if (previous.line === line && previous.docTop === docTop) {
						return previous;
					}
					reviewsChanged = true;
					return { ...previous, line, docTop };
				});
			}

			const layoutChanged = panelSyncDirty;
			lastChunks = chunks;
			lastReviews = reviews;
			dirty.clear();
			forceFull = false;
			geometryDirty = false;
			panelSyncDirty = false;

			const detail: {
				reviews: ReviewSnapshot[];
				reviewsChanged: boolean;
				layoutChanged: boolean;
				documentTop?: number;
				documentHeight?: number;
				view: EditorView;
			} = { reviews, reviewsChanged, layoutChanged, view };
			if (layoutChanged) {
				detail.documentTop = view.documentTop;
				detail.documentHeight = view.contentHeight;
			}

			document.dispatchEvent(new CustomEvent('reviews-changed', { detail }));
		};

		const schedule = () => {
			if ((!active && !requested) || frame !== null) return;
			frame = requestAnimationFrame(report);
		};

		const updateDirtyState = (update: ViewUpdate): boolean => {
			if (!update.docChanged) return false;

			const before = update.startState.field(field, false) ?? [];
			const after = update.state.field(field, false) ?? [];
			geometryDirty ||= update.heightChanged || lineStructureChanged(update);

			if (reviewSyntaxUntouched(update, field)) {
				markTouchedSnapshots(before, update.changes, dirty);
				return false;
			}

			if (
				before.length !== after.length ||
				before.some((chunk, index) => chunk.id !== after[index]?.id)
			) {
				forceFull = true;
				return true;
			}

			for (let index = 0; index < after.length; index++) {
				if (!sameReviewMetadata(before[index], after[index])) {
					dirty.add(after[index].id);
				}
			}
			markTouchedSnapshots(before, update.changes, dirty);
			return false;
		};

		const handleScroll = () => {
			panelSyncDirty = true;
			schedule();
		};
		const handleResize = () => {
			geometryDirty = true;
			panelSyncDirty = true;
			schedule();
		};
		const handleRequest = () => {
			requested = true;
			panelSyncDirty = true;
			schedule();
		};
		const handleReporting = (event: Event) => {
			active = !!(event as CustomEvent).detail?.active;
			if (active) {
				requested = true;
				panelSyncDirty = true;
				schedule();
			} else if (frame !== null && !requested) {
				cancelAnimationFrame(frame);
				frame = null;
			}
		};

		view.scrollDOM.addEventListener('scroll', handleScroll);
		window.addEventListener('resize', handleResize);
		document.addEventListener('request-reviews', handleRequest);
		document.addEventListener('set-review-reporting', handleReporting);
		schedule();

		return {
			update(update: ViewUpdate) {
				const structureChanged = updateDirtyState(update);
				if (update.geometryChanged) panelSyncDirty = true;
				if (active && (update.docChanged || update.geometryChanged)) {
					schedule();
				} else if (!active && structureChanged) {
					// Keep the hidden-panel count badge correct without doing per-key
					// snapshot/layout work for body-only edits.
					requested = true;
					schedule();
				}
			},
			destroy: () => {
				view.scrollDOM.removeEventListener('scroll', handleScroll);
				window.removeEventListener('resize', handleResize);
				document.removeEventListener('request-reviews', handleRequest);
				document.removeEventListener('set-review-reporting', handleReporting);
				if (frame !== null) cancelAnimationFrame(frame);
			},
		};
	});
}

export const reviewClickHandler = EditorView.domEventHandlers({
	click(event) {
		const target = (event.target as HTMLElement)?.closest(
			'.cm-review-inserted, .cm-review-deleted',
		) as HTMLElement | null;

		const reviewId = target?.dataset.reviewId;
		if (!reviewId) return false;

		document.dispatchEvent(
			new CustomEvent('scroll-to-review', { detail: { reviewId } }),
		);

		return false;
	},
});
