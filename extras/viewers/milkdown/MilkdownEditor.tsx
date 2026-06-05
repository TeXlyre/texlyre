// extras/viewers/milkdown/MilkdownEditor.tsx
import type React from 'react';
import { useEffect, useRef } from 'react';
import {
	Milkdown,
	MilkdownProvider,
	useEditor,
	useInstance,
} from '@milkdown/react';
import type { Editor } from '@milkdown/kit/core';
import type { MilkdownPlugin } from '@milkdown/kit/ctx';

import { configureMilkdownEditor, replaceMarkdown } from './milkdownSetup';
import MilkdownToolbar from './toolbar/MilkdownToolbar';

interface MilkdownEditorProps {
	markdown: string;
	editable: boolean;
	onChange: (markdown: string) => void;
	onReady?: (editor: Editor) => void;
	plugins?: MilkdownPlugin[];
	showToolbar?: boolean;
	syncExternalChanges?: boolean;
}

const MilkdownInner: React.FC<MilkdownEditorProps> = ({
	markdown,
	editable,
	onChange,
	onReady,
	plugins,
	syncExternalChanges,
}) => {
	const editableRef = useRef(editable);
	const initialMarkdownRef = useRef(markdown);
	const onChangeRef = useRef(onChange);
	const onReadyRef = useRef(onReady);
	const pluginsRef = useRef(plugins);
	const lastSyncedRef = useRef(markdown);
	const [loading, getInstance] = useInstance();

	useEffect(() => {
		editableRef.current = editable;
	}, [editable]);
	useEffect(() => {
		onChangeRef.current = onChange;
	}, [onChange]);
	useEffect(() => {
		onReadyRef.current = onReady;
	}, [onReady]);

	useEditor(
		(root) =>
			configureMilkdownEditor({
				root,
				defaultValue: initialMarkdownRef.current,
				editable: () => editableRef.current,
				onMarkdownUpdated: (md) => {
					lastSyncedRef.current = md;
					onChangeRef.current(md);
				},
				plugins: pluginsRef.current,
			}),
		[],
	);

	useEffect(() => {
		if (loading) return;
		const editor = getInstance();
		if (editor) onReadyRef.current?.(editor);
	}, [loading, getInstance]);

	useEffect(() => {
		if (loading || !syncExternalChanges) return;
		if (markdown === lastSyncedRef.current) return;
		const editor = getInstance();
		if (!editor) return;
		lastSyncedRef.current = markdown;
		editor.action((ctx) => {
			replaceMarkdown(ctx, markdown);
		});
	}, [loading, getInstance, markdown, syncExternalChanges]);

	return <Milkdown />;
};

const MilkdownEditor: React.FC<MilkdownEditorProps> = (props) => (
	<MilkdownProvider>
		{props.showToolbar !== false && <MilkdownToolbar />}
		<MilkdownInner {...props} />
	</MilkdownProvider>
);

export default MilkdownEditor;
