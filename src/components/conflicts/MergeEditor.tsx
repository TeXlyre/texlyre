// src/components/conflicts/MergeEditor.tsx
import { useEffect, useImperativeHandle, useRef, forwardRef } from 'react';
import { MergeView } from '@codemirror/merge';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { basicSetup } from 'codemirror';

import { conflictsGutterExtension } from '../../extensions/codemirror/ConflictsGutterExtension';

export interface MergeEditorHandle {
	getMergedContent: () => string;
}

interface MergeEditorProps {
	local: string;
	remote: string;
	initialMerged?: string;
	onMergedChange?: (merged: string) => void;
}

export const MergeEditor = forwardRef<MergeEditorHandle, MergeEditorProps>(
	({ local, remote, initialMerged, onMergedChange }, ref) => {
		const containerRef = useRef<HTMLDivElement>(null);
		const viewRef = useRef<MergeView | null>(null);
		const onMergedChangeRef = useRef(onMergedChange);

		useEffect(() => {
			onMergedChangeRef.current = onMergedChange;
		}, [onMergedChange]);

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

			const mergedUpdateListener = EditorView.updateListener.of((update) => {
				if (!update.docChanged) return;
				onMergedChangeRef.current?.(update.state.doc.toString());
			});

			viewRef.current = new MergeView({
				a: {
					doc: initialMerged ?? local,
					extensions: [
						basicSetup,
						EditorView.lineWrapping,
						mergedUpdateListener,
					],
				},
				b: {
					doc: remote,
					extensions: [
						basicSetup,
						EditorState.readOnly.of(true),
						EditorView.lineWrapping,
						conflictsGutterExtension(getMergeView),
					],
				},
				parent: containerRef.current,
			});

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
