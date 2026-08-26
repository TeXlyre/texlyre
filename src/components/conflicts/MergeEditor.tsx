// src/components/conflicts/MergeEditor.tsx
import { useEffect, useImperativeHandle, useRef, forwardRef } from 'react';
import { MergeView } from '@codemirror/merge';
import {
	EditorState,
	RangeSetBuilder,
	StateEffect,
	StateField,
} from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView } from '@codemirror/view';
import { basicSetup } from 'codemirror';

import { conflictsGutterExtension } from '../../extensions/codemirror/ConflictsGutterExtension';

export interface AnnotationSpan {
	from: number;
	to: number;
}

export interface MergeEditorHandle {
	getMergedContent: () => string;
}

interface MergeEditorProps {
	local: string;
	remote: string;
	initialMerged?: string;
	localAnnotationSpans?: AnnotationSpan[];
	annotationSpans?: AnnotationSpan[];
	onMergedChange?: (merged: string) => void;
	onAnnotationsChange?: (surviving: number, total: number) => void;
}

const annotationMark = Decoration.mark({ class: 'cm-annotated-span' });

const setSurviving = StateEffect.define<AnnotationSpan[]>();

const survivingField = StateField.define<DecorationSet>({
	create: () => Decoration.none,
	update(value, transaction) {
		let spans = value.map(transaction.changes);
		for (const effect of transaction.effects) {
			if (!effect.is(setSurviving)) continue;
			spans = buildDecorations(effect.value, transaction.newDoc.length);
		}
		return spans;
	},
	provide: (field) => EditorView.decorations.from(field),
});

const buildDecorations = (
	spans: AnnotationSpan[],
	length: number,
): DecorationSet => {
	const clamped = spans
		.map((span) => ({
			from: Math.max(0, Math.min(span.from, length)),
			to: Math.max(0, Math.min(span.to, length)),
		}))
		.filter((span) => span.from < span.to)
		.sort((a, b) => a.from - b.from || a.to - b.to);

	const builder = new RangeSetBuilder<Decoration>();
	let previousEnd = 0;

	for (const span of clamped) {
		const from = Math.max(span.from, previousEnd);
		if (from >= span.to) continue;
		builder.add(from, span.to, annotationMark);
		previousEnd = span.to;
	}

	return builder.finish();
};

const locateSpans = (
	source: string,
	spans: AnnotationSpan[],
	target: string,
): AnnotationSpan[] => {
	const located: AnnotationSpan[] = [];
	for (const span of spans) {
		const text = source.slice(span.from, span.to);
		if (!text.trim()) continue;
		const index = target.indexOf(text);
		if (index >= 0) located.push({ from: index, to: index + text.length });
	}
	return located;
};

const uniqueSpans = (spans: AnnotationSpan[]): AnnotationSpan[] => {
	const seen = new Set<string>();
	return spans.filter((span) => {
		const key = `${span.from}:${span.to}`;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
};

export const MergeEditor = forwardRef<MergeEditorHandle, MergeEditorProps>(
	(
		{
			local,
			remote,
			initialMerged,
			localAnnotationSpans,
			annotationSpans,
			onMergedChange,
			onAnnotationsChange,
		},
		ref,
	) => {
		const containerRef = useRef<HTMLDivElement>(null);
		const viewRef = useRef<MergeView | null>(null);
		const onMergedChangeRef = useRef(onMergedChange);
		const onAnnotationsChangeRef = useRef(onAnnotationsChange);
		const localSpansRef = useRef(localAnnotationSpans ?? []);
		const remoteSpansRef = useRef(annotationSpans ?? []);

		useEffect(() => {
			onMergedChangeRef.current = onMergedChange;
			onAnnotationsChangeRef.current = onAnnotationsChange;
			localSpansRef.current = localAnnotationSpans ?? [];
			remoteSpansRef.current = annotationSpans ?? [];
		}, [
			onMergedChange,
			onAnnotationsChange,
			localAnnotationSpans,
			annotationSpans,
		]);

		useImperativeHandle(
			ref,
			() => ({
				getMergedContent: () => viewRef.current?.a.state.doc.toString() ?? '',
			}),
			[],
		);

		/* biome-ignore lint/correctness/useExhaustiveDependencies: MergeView is created once from initial props; re-mounting on prop change would discard in-progress merge work. */
		useEffect(() => {
			if (!containerRef.current) return;
			const getMergeView = () => viewRef.current;

			const reportSurviving = (view: EditorView) => {
				const localSpans = localSpansRef.current;
				const remoteSpans = remoteSpansRef.current;
				const target = view.state.doc.toString();
				const localSurviving = locateSpans(local, localSpans, target);
				const remoteSurviving = locateSpans(remote, remoteSpans, target);
				const surviving = uniqueSpans([...localSurviving, ...remoteSurviving]);
				const total = localSpans.length + remoteSpans.length;

				view.dispatch({ effects: setSurviving.of(surviving) });
				onAnnotationsChangeRef.current?.(
					localSurviving.length + remoteSurviving.length,
					total,
				);
			};

			const mergedUpdateListener = EditorView.updateListener.of((update) => {
				if (!update.docChanged) return;
				onMergedChangeRef.current?.(update.state.doc.toString());
				reportSurviving(update.view);
			});

			viewRef.current = new MergeView({
				a: {
					doc: initialMerged ?? local,
					extensions: [
						basicSetup,
						EditorView.lineWrapping,
						survivingField,
						mergedUpdateListener,
					],
				},
				b: {
					doc: remote,
					extensions: [
						basicSetup,
						EditorState.readOnly.of(true),
						EditorView.lineWrapping,
						EditorView.decorations.of(
							buildDecorations(annotationSpans ?? [], remote.length),
						),
						conflictsGutterExtension(getMergeView),
					],
				},
				parent: containerRef.current,
			});

			if (viewRef.current) reportSurviving(viewRef.current.a);

			return () => {
				viewRef.current?.destroy();
				viewRef.current = null;
			};
		}, []);

		return <div ref={containerRef} className='merge-editor-container' />;
	},
);

MergeEditor.displayName = 'MergeEditor';

export default MergeEditor;
