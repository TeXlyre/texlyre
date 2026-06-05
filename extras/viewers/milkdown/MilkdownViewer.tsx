// extras/viewers/milkdown/MilkdownViewer.tsx
import { t } from '@/i18n';
import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { DownloadIcon, SaveIcon, ViewIcon } from '@/components/common/Icons';
import {
	PluginControlGroup,
	PluginHeader,
} from '@/components/common/PluginHeader';
import { usePluginFileInfo } from '@/hooks/usePluginFileInfo';
import { useSettings } from '@/hooks/useSettings';
import type { ViewerProps } from '@/plugins/PluginInterface';
import { fileStorageService } from '@/services/FileStorageService';
import { formatFileSize } from '@/utils/fileUtils';
import MilkdownEditor from './MilkdownEditor';
import MilkdownTextPane from './MilkdownTextPane';
import { createImageResolver } from './imageResolver';
import './styles.css';
import { PLUGIN_NAME, PLUGIN_VERSION } from './MilkdownViewerPlugin';

const decodeContent = (content: string | ArrayBuffer): string => {
	if (content instanceof ArrayBuffer) {
		return new TextDecoder('utf-8').decode(content);
	}
	return typeof content === 'string' ? content : '';
};

const MilkdownViewer: React.FC<ViewerProps> = ({
	content,
	fileName,
	fileId,
}) => {
	const { getSetting } = useSettings();
	const fileInfo = usePluginFileInfo(fileId, fileName);

	const defaultView =
		(getSetting('milkdown-viewer-default-view')?.value as 'visual' | 'text') ??
		'visual';

	const [markdown, setMarkdown] = useState<string>('');
	const [viewMode, setViewMode] = useState<'visual' | 'text'>(defaultView);
	const [isSaving, setIsSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const markdownRef = useRef<string>('');
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

	useEffect(() => {
		const text = decodeContent(content);
		setMarkdown(text);
		markdownRef.current = text;
		setError(null);
	}, [content]);

	const handleVisualChange = useCallback((md: string) => {
		setMarkdown(md);
		markdownRef.current = md;
	}, []);

	const handleTextChange = useCallback((md: string) => {
		setMarkdown(md);
		markdownRef.current = md;
	}, []);

	const currentContent = useCallback(() => {
		if (viewMode === 'text') {
			const fromEditor = getTextContentRef.current();
			if (fromEditor) return fromEditor;
		}
		return markdownRef.current;
	}, [viewMode]);

	const switchView = (next: 'visual' | 'text') => {
		if (next === viewMode) return;
		if (viewMode === 'text') {
			const current = getTextContentRef.current();
			if (current) {
				setMarkdown(current);
				markdownRef.current = current;
			}
		}
		setViewMode(next);
	};

	const handleSave = useCallback(async () => {
		if (!fileId) return;
		const toSave = currentContent();

		setIsSaving(true);
		setError(null);
		try {
			const encoder = new TextEncoder();
			await fileStorageService.updateFileContent(
				fileId,
				encoder.encode(toSave).buffer,
			);
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

	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.ctrlKey && event.key === 's' && viewMode === 'visual') {
				event.preventDefault();
				handleSave();
			}
		};
		document.addEventListener('keydown', handleKeyDown);
		return () => document.removeEventListener('keydown', handleKeyDown);
	}, [viewMode, handleSave]);

	const tooltipInfo = [
		t('MIME Type: {mimeType}', {
			mimeType: fileInfo.mimeType || 'text/markdown',
		}),
		t('Size: {size}', { size: formatFileSize(fileInfo.fileSize) }),
	];

	const headerControls = (
		<>
			<PluginControlGroup>
				<button
					className={`${viewMode === 'text' ? 'active' : ''}`}
					onClick={() => switchView(viewMode === 'visual' ? 'text' : 'visual')}
					title={t('Switch to {viewMode}', {
						viewMode: viewMode === 'visual' ? t('Text View') : t('Visual View'),
					})}
				>
					<ViewIcon />
				</button>
			</PluginControlGroup>

			<PluginControlGroup>
				{fileId && (
					<button
						onClick={() => {
							if (viewMode === 'text') {
								document.dispatchEvent(
									new CustomEvent('trigger-save', {
										detail: { fileId, isFile: true },
									}),
								);
							} else {
								handleSave();
							}
						}}
						title={t('Save File (Ctrl+S)')}
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
			/>

			<div className='milkdown-viewer-content'>
				{error && (
					<div className='milkdown-error-message error-message'>{error}</div>
				)}

				{viewMode === 'visual' ? (
					<div className='milkdown-visual-pane'>
						<MilkdownEditor
							key={`visual-${fileId ?? fileName}`}
							markdown={markdown}
							editable={true}
							onChange={handleVisualChange}
							plugins={milkdownPlugins}
							syncExternalChanges={true}
						/>
					</div>
				) : (
					<MilkdownTextPane
						key={`text-${fileId ?? fileName}`}
						docUrl='milkdown-viewer'
						documentId={`${fileName}-markdown-editor`}
						isDocumentSelected={true}
						markdown={markdown}
						onChange={handleTextChange}
						fileName={fileName}
						fileId={fileId}
						isEditingFile={true}
						registerView={(getContent) => {
							getTextContentRef.current = getContent;
						}}
					/>
				)}
			</div>
		</div>
	);
};

export default MilkdownViewer;
