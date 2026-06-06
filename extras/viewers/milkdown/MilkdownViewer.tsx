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
import { createMilkdownPasteHandler } from './toolbar/pasteUpload';
import './styles.css';
import { PLUGIN_NAME, PLUGIN_VERSION } from './MilkdownViewerPlugin';

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

	const [markdown, setMarkdown] = useState('');
	const [viewMode, setViewMode] = useState<'visual' | 'text'>(defaultView);
	const [isSaving, setIsSaving] = useState(false);
	const [isLoadingContent, setIsLoadingContent] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const markdownRef = useRef('');
	const getTextContentRef = useRef<() => string>(() => '');
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

	useEffect(() => {
		if (isProbablyStaleLargeContent(content)) {
			setIsLoadingContent(true);
			return;
		}

		const text = decodeContent(content);

		setMarkdown(text);
		markdownRef.current = text;
		setIsLoadingContent(false);
		setError(null);
	}, [content]);

	const handleChange = useCallback((md: string) => {
		setMarkdown(md);
		markdownRef.current = md;
	}, []);

	const getCurrentContent = useCallback(() => {
		if (viewMode !== 'text') return markdownRef.current;
		return getTextContentRef.current() || markdownRef.current;
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

		setIsSaving(true);
		setError(null);

		try {
			const bytes = new TextEncoder().encode(getCurrentContent()).buffer;
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
	}, [fileId, getCurrentContent]);

	const handleExport = () => {
		const url = URL.createObjectURL(
			new Blob([getCurrentContent()], {
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
		t('Size: {size}', {
			size: formatFileSize(fileInfo.fileSize),
		}),
	];

	const headerControls = (
		<>
			<PluginControlGroup>
				<button
					className={viewMode === 'text' ? 'active' : ''}
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
			/>

			<div className='milkdown-viewer-content'>
				{error && (
					<div className='milkdown-error-message error-message'>{error}</div>
				)}

				{isLoadingContent ? (
					<div className='milkdown-loading-message'>
						{t('Loading Markdown…')}
					</div>
				) : viewMode === 'visual' ? (
					<div className='milkdown-visual-pane'>
						<MilkdownEditor
							key={`visual-${fileId ?? fileName}`}
							markdown={markdown}
							editable={true}
							onChange={handleChange}
							plugins={milkdownPlugins}
							syncExternalChanges={true}
							onPaste={handlePaste}
						/>
					</div>
				) : (
					<MilkdownTextPane
						key={`text-${fileId ?? fileName}`}
						docUrl='milkdown-viewer'
						documentId={`${fileName}-markdown-editor`}
						isDocumentSelected={true}
						markdown={markdown}
						onChange={handleChange}
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
