// src/components/conflicts/MergeEditor.tsx
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { MergeView } from '@codemirror/merge';
import {
	Compartment,
	RangeSetBuilder,
	StateEffect,
	StateField,
} from '@codemirror/state';
import {
	Decoration,
	type DecorationSet,
	EditorView,
	keymap,
	placeholder,
} from '@codemirror/view';

import { conflictsGutterExtension } from '../../extensions/codemirror/ConflictsGutterExtension';
import { DeletedTextWidget } from '../../extensions/codemirror/review/reviewDecorations';
import { useEditorViewExtensions } from '../../hooks/editor/useEditorViewExtensions';
import type { StrippedReviewDeletion } from '../../utils/annotationTagUtils';

export interface AnnotationSpan {
	from: number;
	to: number;
}

export interface MergeEditorHandle {
	getMergedContent: () => string;
}

export interface MergeEmptySideNote {
	side: 'a' | 'b';
	text: string;
}

interface MergeEditorProps {
	local: string;
	remote: string;
	fileName?: string;
	initialMerged?: string;
	localAnnotationSpans?: AnnotationSpan[];
	annotationSpans?: AnnotationSpan[];
	localReviewDeletions?: StrippedReviewDeletion[];
	reviewDeletions?: StrippedReviewDeletion[];
	emptySideNote?: MergeEmptySideNote;
	onMergedChange?: (merged: string) => void;
	onAnnotationsChange?: (surviving: number, total: number) => void;
	onSave?: (merged: string) => void;
	readOnly?: boolean;
}

const annotationMark = Decoration.mark({ class: 'cm-annotated-span' });

const createSemanticDiffTheme = (
	aColor: 'var(--color-error)' | 'var(--color-success)',
	bColor: 'var(--color-error)' | 'var(--color-success)',
) =>
	EditorView.theme({
		'&.cm-merge-a .cm-changedLine': {
			backgroundColor: `color-mix(in srgb, ${aColor} 11%, transparent) !important`,
		},
		'&.cm-merge-b .cm-changedLine': {
			backgroundColor: `color-mix(in srgb, ${bColor} 11%, transparent) !important`,
		},
		'&.cm-merge-a .cm-changedLineGutter': {
			backgroundColor: `${aColor} !important`,
		},
		'&.cm-merge-b .cm-changedLineGutter': {
			backgroundColor: `${bColor} !important`,
		},
		'&.cm-merge-a .cm-changedText': {
			background: `color-mix(in srgb, ${aColor} 34%, transparent) !important`,
		},
		'&.cm-merge-b .cm-changedText': {
			background: `color-mix(in srgb, ${bColor} 34%, transparent) !important`,
		},
		'& .cm-insertedLine, & .cm-deletedLine': {
			textDecoration: 'none !important',
		},
	});

const aToBTheme = createSemanticDiffTheme(
	'var(--color-error)',
	'var(--color-success)',
);
const bToATheme = createSemanticDiffTheme(
	'var(--color-success)',
	'var(--color-error)',
);

const wholeFileDiffTheme = EditorView.theme({
	'& .cm-changedLine': {
		backgroundColor: 'transparent !important',
	},
	'& .cm-changedLineGutter': {
		backgroundColor: 'transparent !important',
	},
	'& .cm-changedText': {
		background: 'none !important',
	},
});

const emptySideTheme = EditorView.theme({
	'& .cm-placeholder': {
		display: 'block',
		boxSizing: 'border-box',
		width: '100%',
		padding: 'var(--space-xl) var(--space-md)',
		color: 'var(--pico-secondary)',
		fontStyle: 'italic',
		textAlign: 'center',
		whiteSpace: 'normal',
	},
});

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

const buildReviewDeletionDecorations = (
	deletions: StrippedReviewDeletion[],
): DecorationSet => {
	const builder = new RangeSetBuilder<Decoration>();
	for (const deletion of [...deletions].sort(
		(a, b) => a.at - b.at || a.id.localeCompare(b.id),
	)) {
		builder.add(
			deletion.at,
			deletion.at,
			Decoration.widget({
				widget: new DeletedTextWidget(deletion.text, deletion.id),
				side: -1,
			}),
		);
	}
	return builder.finish();
};

const createReviewDeletionField = (deletions: StrippedReviewDeletion[]) =>
	StateField.define<StrippedReviewDeletion[]>({
		create: () => deletions,
		update: (value, transaction) =>
			transaction.docChanged
				? value.map((deletion) => ({
						...deletion,
						at: transaction.changes.mapPos(deletion.at, -1),
					}))
				: value,
		provide: (field) =>
			EditorView.decorations.from(field, buildReviewDeletionDecorations),
	});

