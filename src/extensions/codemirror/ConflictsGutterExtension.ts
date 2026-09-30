// src/extension/codemirror/ConflictsGutterExtension.ts
import { getChunks } from '@codemirror/merge';
import { type Extension, RangeSetBuilder } from '@codemirror/state';
import { gutter, GutterMarker } from '@codemirror/view';
import type { MergeView } from '@codemirror/merge';

import { t } from '@/i18n';

class CopyChunkMarker extends GutterMarker {
	constructor(
		private readonly fromB: number,
		private readonly getMergeView: () => MergeView | null,
	) {
		super();
	}

	toDOM(): HTMLElement {
		const btn = document.createElement('button');
		btn.className = 'cm-conflict-copy-btn';
		btn.textContent = t('→');
		btn.title = 'Copy chunk to merged';
		btn.addEventListener('mousedown', (e) => {
			e.preventDefault();
			this.applyChunk();
		});
		return btn;
	}

	private applyChunk(): void {
		const mv = this.getMergeView();
		if (!mv) return;

		const result = getChunks(mv.b.state);
		if (!result) return;

		const chunk = result.chunks.find((c) => c.fromB === this.fromB);
		if (!chunk) return;

		const targetDoc = mv.a.state.doc;
		const remoteText = mv.b.state.doc.sliceString(chunk.fromB, chunk.toB);
		const targetFrom = Math.min(chunk.fromA, targetDoc.length);
		const targetTo = Math.min(chunk.toA, targetDoc.length);

		mv.a.dispatch({
			changes: { from: targetFrom, to: targetTo, insert: remoteText },
		});
	}
}

export function conflictsGutterExtension(
	getMergeView: () => MergeView | null,
): Extension {
	return gutter({
		class: 'cm-conflict-gutter',
		markers(view) {
			const mv = getMergeView();
			const builder = new RangeSetBuilder<GutterMarker>();
			if (!mv) return builder.finish();

			const result = getChunks(mv.b.state);
			if (!result) return builder.finish();

			for (const chunk of result.chunks) {
				if (chunk.fromB === chunk.toB) continue;
				const markerPos = view.state.doc.lineAt(chunk.fromB).from;
				builder.add(
					markerPos,
					markerPos,
					new CopyChunkMarker(chunk.fromB, getMergeView),
				);
			}

			return builder.finish();
		},
	});
}
