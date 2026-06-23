// extras/viewers/milkdown/MilkdownViewer.tsx
import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import '@milkdown/crepe/theme/common/style.css';
import 'katex/dist/katex.min.css';

import { t } from '@/i18n';
import {
	DownloadIcon,
	SaveIcon,
	CopyIcon,
	ToolbarShowIcon,
	EditingViewIcon,
} from '@/components/common/Icons';
import {
	PluginControlGroup,
	PluginHeader,
} from '@/components/common/PluginHeader';
import { usePluginFileInfo } from '@/hooks/usePluginFileInfo';
import { useSettings } from '@/hooks/useSettings';
import { useProperties } from '@/hooks/useProperties';
import type { ViewerProps } from '@/plugins/PluginInterface';
import { autoSaveService } from '@/services/AutoSaveService';
import { fileStorageService } from '@/services/FileStorageService';
import { formatFileSize } from '@/utils/fileUtils';
import { copyCleanTextToClipboard } from '@/utils/clipboardUtils';
import type { HighlightTheme } from '@/types/editor';
import MilkdownEditor from './MilkdownEditor';
import MilkdownTextPane from './MilkdownTextPane';
import { createImageResolver } from './imageResolver';
import { createMilkdownPasteHandler } from './toolbar/pasteUpload';
import { getEnabledMilkdownPluginIds } from './settings';
import { PLUGIN_NAME, PLUGIN_VERSION } from './MilkdownViewerPlugin';
import './styles.css';

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
	const { getProperty, setProperty, registerProperty } = useProperties();
	const fileInfo = usePluginFileInfo(fileId, fileName);

	const [markdown, setMarkdown] = useState('');
	const [viewMode, setViewMode] = useState<'visual' | 'text'>('visual');
	const [showToolbar, setShowToolbar] = useState(true);
	const [isSaving, setIsSaving] = useState(false);
	const [isLoadingContent, setIsLoadingContent] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const markdownRef = useRef('');
	const getTextContentRef = useRef<() => string>(() => '');
	const filePathRef = useRef(fileInfo.filePath || `/${fileName}`);
	const propertiesRegistered = useRef(false);

	const autoSaveEnabled =
		(getSetting('editor-auto-save-enable')?.value as boolean) ?? false;
	const autoSaveDelay =
		(getSetting('editor-auto-save-delay')?.value as number) ?? 2000;

	const autoSaveRef = useRef<(() => void) | null>(null);

	const enabledPluginIds = useMemo(
		() => getEnabledMilkdownPluginIds(getSetting),
		[getSetting],
	);

	const textDirection =
		(getSetting('milkdown-text-direction')?.value as 'auto' | 'ltr' | 'rtl') ??
		'auto';
	const highlightTheme =
		(getSetting('editor-theme-highlights')?.value as HighlightTheme) ?? 'auto';

	/* biome-ignore lint/correctness/useExhaustiveDependencies: One-time registration guarded by ref. */
	useEffect(() => {
		if (propertiesRegistered.current) return;
		propertiesRegistered.current = true;

		// const currentProjectId = sessionStorage.getItem('currentProjectId');

		registerProperty({
			id: 'milkdown-default-view',
			category: 'Viewers',
			subcategory: 'Markdown Editor',
			defaultValue: 'visual',
		});
		const savedView = getProperty('milkdown-default-view', {
			scope: 'global',
			// projectId: currentProjectId ?? undefined,
		});
		if (savedView === 'visual' || savedView === 'text') setViewMode(savedView);

		// registerProperty({
		// 	id: 'milkdown-toolbar-visible',
		// 	category: 'Viewers',
		// 	subcategory: 'Markdown Editor',
		// 	defaultValue: true,
		// });
		const savedToolbar = getProperty('toolbar-visible', {
			scope: 'global',
			// projectId: currentProjectId ?? undefined,
		});
		if (typeof savedToolbar === 'boolean') setShowToolbar(savedToolbar);
	}, []);

	useEffect(() => {
		filePathRef.current = fileInfo.filePath || `/${fileName}`;
	}, [fileInfo.filePath, fileName]);

	const imageResolver = useMemo(
		() => createImageResolver(() => filePathRef.current),
		[],
	);

	const milkdownPlugins = useMemo(
		() =>
			enabledPluginIds.has('image-resolver') ? [imageResolver.plugin] : [],
		[imageResolver, enabledPluginIds],
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
		setProperty('milkdown-default-view', next, {
			scope: 'global',
		});
	};

	const toggleToolbar = () => {
		const next = !showToolbar;
		setShowToolbar(next);
		setProperty('toolbar-visible', next, {
			scope: 'global',
		});
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
		a.download = `${fileName.replace(/\.(md|markdown)$/i, '')}.md`;

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

	useEffect(() => {
		if (!fileId) return;

		const saveFileId = fileId;

		autoSaveRef.current = autoSaveService.createAutoSaver(
			saveFileId,
			() => getCurrentContent(),
			{
				enabled: autoSaveEnabled,
				delay: autoSaveDelay,
				onSave: async (_saveKey, content) => {
					if (!content) return;
					const bytes = new TextEncoder().encode(content).buffer;
					await fileStorageService.updateFileContent(saveFileId, bytes);
				},
				onError: (error) => console.error('Auto-save failed:', error),
			},
		);

		return () => {
			autoSaveService.clearAutoSaver(saveFileId);
			autoSaveRef.current = null;
		};
	}, [fileId, autoSaveEnabled, autoSaveDelay, getCurrentContent]);

	/* biome-ignore lint/correctness/useExhaustiveDependencies: markdown is the change trigger and not read in body */
	useEffect(() => {
		autoSaveRef.current?.();
	}, [markdown]);

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
					className={showToolbar ? 'active' : ''}
					onClick={toggleToolbar}
					title={showToolbar ? t('Hide Toolbar') : t('Show Toolbar')}
				>
					<ToolbarShowIcon />
				</button>
				<button
					className={viewMode === 'text' ? 'active' : ''}
					onClick={() => switchView(viewMode === 'visual' ? 'text' : 'visual')}
					title={t('Switch to {viewMode}', {
						viewMode: viewMode === 'visual' ? t('Text View') : t('Visual View'),
					})}
				>
					<EditingViewIcon />
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
					onClick={() => copyCleanTextToClipboard(getCurrentContent())}
					title={t('Copy Text')}
					disabled={isLoadingContent}
				>
					<CopyIcon />
				</button>

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
							key={`visual-${fileId ?? fileName}-${highlightTheme}`}
							markdown={markdown}
							editable={true}
							onChange={handleChange}
							plugins={milkdownPlugins}
							syncExternalChanges={true}
							showToolbar={showToolbar}
							enabledPlugins={enabledPluginIds}
							onPaste={handlePaste}
							getCurrentFilePath={() => filePathRef.current}
							textDirection={textDirection}
							highlightTheme={highlightTheme}
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
