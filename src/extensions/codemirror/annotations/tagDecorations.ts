import { RangeSet, StateField, type Text } from '@codemirror/state';
import { Decoration, EditorView, WidgetType } from '@codemirror/view';

import { isValidTagRange, type TagRange } from './tagRanges';

export interface DecorationEntry {
	decoration: Decoration;
	from: number;
	to: number;
	priority: number;
}

/**
 * Replacement tags need a measurable inline anchor. An empty widget can leave
 * a line with no client rects, which older CodeMirror views can crash on while
 * resolving hover/mouse coordinates.
 */
class HiddenTagWidget extends WidgetType {
	constructor(
		readonly className: string,
		readonly id: string,
	) {
		super();
	}

	eq(other: HiddenTagWidget): boolean {
		return this.className === other.className && this.id === other.id;
	}

	toDOM(): HTMLElement {
		const span = document.createElement('span');
		span.className = this.className;
		span.dataset.tagId = this.id;
		span.setAttribute('aria-hidden', 'true');
		span.textContent = '\u200b';
		return span;
	}

	ignoreEvent() {
		return true;
	}
}

export function hiddenTagEntries(
	id: string,
	positions: {
		openTag: { start: number; end: number };
		closeTag: { start: number; end: number };
	},
	openClass: string,
	closeClass: string,
): DecorationEntry[] {
	return [
		{
			decoration: Decoration.replace({
				widget: new HiddenTagWidget(openClass, id),
				inclusive: false,
			}),
			from: positions.openTag.start,
			to: positions.openTag.end,
			priority: 1000 + positions.openTag.start,
		},
		{
			decoration: Decoration.replace({
				widget: new HiddenTagWidget(closeClass, id),
				inclusive: false,
			}),
			from: positions.closeTag.start,
			to: positions.closeTag.end,
			priority: 1000 + positions.closeTag.start,
		},
	];
}

export function createDerivedDecorationField<T extends TagRange>(
	field: StateField<T[]>,
	build: (range: T, doc: Text) => DecorationEntry[],
): StateField<RangeSet<Decoration>> {
	const compute = (ranges: readonly T[], doc: Text) => {
		const entries = ranges
			.filter((range) => isValidTagRange(range, doc.length))
			.flatMap((range) => build(range, doc))
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

		return RangeSet.of(
			entries.map((entry) => entry.decoration.range(entry.from, entry.to)),
		);
	};

	return StateField.define<RangeSet<Decoration>>({
		create(state) {
			return compute(state.field(field), state.doc);
		},

		update(value, tr) {
			if (
				!tr.docChanged &&
				tr.startState.field(field) === tr.state.field(field)
			) {
				return value;
			}
			return compute(tr.state.field(field), tr.state.doc);
		},

		provide: (self) => EditorView.decorations.from(self),
	});
}
