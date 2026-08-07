// src/extensions/codemirror/comments/tagRanges.ts
import {
	RangeSet,
	StateEffect,
	type StateEffectType,
	StateField,
	type Transaction,
} from '@codemirror/state';
import { Decoration, EditorView } from '@codemirror/view';

export interface TagPositions {
	openTag: { start: number; end: number };
	content: { start: number; end: number };
	closeTag: { start: number; end: number };
}

export interface TagPayload {
	id: string;
	positions: TagPositions;
}

export interface TagRange {
	id: string;
	openStart: number;
	openEnd: number;
	closeStart: number;
	closeEnd: number;
}

export interface TagEffects<P extends TagPayload> {
	add: StateEffectType<P>;
	remove: StateEffectType<string>;
	clear: StateEffectType<null>;
}

export function createTagEffects<P extends TagPayload>(): TagEffects<P> {
	return {
		add: StateEffect.define<P>(),
		remove: StateEffect.define<string>(),
		clear: StateEffect.define<null>(),
	};
}

export function isValidTagPositions(positions: TagPositions): boolean {
	return (
		positions.openTag.start < positions.openTag.end &&
		positions.closeTag.start < positions.closeTag.end &&
		positions.openTag.end <= positions.closeTag.start
	);
}

export function createTagRangeField<P extends TagPayload>(
	effects: TagEffects<P>,
	onInvalid?: (id: string) => void,
): StateField<TagRange[]> {
	return StateField.define<TagRange[]>({
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
				if (effect.is(effects.clear)) {
					nextRanges = [];
					break;
				}

				if (effect.is(effects.remove)) {
					nextRanges = nextRanges.filter((range) => range.id !== effect.value);
				}
			}

			for (const effect of tr.effects) {
				if (!effect.is(effects.add)) continue;

				const { id, positions } = effect.value;

				if (isValidTagPositions(positions)) {
					nextRanges = nextRanges.filter((range) => range.id !== id);

					nextRanges.push({
						id,
						openStart: positions.openTag.start,
						openEnd: positions.openTag.end,
						closeStart: positions.closeTag.start,
						closeEnd: positions.closeTag.end,
					});
				} else {
					onInvalid?.(id);
				}
			}

			nextRanges.sort((a, b) => a.openStart - b.openStart);
			return nextRanges;
		},
	});
}

export function changeTouchesTagSyntax(tr: Transaction): boolean {
	let touches = false;

	tr.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
		if (touches) return;

		if (
			inserted.toString().includes('###') ||
			tr.startState.doc.sliceString(fromA, toA).includes('###')
		) {
			touches = true;
		}
	});

	return touches;
}

export function createDerivedTagRangeField<T extends TagRange>(
	scan: (doc: string) => T[],
): StateField<T[]> {
	return StateField.define<T[]>({
		create(state) {
			return scan(state.doc.toString());
		},

		update(value, tr) {
			if (!tr.docChanged) return value;

			if (changeTouchesTagSyntax(tr)) {
				return scan(tr.newDoc.toString());
			}

			return value.map((range) => ({
				...range,
				openStart: tr.changes.mapPos(range.openStart, -1),
				openEnd: tr.changes.mapPos(range.openEnd, -1),
				closeStart: tr.changes.mapPos(range.closeStart, 1),
				closeEnd: tr.changes.mapPos(range.closeEnd, 1),
			}));
		},
	});
}

export function createAtomicTagRanges(field: StateField<TagRange[]>) {
	return EditorView.atomicRanges.of((view) => {
		const ranges = view.state.field(field, false);
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
}

export function intersects(
	from: number,
	to: number,
	rangeFrom: number,
	rangeTo: number,
): boolean {
	return from < rangeTo && to > rangeFrom;
}

export function touchesTags(
	from: number,
	to: number,
	ranges: readonly TagRange[],
): boolean {
	return ranges.some(
		(range) =>
			intersects(from, to, range.openStart, range.openEnd) ||
			intersects(from, to, range.closeStart, range.closeEnd),
	);
}
