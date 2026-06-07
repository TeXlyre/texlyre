// extras/viewers/milkdown/MilkdownEditor.tsx
import type React from 'react';
import { useEffect, useRef } from 'react';
import {
	Milkdown,
	MilkdownProvider,
	useEditor,
	useInstance,
} from '@milkdown/react';
import { editorViewCtx } from '@milkdown/kit/core';
import type { Editor } from '@milkdown/kit/core';
import type { MilkdownPlugin } from '@milkdown/kit/ctx';
import type { EditorView } from '@milkdown/kit/prose/view';

import { navigateHref } from './linkClick';
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
	onPaste?: (view: EditorView, event: ClipboardEvent) => boolean;
	getCurrentFilePath: () => string;
	enabledPlugins?: Set<string>;
}

const MilkdownInner: React.FC<MilkdownEditorProps> = ({
	markdown,
	editable,
	onChange,
	onReady,
	plugins,
	syncExternalChanges,
	onPaste,
	getCurrentFilePath,
	enabledPlugins,
}) => {
	const editableRef = useRef(editable);
	const initialMarkdownRef = useRef(markdown);
	const getCurrentFilePathRef = useRef(getCurrentFilePath);
	const onChangeRef = useRef(onChange);
	const onReadyRef = useRef(onReady);
	const onPasteRef = useRef(onPaste);
	const pluginsRef = useRef(plugins);
	const enabledPluginsRef = useRef(enabledPlugins);
	const lastSyncedRef = useRef(markdown);
	const scrollRef = useRef<HTMLDivElement>(null);
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

	useEffect(() => {
		onPasteRef.current = onPaste;
	}, [onPaste]);

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
				getCurrentFilePath: () => getCurrentFilePathRef.current(),
				enabledPlugins: enabledPluginsRef.current,
			}),
		[],
	);

	useEffect(() => {
		if (loading) return;

		const editor = getInstance();
		if (editor) onReadyRef.current?.(editor);
	}, [loading, getInstance]);

	useEffect(() => {
		const node = scrollRef.current;
		if (loading || !node) return;

		const editor = getInstance();
		if (!editor) return;

		const listener = (event: ClipboardEvent) => {
			if (!editableRef.current) return;

			let view: EditorView | null = null;
			editor.action((ctx) => {
				view = ctx.get(editorViewCtx);
			});
			if (!view) return;

			if (onPasteRef.current?.(view, event)) {
				event.preventDefault();
				event.stopPropagation();
				event.stopImmediatePropagation();
			}
		};

		node.addEventListener('paste', listener, true);
		return () => node.removeEventListener('paste', listener, true);
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

	useEffect(() => {
		const node = scrollRef.current;
		if (!node) return;

		const onKey = (e: KeyboardEvent) => {
			node.classList.toggle('mod-held', e.ctrlKey || e.metaKey);
		};
		const onBlur = () => node.classList.remove('mod-held');

		document.addEventListener('keydown', onKey);
		document.addEventListener('keyup', onKey);
		window.addEventListener('blur', onBlur);
		return () => {
			document.removeEventListener('keydown', onKey);
			document.removeEventListener('keyup', onKey);
			window.removeEventListener('blur', onBlur);
		};
	}, []);

	useEffect(() => {
		if (loading) return;
		const editor = getInstance();
		if (!editor) return;

		const onClick = (event: MouseEvent) => {
			const target = event.target as HTMLElement;
			const anchor = target.closest('a');
			if (!anchor) return;
			if (!anchor.closest('.milkdown-link-preview, .link-preview')) return;

			const href = anchor.getAttribute('href') ?? '';

			event.preventDefault();
			event.stopPropagation();

			if (!href.trim()) return;

			editor.action((ctx) => {
				const view = ctx.get(editorViewCtx);
				navigateHref(view, href, getCurrentFilePathRef.current);
			});
		};

		document.addEventListener('click', onClick, true);
		return () => document.removeEventListener('click', onClick, true);
	}, [loading, getInstance]);

	return (
		<div ref={scrollRef} className='milkdown-editor-scroll'>
			<Milkdown />
		</div>
	);
};

const MilkdownEditor: React.FC<MilkdownEditorProps> = (props) => (
	<MilkdownProvider>
		<div className='milkdown-editor-shell'>
			{props.showToolbar !== false && (
				<MilkdownToolbar getCurrentFilePath={props.getCurrentFilePath} />
			)}
			<MilkdownInner {...props} />
		</div>
	</MilkdownProvider>
);

export default MilkdownEditor;
