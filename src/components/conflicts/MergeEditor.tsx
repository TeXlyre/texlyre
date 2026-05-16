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
}

export const MergeEditor = forwardRef<MergeEditorHandle, MergeEditorProps>(
    ({ local, remote, initialMerged }, ref) => {
        const containerRef = useRef<HTMLDivElement>(null);
        const viewRef = useRef<MergeView | null>(null);

        useImperativeHandle(ref, () => ({
            getMergedContent: () => viewRef.current?.a.state.doc.toString() ?? '',
        }), []);

        useEffect(() => {
            if (!containerRef.current) return;
            const getMergeView = () => viewRef.current;

            viewRef.current = new MergeView({
                a: {
                    doc: initialMerged ?? local,
                    extensions: [basicSetup, EditorView.lineWrapping],
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

        return <div ref={containerRef} className="merge-editor-container" />;
    }
);

MergeEditor.displayName = 'MergeEditor';

export default MergeEditor;
