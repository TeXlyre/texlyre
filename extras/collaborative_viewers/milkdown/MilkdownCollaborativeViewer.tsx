// extras/collaborative_viewers/milkdown/MilkdownCollaborativeViewer.tsx
import { t } from '@/i18n';
import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Awareness } from 'y-protocols/awareness';
import type * as Y from 'yjs';
import type { Editor } from '@milkdown/kit/core';

import { DownloadIcon, SaveIcon, ViewIcon } from '@/components/common/Icons';
import {
	PluginControlGroup,
	PluginHeader,
} from '@/components/common/PluginHeader';
import { usePluginFileInfo } from '@/hooks/usePluginFileInfo';
import { useSettings } from '@/hooks/useSettings';
import type { CollaborativeViewerProps } from '@/plugins/PluginInterface';
import { fileStorageService } from '@/services/FileStorageService';
import { collabService } from '@/services/CollabService';
import { formatFileSize } from '@/utils/fileUtils';
import MilkdownEditor from '../../viewers/milkdown/MilkdownEditor';
import MilkdownTextPane from '../../viewers/milkdown/MilkdownTextPane';
import { createImageResolver } from '../../viewers/milkdown/imageResolver';
import { createMilkdownPasteHandler } from '../../viewers/milkdown/toolbar/pasteUpload';
import type { MilkdownCollabStrategy } from './MilkdownCollabStrategy';
import { TextBridgeStrategy } from './TextBridgeStrategy';
import '../../viewers/milkdown/styles.css';
import {
	PLUGIN_NAME,
	PLUGIN_VERSION,
} from './MilkdownCollaborativeViewerPlugin';

const MAX_SAFE_MARKDOWN_BYTES = 20 * 1024 * 1024;

const decodeContent = (content: string | ArrayBuffer): string =>
	content instanceof ArrayBuffer
		? new TextDecoder('utf-8', { fatal: false }).decode(content)
		: content;

const looksBinary = (content: ArrayBuffer): boolean => {
	const bytes = new Uint8Array(content, 0, Math.min(content.byteLength, 4096));
	if (!bytes.length) return false;

	let suspicious = 0;

	for (const byte of bytes) {
		const isText =
			byte === 9 ||
			byte === 10 ||
			byte === 13 ||
			(byte >= 32 && byte <= 126) ||
			byte >= 128;

		if (!isText || byte === 0) suspicious += 1;
	}

	return suspicious / bytes.length > 0.1;
};

const isProbablyStaleLargeContent = (content: string | ArrayBuffer): boolean =>
	content instanceof ArrayBuffer &&
	(content.byteLength > MAX_SAFE_MARKDOWN_BYTES || looksBinary(content));

const createCollabStrategy = (): MilkdownCollabStrategy =>
	new TextBridgeStrategy();

const waitForPersistence = async (
	container: ReturnType<typeof collabService.getDocContainer>,
): Promise<void> => {
	if (!container?.persistence) return;

	await new Promise<void>((resolve) => {
		const timeout = window.setTimeout(resolve, 2000);

		const handleSynced = () => {
			window.clearTimeout(timeout);
			container.persistence.off('synced', handleSynced);
			resolve();
		};

		container.persistence.on('synced', handleSynced);

		if (container.persistence.synced) {
			window.clearTimeout(timeout);
			container.persistence.off('synced', handleSynced);
			resolve();
		}
	});
};

