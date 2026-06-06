// extras/viewers/milkdown/MilkdownTextPane.tsx
import type React from 'react';
import { useEffect, useRef } from 'react';
import type { EditorView } from '@codemirror/view';

import { useEditorView } from '@/hooks/editor/useEditorView';

const noopParse = () => [];
const noopAdd = () => ({ openTag: '', closeTag: '', commentId: '' });
const noopUpdate = () => {};

interface MilkdownTextPaneProps {
	docUrl: string;
	documentId: string;
	isDocumentSelected: boolean;
	markdown: string;
	onChange: (markdown: string) => void;
	fileName: string;
	fileId?: string;
	isEditingFile: boolean;
	parseComments?: (text: string) => unknown[];
	addComment?: (content: string) => unknown;
	updateComments?: (content: string) => void;
	registerView?: (getContent: () => string) => void;
}

const MilkdownTextPane: React.FC<MilkdownTextPaneProps> = ({
	docUrl,
	documentId,
	isDocumentSelected,
	markdown,
	onChange,
	fileName,
	fileId,
	isEditingFile,
	parseComments,
	addComment,
	updateComments,
	registerView,
}) => {
	const editorRef = useRef<HTMLDivElement>(null);

	const { viewRef, showSaveIndicator } = useEditorView(
		editorRef,
		docUrl,
		documentId,
		isDocumentSelected,
		markdown,
		onChange,
		parseComments || noopParse,
		addComment || noopAdd,
		updateComments || noopUpdate,
		isEditingFile,
		false,
		fileName,
		fileId,
	);

	useEffect(() => {
		registerView?.(
			() => (viewRef.current as EditorView | null)?.state.doc.toString() ?? '',
		);
		return () => registerView?.(() => '');
	}, [registerView, viewRef]);

	return (
		<>
			<div ref={editorRef} className='codemirror-editor-container' />
			{showSaveIndicator && (
				<div className='save-indicator'>
					<span>Saved</span>
				</div>
			)}
		</>
	);
};

export default MilkdownTextPane;
