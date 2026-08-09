import { RangeSet, StateField } from '@codemirror/state';
import { Decoration, EditorView } from '@codemirror/view';

import {
	annotationIndex,
	annotationText,
	reconcileTagRanges,
	tagSyntaxUntouched,
} from './annotationIndex';

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

/** Annotation ranges are derived once, then mapped until syntax actually changes. */
export function createDerivedTagRangeField<T extends TagRange>(
	scan: (doc: string) => T[],
): StateField<T[]> {
	return StateField.define<T[]>({
		create: (state) => scan(annotationText(state.doc)),
		update: (value, tr) => {
			if (!tr.docChanged) return value;

			const syntaxRanges = tr.startState.field(annotationIndex, false) ?? value;
			return (
				reconcileTagRanges(value, tr, syntaxRanges) ??
				scan(annotationText(tr.newDoc))
			);
		},
	});
}

const atomicDecoration = Decoration.mark({});

function atomicSet(
	ranges: readonly TagRange[],
	docLength: number,
): RangeSet<Decoration> {
	return RangeSet.of(
		ranges
			.filter((range) => isValidTagRange(range, docLength))
			.flatMap((range) => [
				atomicDecoration.range(range.openStart, range.openEnd),
				atomicDecoration.range(range.closeStart, range.closeEnd),
			]),
		true,
	);
}

/** Cache atomic tag ranges instead of rebuilding them on every view query. */
export function createAtomicTagRanges(field: StateField<TagRange[]>) {
	const atomicField = StateField.define<RangeSet<Decoration>>({
		create(state) {
			return atomicSet(state.field(field), state.doc.length);
		},

		update(value, tr) {
			if (!tr.docChanged) {
				return tr.startState.field(field) === tr.state.field(field)
					? value
					: atomicSet(tr.state.field(field), tr.state.doc.length);
			}

			const before = tr.startState.field(field);
			const syntaxRanges =
				tr.startState.field(annotationIndex, false) ?? before;
			return tagSyntaxUntouched(tr, before, syntaxRanges)
				? value.map(tr.changes)
				: atomicSet(tr.state.field(field), tr.state.doc.length);
		},
	});

	return [
		atomicField,
		EditorView.atomicRanges.of((view) => view.state.field(atomicField)),
	];
}
