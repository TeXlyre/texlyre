import { RangeSet, type StateEffectType, StateField } from '@codemirror/state';
import { Decoration, EditorView } from '@codemirror/view';

export interface TagRange {
	id: string;
	openStart: number;
	openEnd: number;
	closeStart: number;
	closeEnd: number;
}

export function isValidTagRange(range: TagRange, docLength: number): boolean {
	return (
		range.openStart >= 0 &&
		range.openStart < range.openEnd &&
		range.openEnd <= range.closeStart &&
		range.closeStart < range.closeEnd &&
		range.closeEnd <= docLength
	);
}

/**
 * Annotation ranges are derived from the document itself. Re-scan on every
 * document change so decorations, atomic ranges, and parsers always agree.
 */
export function createDerivedTagRangeField<T extends TagRange>(
	scan: (doc: string) => T[],
	clear?: StateEffectType<null>,
): StateField<T[]> {
	return StateField.define<T[]>({
		create(state) {
			return scan(state.doc.toString());
		},

		update(value, tr) {
			if (tr.docChanged) return scan(tr.newDoc.toString());
			if (clear && tr.effects.some((effect) => effect.is(clear))) return [];
			return value;
		},
	});
}

export function createAtomicTagRanges(field: StateField<TagRange[]>) {
	return EditorView.atomicRanges.of((view) => {
		const ranges = view.state.field(field, false);
		if (!ranges?.length) return RangeSet.empty;

		return RangeSet.of(
			ranges
				.filter((range) => isValidTagRange(range, view.state.doc.length))
				.flatMap((range) => [
					Decoration.mark({}).range(range.openStart, range.openEnd),
					Decoration.mark({}).range(range.closeStart, range.closeEnd),
				]),
			true,
		);
	});
}
