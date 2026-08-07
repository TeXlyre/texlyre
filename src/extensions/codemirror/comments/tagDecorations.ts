// src/extensions/codemirror/comments/tagDecorations.ts
import { RangeSet, StateField, type Text } from '@codemirror/state';
import { Decoration, EditorView, WidgetType } from '@codemirror/view';

import type { TagEffects, TagPayload, TagRange } from './tagRanges';

export interface DecorationEntry {
	decoration: Decoration;
	from: number;
	to: number;
	priority: number;
}

export class HiddenTagWidget extends WidgetType {
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
		return span;
	}

	get estimatedHeight() {
		return 0;
	}

	ignoreEvent() {
		return true;
	}
}

export function hiddenTagEntries(
	id: string,
	positions: TagPayload['positions'],
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

export function getDecorationTagId(decoration: Decoration): string | undefined {
	const spec = (decoration as unknown as { spec?: any }).spec;
	return (
		spec?.attributes?.['data-comment-id'] ??
		spec?.attributes?.['data-review-id'] ??
		spec?.widget?.id
	);
}

export function createDerivedDecorationField<T extends TagRange>(
	field: StateField<T[]>,
	build: (range: T, doc: Text) => DecorationEntry[],
): StateField<RangeSet<Decoration>> {
	const compute = (ranges: readonly T[], doc: Text) => {
		const entries = ranges.flatMap((range) =>
			range.openStart >= 0 && range.closeEnd <= doc.length
				? build(range, doc)
				: [],
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

export function createTagDecorationField<P extends TagPayload>(
	effects: TagEffects<P>,
	build: (payload: P) => DecorationEntry[],
): StateField<RangeSet<Decoration>> {
	return StateField.define<RangeSet<Decoration>>({
		create() {
			return RangeSet.empty;
		},

		update(value, tr) {
			value = value.map(tr.changes);

			for (const effect of tr.effects) {
				if (effect.is(effects.clear)) {
					value = RangeSet.empty;
				}

				if (effect.is(effects.remove)) {
					value = value.update({
						filter: (_from, _to, decoration) =>
							getDecorationTagId(decoration) !== effect.value,
					});
				}
			}

			const entries: DecorationEntry[] = [];

			for (const effect of tr.effects) {
				if (!effect.is(effects.add)) continue;

				const payload = effect.value;

				value = value.update({
					filter: (_from, _to, decoration) =>
						getDecorationTagId(decoration) !== payload.id,
				});

				entries.push(...build(payload));
			}

			if (!entries.length) return value;

			entries.sort(
				(a, b) =>
					a.from - b.from ||
					a.decoration.startSide - b.decoration.startSide ||
					b.priority - a.priority,
			);

			return value.update({
				add: entries.map((entry) =>
					entry.decoration.range(entry.from, entry.to),
				),
			});
		},

		provide: (field) => EditorView.decorations.from(field),
	});
}
