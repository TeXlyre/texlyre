// src/components/conflicts/MergeEditor.tsx
import { useEffect, useRef } from 'react';
import { MergeView } from '@codemirror/merge';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { basicSetup } from 'codemirror';

interface MergeEditorProps {
	local: string;
	remote: string;
	onMergedChange: (merged: string) => void;
}

export const MergeEditor: React.FC<MergeEditorProps> = ({
	local,
	remote,
	onMergedChange,
}) => {
	const containerRef = useRef<HTMLDivElement>(null);
	const viewRef = useRef<MergeView | null>(null);

	useEffect(() => {
		if (!containerRef.current) return;

		const updateListener = EditorView.updateListener.of((update) => {
			if (update.docChanged) {
				onMergedChange(update.state.doc.toString());
			}
		});

		viewRef.current = new MergeView({
			a: { doc: local, extensions: [basicSetup, updateListener] },
			b: {
				doc: remote,
				extensions: [basicSetup, EditorState.readOnly.of(true)],
			},
			parent: containerRef.current,
		});

		return () => {
			viewRef.current?.destroy();
			viewRef.current = null;
		};
	}, [remote, onMergedChange, local]);

	return <div ref={containerRef} className='merge-editor-container' />;
};

export default MergeEditor;
