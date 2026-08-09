// extras/viewers/milkdown/MilkdownTextPane.tsx
import type React from 'react';
import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import type { EditorView } from '@codemirror/view';

import PluginToolbar, {
	type ToolbarEntry,
} from '@/components/common/PluginToolbar';
import { useEditorView } from '@/hooks/editor/useEditorView';

const EMPTY_TOOLBAR_ITEMS: ToolbarEntry[] = [];

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
	updateComments?: (content: string) => void;
	registerView?: (getContent: () => string) => void;
	showToolbar?: boolean;
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
	updateComments,
	registerView,
	showToolbar = true,
}) => {
	const editorRef = useRef<HTMLDivElement>(null);

	const { viewRef, showSaveIndicator, toolbarController } = useEditorView(
		editorRef,
		docUrl,
		documentId,
		isDocumentSelected,
		markdown,
		onChange,
		updateComments || noopUpdate,
		isEditingFile,
		false,
		fileName,
		fileId,
		false,
		showToolbar,
	);

	const toolbarItems = useSyncExternalStore(
		useCallback(
			(cb) => toolbarController?.subscribe(cb) ?? (() => {}),
			[toolbarController],
		),
		() => toolbarController?.getItems() ?? EMPTY_TOOLBAR_ITEMS,
	);

	useEffect(() => {
		registerView?.(
			() => (viewRef.current as EditorView | null)?.state.doc.toString() ?? '',
		);
		return () => registerView?.(() => '');
	}, [registerView, viewRef]);

	return (
		<div className='editor-wrapper' style={{ flex: 1, position: 'relative' }}>
			{showToolbar && toolbarController && (
				<PluginToolbar
					items={toolbarItems}
					onRun={(key) => toolbarController.run(key)}
				/>
			)}

			<div ref={editorRef} className='codemirror-editor-container' />

			{showSaveIndicator && (
				<div className='save-indicator'>
					<span>Saved</span>
				</div>
			)}
		</div>
	);
};

export default MilkdownTextPane;
