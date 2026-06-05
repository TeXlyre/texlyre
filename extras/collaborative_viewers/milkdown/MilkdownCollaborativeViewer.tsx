// extras/collaborative_viewers/milkdown/MilkdownCollaborativeViewer.tsx
import { t } from '@/i18n';
import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Awareness } from 'y-protocols/awareness';
import type { Editor } from '@milkdown/kit/core';

import { DownloadIcon, SaveIcon, ViewIcon } from '@/components/common/Icons';
import {
	PluginControlGroup,
	PluginHeader,
} from '@/components/common/PluginHeader';
import { usePluginFileInfo } from '@/hooks/usePluginFileInfo';
import { useSettings } from '@/hooks/useSettings';
import { useCollab } from '@/hooks/useCollab';
import type { CollaborativeViewerProps } from '@/plugins/PluginInterface';
import { fileStorageService } from '@/services/FileStorageService';
import { collabService } from '@/services/CollabService';
import { formatFileSize } from '@/utils/fileUtils';
import MilkdownEditor from '../../viewers/milkdown/MilkdownEditor';
import MilkdownTextPane from '../../viewers/milkdown/MilkdownTextPane';
import { createImageResolver } from '../../viewers/milkdown/imageResolver';
import type { MilkdownCollabStrategy } from './MilkdownCollabStrategy';
import { TextBridgeStrategy } from './TextBridgeStrategy';
import '../../viewers/milkdown/styles.css';
import {
	PLUGIN_NAME,
	PLUGIN_VERSION,
} from './MilkdownCollaborativeViewerPlugin';

const decodeContent = (content: string | ArrayBuffer): string => {
	if (content instanceof ArrayBuffer) {
		return new TextDecoder('utf-8').decode(content);
	}
	return typeof content === 'string' ? content : '';
};

const createCollabStrategy = (): MilkdownCollabStrategy =>
	new TextBridgeStrategy();

const MilkdownCollaborativeViewer: React.FC<CollaborativeViewerProps> = ({
	content,
	fileName,
	fileId,
	docUrl,
	documentId,
	isDocumentSelected,
	onUpdateContent,
	parseComments,
	addComment,
	updateComments,
}) => {
	const { getAwareness } = useCollab();
	const { getSetting } = useSettings();
	const fileInfo = usePluginFileInfo(fileId, fileName);

	const defaultView =
		(getSetting('milkdown-viewer-default-view')?.value as 'visual' | 'text') ??
		'visual';

	const [viewMode, setViewMode] = useState<'visual' | 'text'>(defaultView);
	const [isSaving, setIsSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [awareness, setAwareness] = useState<Awareness | null>(null);

	const strategyRef = useRef<MilkdownCollabStrategy | null>(null);
	const markdownRef = useRef<string>(decodeContent(content));
	const getTextContentRef = useRef<() => string>(() => '');

	const filePathRef = useRef<string>(fileInfo.filePath || `/${fileName}`);
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

	useEffect(() => {
		return () => imageResolver.dispose();
	}, [imageResolver]);

	const projectId = useMemo(
		() => (docUrl.startsWith('yjs:') ? docUrl.slice(4) : docUrl),
		[docUrl],
	);
	const collectionName = useMemo(() => `yjs_${documentId}`, [documentId]);

	useEffect(() => {
		let cancelled = false;
		const tryResolve = () => {
			if (cancelled) return;
			const a = getAwareness(collectionName);
			if (a) setAwareness(a);
			else setTimeout(tryResolve, 100);
		};
		tryResolve();
		return () => {
			cancelled = true;
		};
	}, [collectionName, getAwareness]);

	const handleVisualReady = useCallback(
		(editor: Editor) => {
			const container = collabService.getDocContainer(
				projectId,
				collectionName,
			);
			if (!container?.doc) return;
			const strategy = createCollabStrategy();
			strategy.bind(editor, container.doc, awareness ?? undefined);
			strategyRef.current = strategy;
		},
		[projectId, collectionName, awareness],
	);

	useEffect(() => {
		if (viewMode === 'text') {
			strategyRef.current?.destroy();
			strategyRef.current = null;
		}
		return () => {
			strategyRef.current?.destroy();
			strategyRef.current = null;
		};
	}, [viewMode]);

	const handleVisualChange = useCallback(
		(md: string) => {
			markdownRef.current = md;
			strategyRef.current?.pushMarkdown(md);
			onUpdateContent(md);
		},
		[onUpdateContent],
	);

	const handleTextChange = useCallback(
		(md: string) => {
			markdownRef.current = md;
			onUpdateContent(md);
		},
		[onUpdateContent],
	);

	const isTextView = viewMode === 'text';

	const currentContent = useCallback(() => {
		if (isTextView) {
			const fromEditor = getTextContentRef.current();
			if (fromEditor) return fromEditor;
		}
		return markdownRef.current;
	}, [isTextView]);

	const handleSave = useCallback(async () => {
		if (!fileId) return;
		const toSave = currentContent();

		setIsSaving(true);
		setError(null);
		try {
			await fileStorageService.updateFileContent(fileId, toSave);
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
		try {
			const blob = new Blob([currentContent()], {
				type: 'text/markdown;charset=utf-8',
			});
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = fileName.replace(/\.(md|markdown)$/i, '') + '.md';
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			URL.revokeObjectURL(url);
		} catch (err) {
			console.error('Error exporting file:', err);
		}
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
					className={`${isTextView ? 'active' : ''}`}
					onClick={() => setViewMode(isTextView ? 'visual' : 'text')}
					title={t('Switch to {viewMode}', {
						viewMode: isTextView ? t('Visual View') : t('Text View'),
					})}
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
						disabled={isSaving}
					>
						<SaveIcon />
					</button>
				)}
				<button onClick={handleExport} title={t('Download Markdown')}>
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

				{!isTextView ? (
					<div className='milkdown-visual-pane'>
						<MilkdownEditor
							key={`visual-${fileId ?? fileName}`}
							markdown={markdownRef.current}
							editable={true}
							onChange={handleVisualChange}
							onReady={handleVisualReady}
							plugins={milkdownPlugins}
						/>
					</div>
				) : (
					<MilkdownTextPane
						key={`text-${fileId ?? fileName}`}
						docUrl={docUrl}
						documentId={documentId}
						isDocumentSelected={isDocumentSelected}
						markdown={markdownRef.current}
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