const serializeReviewDeletions = (
	content: string,
	deletions: StrippedReviewDeletion[],
): string => {
	let result = content;
	for (const deletion of [...deletions].sort(
		(a, b) => b.at - a.at || b.id.localeCompare(a.id),
	)) {
		const at = Math.max(0, Math.min(deletion.at, content.length));
		result =
			result.slice(0, at) +
			deletion.openTag +
			deletion.closeTag +
			result.slice(at);
	}
	return result;
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
			fileName,
			initialMerged,
			localAnnotationSpans,
			annotationSpans,
			localReviewDeletions,
			reviewDeletions,
			emptySideNote,
			onMergedChange,
			onAnnotationsChange,
			onSave,
			readOnly = false,
		},
		ref,
	) => {
		const containerRef = useRef<HTMLDivElement>(null);
		const viewRef = useRef<MergeView | null>(null);
		const localExtensionsCompartment = useRef(new Compartment());
		const remoteExtensionsCompartment = useRef(new Compartment());
		const onMergedChangeRef = useRef(onMergedChange);
		const onAnnotationsChangeRef = useRef(onAnnotationsChange);
		const onSaveRef = useRef(onSave);
		const localSpansRef = useRef(localAnnotationSpans ?? []);
		const remoteSpansRef = useRef(annotationSpans ?? []);
		const localDeletionField = useRef(
			createReviewDeletionField(localReviewDeletions ?? []),
		).current;
		const remoteDeletionField = useRef(
			createReviewDeletionField(reviewDeletions ?? []),
		).current;

		const localEditorExtensions = useEditorViewExtensions({
			fileName,
			content: initialMerged ?? local,
			readOnly,
		});
		const remoteEditorExtensions = useEditorViewExtensions({
			fileName,
			content: remote,
			readOnly: true,
		});

		useEffect(() => {
			onMergedChangeRef.current = onMergedChange;
			onAnnotationsChangeRef.current = onAnnotationsChange;
			onSaveRef.current = onSave;
			localSpansRef.current = localAnnotationSpans ?? [];
			remoteSpansRef.current = annotationSpans ?? [];
		}, [
			onMergedChange,
			onAnnotationsChange,
			onSave,
			localAnnotationSpans,
			annotationSpans,
		]);

		useImperativeHandle(
			ref,
			() => ({
				getMergedContent: () => {
					const view = viewRef.current?.a;
					return view
						? serializeReviewDeletions(
								view.state.doc.toString(),
								view.state.field(localDeletionField),
							)
						: '';
				},
			}),
			[localDeletionField],
		);

		/* biome-ignore lint/correctness/useExhaustiveDependencies: MergeView is created once from initial documents; content changes are handled by the view itself and resets remount via key. */
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

			const saveKeymap = keymap.of([
				{
					key: 'Ctrl-s',
					run: (view) => {
						if (readOnly || !onSaveRef.current) return false;
						onSaveRef.current(
							serializeReviewDeletions(
								view.state.doc.toString(),
								view.state.field(localDeletionField),
							),
						);
						return true;
					},
				},
			]);

			const wholeFileChange = !!emptySideNote;
			const diffTheme = wholeFileChange
				? wholeFileDiffTheme
				: readOnly
					? aToBTheme
					: bToATheme;
			viewRef.current = new MergeView({
				a: {
					doc: initialMerged ?? local,
					extensions: [
						localExtensionsCompartment.current.of(localEditorExtensions),
						diffTheme,
						localDeletionField,
						...(emptySideNote?.side === 'a'
							? [placeholder(emptySideNote.text), emptySideTheme]
							: []),
						survivingField,
						mergedUpdateListener,
						...(!readOnly && onSave ? [saveKeymap] : []),
					],
				},
				b: {
					doc: remote,
					extensions: [
						remoteExtensionsCompartment.current.of(remoteEditorExtensions),
						diffTheme,
						remoteDeletionField,
						...(emptySideNote?.side === 'b'
							? [placeholder(emptySideNote.text), emptySideTheme]
							: []),
						EditorView.decorations.of(
							buildDecorations(annotationSpans ?? [], remote.length),
						),
						...(readOnly ? [] : [conflictsGutterExtension(getMergeView)]),
					],
				},
				orientation: 'b-a',
				highlightChanges: !wholeFileChange,
				gutter: !wholeFileChange,
				parent: containerRef.current,
			});

			if (viewRef.current) reportSurviving(viewRef.current.a);

			return () => {
				viewRef.current?.destroy();
				viewRef.current = null;
			};
		}, []);

		useEffect(() => {
			const mergeView = viewRef.current;
			if (!mergeView) return;

			mergeView.a.dispatch({
				effects: localExtensionsCompartment.current.reconfigure(
					localEditorExtensions,
				),
			});
			mergeView.b.dispatch({
				effects: remoteExtensionsCompartment.current.reconfigure(
					remoteEditorExtensions,
				),
			});
		}, [localEditorExtensions, remoteEditorExtensions]);

		return (
			<div
				ref={containerRef}
				className={`merge-editor-container${readOnly ? ' compare-mode' : ''}`}
			/>
		);
	},
);

MergeEditor.displayName = 'MergeEditor';

export default MergeEditor;