const MilkdownCollaborativeViewer: React.FC<CollaborativeViewerProps> = ({
	content,
	fileName,
	fileId,
	docUrl,
	documentId,
	isDocumentSelected,
	parseComments,
	addComment,
	updateComments,
}) => {
	const { getSetting } = useSettings();
	const fileInfo = usePluginFileInfo(fileId, fileName);

	const defaultView =
		(getSetting('milkdown-viewer-default-view')?.value as 'visual' | 'text') ??
		'visual';

	const [markdown, setMarkdown] = useState('');
	const [viewMode, setViewMode] = useState<'visual' | 'text'>(defaultView);
	const [isSaving, setIsSaving] = useState(false);
	const [isLoadingContent, setIsLoadingContent] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [awareness, setAwareness] = useState<Awareness | null>(null);
	const [collabDoc, setCollabDoc] = useState<Y.Doc | null>(null);

	const strategyRef = useRef<MilkdownCollabStrategy | null>(null);
	const visualEditorRef = useRef<Editor | null>(null);
	const markdownRef = useRef('');
	const initialMarkdownRef = useRef<string | null>(null);
	const textPaneInitialMarkdownRef = useRef<string | null>(null);
	const getTextContentRef = useRef<() => string>(() => '');
	const [textPaneVersion, setTextPaneVersion] = useState(0);

	const filePathRef = useRef(fileInfo.filePath || `/${fileName}`);

	useEffect(() => {
		filePathRef.current = fileInfo.filePath || `/${fileName}`;
	}, [fileInfo.filePath, fileName]);

	const imageResolver = useMemo(
		() => createImageResolver(() => filePathRef.current),
		[],
	);

	const milkdownPlugins = useMemo(
		() => [imageResolver.plugin],
		[imageResolver],
	);

	const handlePaste = useMemo(
		() => createMilkdownPasteHandler(fileId),
		[fileId],
	);

	useEffect(() => {
		return () => imageResolver.dispose();
	}, [imageResolver]);

	const projectId = useMemo(
		() => (docUrl.startsWith('yjs:') ? docUrl.slice(4) : docUrl),
		[docUrl],
	);
	const collectionName = useMemo(() => `yjs_${documentId}`, [documentId]);
	const isTextView = viewMode === 'text';

	const updateLocalMarkdown = useCallback((nextMarkdown: string) => {
		markdownRef.current = nextMarkdown;
		setMarkdown(nextMarkdown);
	}, []);

	useEffect(() => {
		if (collabDoc) return;

		if (isProbablyStaleLargeContent(content)) {
			setIsLoadingContent(true);
			return;
		}

		initialMarkdownRef.current = decodeContent(content);
	}, [content, collabDoc]);

	useEffect(() => {
		let cancelled = false;

		const connect = async () => {
			setIsLoadingContent(true);
			setError(null);

			const { doc, provider } = collabService.connect(
				projectId,
				collectionName,
			);
			const container = collabService.getDocContainer(
				projectId,
				collectionName,
			);

			setAwareness(provider?.awareness ?? null);

			await waitForPersistence(container);
			if (cancelled) return;

			setCollabDoc(doc);
		};

		connect().catch((err) => {
			console.error('Error opening collaborative Markdown document:', err);
			setError(
				t('Failed to open collaborative document: {error}', {
					error: err instanceof Error ? err.message : t('Unknown error'),
				}),
			);
			setIsLoadingContent(false);
		});

		return () => {
			cancelled = true;
			strategyRef.current?.destroy();
			strategyRef.current = null;
			visualEditorRef.current = null;
			setCollabDoc(null);
			setAwareness(null);
			collabService.disconnect(projectId, collectionName);
		};
	}, [projectId, collectionName]);

	useEffect(() => {
		if (!collabDoc) return;

		const ytext = collabDoc.getText('codemirror');
		const initialMarkdown = initialMarkdownRef.current;

		if (ytext.length === 0 && initialMarkdown !== null) {
			collabDoc.transact(() => {
				ytext.insert(0, initialMarkdown);
			}, 'milkdown-init');
		}

		const current = ytext.toString();
		updateLocalMarkdown(current || initialMarkdown || '');
		setIsLoadingContent(false);
	}, [collabDoc, updateLocalMarkdown]);

	const bindVisualStrategy = useCallback(
		(editor: Editor) => {
			if (!collabDoc) return;

			strategyRef.current?.destroy();

			const strategy = createCollabStrategy();
			strategy.bind(editor, collabDoc, awareness ?? undefined, {
				onRemoteUpdate: updateLocalMarkdown,
			});

			strategyRef.current = strategy;
		},
		[collabDoc, awareness, updateLocalMarkdown],
	);

	const handleVisualReady = useCallback(
		(editor: Editor) => {
			visualEditorRef.current = editor;
			if (!isTextView) bindVisualStrategy(editor);
		},
		[bindVisualStrategy, isTextView],
	);

	useEffect(() => {
		if (isTextView) {
			strategyRef.current?.destroy();
			strategyRef.current = null;
			return;
		}

		if (visualEditorRef.current) bindVisualStrategy(visualEditorRef.current);
	}, [isTextView, bindVisualStrategy]);

	const handleVisualChange = useCallback(
		(md: string) => {
			updateLocalMarkdown(md);
			strategyRef.current?.pushMarkdown(md);
		},
		[updateLocalMarkdown],
	);

	const handleTextChange = useCallback((md: string) => {
		markdownRef.current = md;
	}, []);

	const currentContent = useCallback(() => {
		const shared = collabDoc?.getText('codemirror').toString();
		if (shared !== undefined) return shared;

		if (isTextView) {
			const fromEditor = getTextContentRef.current();
			if (fromEditor) return fromEditor;
		}

		return markdownRef.current;
	}, [collabDoc, isTextView]);

	const switchView = () => {
		const current = currentContent();

		if (isTextView) {
			updateLocalMarkdown(current);
			setViewMode('visual');
			return;
		}

		textPaneInitialMarkdownRef.current = current;
		setTextPaneVersion((version) => version + 1);
		setViewMode('text');
	};

	const handleSave = useCallback(async () => {
		if (!fileId) return;

		setIsSaving(true);
		setError(null);

		try {
			const bytes = new TextEncoder().encode(currentContent()).buffer;
			await fileStorageService.updateFileContent(fileId, bytes);
		} catch (err) {
			console.error('Error saving Markdown file:', err);
			setError(
				t('Failed to save file: {error}', {
					error: err instanceof Error ? err.message : t('Unknown error'),
				}),
			);
		} finally {
			setIsSaving(false);
		}
	}, [fileId, currentContent]);

	const handleExport = () => {
		const url = URL.createObjectURL(
			new Blob([currentContent()], {
				type: 'text/markdown;charset=utf-8',
			}),
		);

		const a = document.createElement('a');
		a.href = url;
		a.download = fileName.replace(/\.(md|markdown)$/i, '') + '.md';

		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
	};

	const tooltipInfo = [
		t('Collaborative Mode: Active'),
		t('Document ID: {documentId}', { documentId }),
		t('MIME Type: {mimeType}', {
			mimeType: fileInfo.mimeType || 'text/markdown',
		}),
		t('Size: {size}', { size: formatFileSize(fileInfo.fileSize) }),
	];

	const headerControls = (
		<>
			<PluginControlGroup>
				<button
					className={isTextView ? 'active' : ''}
					onClick={switchView}
					title={t('Switch to {viewMode}', {
						viewMode: isTextView ? t('Visual View') : t('Text View'),
					})}
					disabled={isLoadingContent}
				>
					<ViewIcon />
				</button>
			</PluginControlGroup>

			<PluginControlGroup>
				{fileId && (
					<button
						onClick={() => {
							if (isTextView) {
								document.dispatchEvent(
									new CustomEvent('trigger-save', {
										detail: { documentId, isFile: false },
									}),
								);
							} else {
								handleSave();
							}
						}}
						title={t('Save File')}
						disabled={isSaving || isLoadingContent}
					>
						<SaveIcon />
					</button>
				)}

				<button
					onClick={handleExport}
					title={t('Download Markdown')}
					disabled={isLoadingContent}
				>
					<DownloadIcon />
				</button>
			</PluginControlGroup>
		</>
	);

	return (
		<div className='milkdown-viewer-container'>
			<PluginHeader
				fileName={fileInfo.fileName}
				filePath={fileInfo.filePath}
				pluginName={PLUGIN_NAME}
				pluginVersion={PLUGIN_VERSION}
				tooltipInfo={tooltipInfo}
				controls={headerControls}
				awareness={awareness}
			/>

			<div className='milkdown-viewer-content'>
				{error && (
					<div className='milkdown-error-message error-message'>{error}</div>
				)}

				{isLoadingContent ? (
					<div className='milkdown-loading-message'>
						{t('Loading Markdown…')}
					</div>
				) : !isTextView ? (
					<div className='milkdown-visual-pane'>
						<MilkdownEditor
							key={`visual-${fileId ?? fileName}`}
							markdown={markdown}
							editable={true}
							onChange={handleVisualChange}
							onReady={handleVisualReady}
							plugins={milkdownPlugins}
							onPaste={handlePaste}
						/>
					</div>
				) : (
					<MilkdownTextPane
						key={`text-${fileId ?? fileName}-${textPaneVersion}`}
						docUrl={docUrl}
						documentId={documentId}
						isDocumentSelected={isDocumentSelected}
						markdown={textPaneInitialMarkdownRef.current ?? markdownRef.current}
						onChange={handleTextChange}
						fileName={fileName}
						isEditingFile={false}
						parseComments={parseComments}
						addComment={addComment}
						updateComments={updateComments}
						registerView={(getContent) => {
							getTextContentRef.current = getContent;
						}}
					/>
				)}
			</div>
		</div>
	);
};

export default MilkdownCollaborativeViewer;
