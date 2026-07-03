// extras/viewers/tikz/TikzViewer.tsx
import { t } from '@/i18n';
import type React from 'react';
import { nanoid } from 'nanoid';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { DownloadIcon, SaveIcon } from '@/components/common/Icons';
import {
	PluginControlGroup,
	PluginHeader,
} from '@/components/common/PluginHeader';
import { usePluginFileInfo } from '@/hooks/usePluginFileInfo';
import { useSettings } from '@/hooks/useSettings';
import type { ViewerProps } from '@/plugins/PluginInterface';
import { fileStorageService } from '@/services/FileStorageService';
import type { FileNode } from '@/types/files';
import { formatFileSize } from '@/utils/fileUtils';
import './styles.css';
import { PLUGIN_NAME, PLUGIN_VERSION } from './TikzViewerPlugin';

const BASE_PATH = __BASE_PATH__;
const TIKZ_STORAGE_KEY = 'texlyre:tikz-editor:storage';

const DEFAULT_TIKZ_SOURCE = `\begin{tikzpicture}
  \draw[thick, blue] (0,0) circle (1cm);
  \node at (0,0) {TikZ};
\end{tikzpicture}
`;

type TikzColorScheme = 'light' | 'dark';

type TikzHostSettings = {
	general?: {
		colorScheme?: TikzColorScheme;
	};
};

type TikzEmbedMessage = {
	event?: string;
	action?: string;
	source?: string;
	xml?: string;
	svg?: string;
	data?: string;
	format?: string;
	fileName?: string;
	modified?: boolean;
	version?: string;
	settings?: TikzHostSettings;
	key?: string;
	value?: string;
	[key: string]: unknown;
};

const readSourceFromMessage = (message: TikzEmbedMessage): string => {
	if (typeof message.source === 'string') return message.source;
	if (typeof message.xml === 'string') return message.xml;
	return '';
};

const decodeSvgExport = (data: string): string => {
	const trimmed = data.trim();

	if (trimmed.startsWith('data:image/svg+xml;base64,')) {
		return atob(trimmed.substring('data:image/svg+xml;base64,'.length));
	}

	if (trimmed.startsWith('data:image/svg+xml,')) {
		return decodeURIComponent(trimmed.substring('data:image/svg+xml,'.length));
	}

	if (trimmed.startsWith('<svg') || trimmed.startsWith('<?xml')) {
		return data;
	}

	return atob(data);
};

const getSvgFilePath = (fileName: string): string => {
	const svgPath = /\.(tikz|pgf|tex)$/i.test(fileName)
		? fileName.replace(/\.(tikz|pgf|tex)$/i, '.svg')
		: `${fileName}.svg`;

	return svgPath.startsWith('/') ? svgPath : `/${svgPath}`;
};

const makeSvgFile = (fileName: string, svgContent: string): FileNode => {
	if (
		!svgContent.trim().startsWith('<svg') &&
		!svgContent.trim().startsWith('<?xml')
	) {
		throw new Error('TikZ editor did not return SVG markup');
	}

	const svgData = new TextEncoder().encode(svgContent);
	const svgPath = getSvgFilePath(fileName);

	return {
		id: nanoid(),
		name: svgPath.split('/').pop() || 'diagram.svg',
		path: svgPath,
		type: 'file',
		content: svgData.buffer,
		lastModified: Date.now(),
		size: svgData.byteLength,
		isBinary: false,
		mimeType: 'image/svg+xml',
		isDeleted: false,
	};
};

const TikzViewer: React.FC<ViewerProps> = ({ content, fileName, fileId }) => {
	const { getSetting } = useSettings();
	const fileInfo = usePluginFileInfo(fileId, fileName);

	const autoSaveEditor =
		(getSetting('tikz-viewer-auto-save-editor')?.value as boolean) ?? true;
	const autoSaveFile =
		(getSetting('tikz-viewer-auto-save-file')?.value as boolean) ?? true;

	const [isLoading, setIsLoading] = useState(true);
	const [isSaving, setIsSaving] = useState(false);
	const [hasChanges, setHasChanges] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [tikzSource, setTikzSource] = useState('');
	const [iframeLoaded, setIframeLoaded] = useState(false);
	const [showSaveIndicator, setShowSaveIndicator] = useState(false);
	const [tikzColorScheme, setTikzColorScheme] =
		useState<TikzColorScheme>('light');

	const iframeRef = useRef<HTMLIFrameElement>(null);
	const sourceRef = useRef('');
	const messageQueueRef = useRef<TikzEmbedMessage[]>([]);
	const pendingSaveRef = useRef(false);
	const pendingExportRef = useRef<{
		format: string;
		resolve: (data: string) => void;
		reject: (error: Error) => void;
	} | null>(null);
	const saveIndicatorTimerRef = useRef<number | null>(null);

	const baseUrl = `${BASE_PATH}/core/tikz-editor`;
	const tikzOrigin = useMemo(
		() => new URL(baseUrl, window.location.origin).origin,
		[baseUrl],
	);
	const embedUrl = useMemo(() => {
		const storage = window.localStorage.getItem(TIKZ_STORAGE_KEY);
		return `${baseUrl}/index.html${storage ? `#storage=${encodeURIComponent(storage)}` : ''}`;
	}, [baseUrl]);
	const tikzHostSettings = useMemo<TikzHostSettings>(
		() => ({ general: { colorScheme: tikzColorScheme } }),
		[tikzColorScheme],
	);

	useEffect(() => {
		return () => {
			if (saveIndicatorTimerRef.current) {
				window.clearTimeout(saveIndicatorTimerRef.current);
				saveIndicatorTimerRef.current = null;
			}
		};
	}, []);

	useEffect(() => {
		setIframeLoaded(false);
		messageQueueRef.current = [];
		pendingSaveRef.current = false;
		pendingExportRef.current = null;
	}, []);

	useEffect(() => {
		if (!(content instanceof ArrayBuffer)) {
			setIsLoading(false);
			setError(t('Invalid content format'));
			return;
		}

		try {
			const decoder = new TextDecoder('utf-8');
			let text = decoder.decode(content);
			if (!text.trim()) text = DEFAULT_TIKZ_SOURCE;

			sourceRef.current = text;
			setTikzSource(text);
			setHasChanges(false);
			setIsLoading(false);
			setError(null);
		} catch (error) {
			console.error('Error decoding TikZ content:', error);
			setError(
				t('Failed to decode file content: {error}', {
					error: error instanceof Error ? error.message : String(error),
				}),
			);
			setIsLoading(false);
		}
	}, [content]);

	const flashSavedIndicator = useCallback(() => {
		setShowSaveIndicator(true);
		if (saveIndicatorTimerRef.current) {
			window.clearTimeout(saveIndicatorTimerRef.current);
		}
		saveIndicatorTimerRef.current = window.setTimeout(() => {
			setShowSaveIndicator(false);
			saveIndicatorTimerRef.current = null;
		}, 1000);
	}, []);

	const sendMessageToTikz = useCallback(
		(message: TikzEmbedMessage) => {
			if (iframeLoaded && iframeRef.current?.contentWindow) {
				iframeRef.current.contentWindow.postMessage(
					JSON.stringify(message),
					tikzOrigin,
				);
			} else {
				messageQueueRef.current.push(message);
			}
		},
		[iframeLoaded, tikzOrigin],
	);

	useEffect(() => {
		if (!iframeLoaded) return;
		sendMessageToTikz({ action: 'settings', settings: tikzHostSettings });
	}, [iframeLoaded, sendMessageToTikz, tikzHostSettings]);

	const handleSave = useCallback(
		async (sourceToSave?: string) => {
			if (!fileId) return;
			const source = sourceToSave ?? sourceRef.current;
			if (!source.trim()) return;

			setIsSaving(true);
			setError(null);
			try {
				const dataToSave = new TextEncoder().encode(source);
				await fileStorageService.updateFileContent(fileId, dataToSave.buffer);
				sourceRef.current = source;
				setTikzSource(source);
				setHasChanges(false);
				sendMessageToTikz({ action: 'status', modified: false });
				flashSavedIndicator();
			} catch (error) {
				console.error('Error saving TikZ file:', error);
				setError(
					t('Failed to save file: {error}', {
						error: error instanceof Error ? error.message : t('Unknown error'),
					}),
				);
			} finally {
				setIsSaving(false);
			}
		},
		[fileId, sendMessageToTikz, flashSavedIndicator],
	);

	const handleMessage = useCallback(
		(event: MessageEvent) => {
			if (event.origin !== tikzOrigin) return;
			if (typeof event.data !== 'string') return;

			try {
				const message = JSON.parse(event.data) as TikzEmbedMessage;
				if (
					message.event === 'persistence-save' &&
					typeof message.key === 'string' &&
					typeof message.value === 'string'
				) {
					const storage = JSON.parse(window.localStorage.getItem(TIKZ_STORAGE_KEY) || '{}') as Record<string, string>;
					storage[message.key] = message.value;
					window.localStorage.setItem(TIKZ_STORAGE_KEY, JSON.stringify(storage));
					return;
				}
				if (message.error) {
					if (pendingExportRef.current) {
						pendingExportRef.current.reject(new Error(String(message.error)));
						pendingExportRef.current = null;
					}
					console.warn('TikZ editor embed error:', message.error, message);
					return;
				}

				if (message.event === 'init') {
					setIframeLoaded(true);
					sendMessageToTikz({
						action: 'load',
						source: sourceRef.current || tikzSource || DEFAULT_TIKZ_SOURCE,
						xml: sourceRef.current || tikzSource || DEFAULT_TIKZ_SOURCE,
						autosave: autoSaveEditor ? 1 : 0,
						fileName,
						settings: tikzHostSettings,
					});

					while (messageQueueRef.current.length > 0) {
						const queuedMessage = messageQueueRef.current.shift();
						if (queuedMessage && iframeRef.current?.contentWindow) {
							iframeRef.current.contentWindow.postMessage(
								JSON.stringify(queuedMessage),
								tikzOrigin,
							);
						}
					}
					return;
				}

				if (message.event === 'loaded') {
					setIframeLoaded(true);
					return;
				}

				if (
					message.event === 'change' ||
					message.event === 'autosave' ||
					message.event === 'save'
				) {
					const source = readSourceFromMessage(message);
					if (source.trim()) {
						sourceRef.current = source;
						setTikzSource(source);
						setHasChanges(true);
					}

					if (
						(message.event === 'autosave' && autoSaveFile && fileId) ||
						(message.event === 'save' && pendingSaveRef.current && fileId)
					) {
						pendingSaveRef.current = false;
						handleSave(source);
					}
					return;
				}

				if (message.event === 'export') {
					if (pendingSaveRef.current && fileId) {
						pendingSaveRef.current = false;
						const source = readSourceFromMessage(message);
						if (source.trim()) handleSave(source);
						return;
					}

					if (pendingExportRef.current) {
						pendingExportRef.current.resolve(
							typeof message.data === 'string'
								? message.data
								: typeof message.svg === 'string'
									? message.svg
									: readSourceFromMessage(message),
						);
						pendingExportRef.current = null;
					}
				}
			} catch (error) {
				console.error('Error handling message from TikZ editor:', error);
			}
		},
		[
			tikzOrigin,
			sendMessageToTikz,
			tikzSource,
			autoSaveEditor,
			autoSaveFile,
			fileId,
			fileName,
			handleSave,
			tikzHostSettings,
		],
	);

	useEffect(() => {
		window.addEventListener('message', handleMessage);
		return () => window.removeEventListener('message', handleMessage);
	}, [handleMessage]);

	const handleIframeLoad = useCallback(() => {
		setTimeout(() => setIframeLoaded(true), 50);
	}, []);

	const requestExport = useCallback(
		(format: 'svg' | 'tex' | 'tikz'): Promise<string> => {
			if (!iframeLoaded) {
				return Promise.reject(new Error(t('TikZ editor not loaded yet')));
			}
			return new Promise<string>((resolve, reject) => {
				pendingExportRef.current = { format, resolve, reject };
				window.setTimeout(() => {
					if (pendingExportRef.current) {
						pendingExportRef.current = null;
						reject(new Error('Export timeout'));
					}
				}, 30000);
				sendMessageToTikz({ action: 'export', format });
			});
		},
		[iframeLoaded, sendMessageToTikz],
	);

	const handleDownloadSource = useCallback(() => {
		try {
			const blob = new Blob([tikzSource], { type: 'text/x-tex;charset=utf-8' });
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = fileName;
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			URL.revokeObjectURL(url);
		} catch (error) {
			console.error('Error downloading TikZ file:', error);
			setError(
				t('Failed to download file: {error}', {
					error: error instanceof Error ? error.message : t('Unknown error'),
				}),
			);
		}
	}, [tikzSource, fileName]);

	const handleSaveSvg = useCallback(async () => {
		try {
			const exported = await requestExport('svg');
			const svgContent = decodeSvgExport(exported);
			await fileStorageService.storeFile(makeSvgFile(fileName, svgContent));
			flashSavedIndicator();
		} catch (error) {
			console.error('Error saving SVG:', error);
			setError(error instanceof Error ? error.message : String(error));
		}
	}, [requestExport, fileName, flashSavedIndicator]);

	const handleManualSave = useCallback(() => {
		pendingSaveRef.current = true;
		sendMessageToTikz({ action: 'save' });
	}, [sendMessageToTikz]);

	const handleToggleTikzTheme = useCallback(() => {
		setTikzColorScheme((scheme) => (scheme === 'light' ? 'dark' : 'light'));
	}, []);

	const tooltipInfo = [
		t('Auto-save editor: {status}', {
			status: autoSaveEditor ? t('enabled') : t('disabled'),
		}),
		t('Auto-save file: {status}', {
			status: autoSaveFile ? t('enabled') : t('disabled'),
		}),
		t('TikZ theme: {theme}', { theme: t(tikzColorScheme) }),
		t('MIME Type: {mimeType}', {
			mimeType: fileInfo.mimeType || 'text/x-tex',
		}),
		t('Size: {size}', { size: formatFileSize(fileInfo.fileSize) }),
	];

	const headerControls = (
		<>
			<PluginControlGroup>
				{fileId && (
					<button
						onClick={handleManualSave}
						title={t('Save File (Ctrl+S)')}
						disabled={isSaving || !iframeLoaded}
						className={hasChanges ? 'active' : ''}
					>
						<SaveIcon />
					</button>
				)}
				<button
					onClick={handleDownloadSource}
					title={t('Download TikZ source')}
					disabled={!iframeLoaded}
				>
					<DownloadIcon />
				</button>
				<button
					onClick={handleSaveSvg}
					title={t('Save as SVG')}
					disabled={!iframeLoaded}
				>
					SVG
				</button>
				<button
					onClick={handleToggleTikzTheme}
					title={t('Toggle TikZ editor theme')}
					disabled={!iframeLoaded}
				>
					{tikzColorScheme === 'light' ? t('Dark') : t('Light')}
				</button>
			</PluginControlGroup>
		</>
	);

	return (
		<div className='tikz-viewer-container'>
			<PluginHeader
				fileName={fileInfo.fileName}
				filePath={fileInfo.filePath}
				pluginName={PLUGIN_NAME}
				pluginVersion={PLUGIN_VERSION}
				tooltipInfo={tooltipInfo}
				controls={headerControls}
			/>

			<div className='tikz-viewer-content'>
				{error && (
					<div className='tikz-error-message error-message'>{error}</div>
				)}
				{isLoading && (
					<div className='loading-indicator'>{t('Loading TikZ editor...')}</div>
				)}
				{!isLoading && !error && (
					<>
						{!iframeLoaded && (
							<div className='tikz-splash-screen'>
								<div className='tikz-spinner' />
								<p>{t('Loading TikZ editor...')}</p>
							</div>
						)}
						<iframe
							key={fileId ?? fileName}
							ref={iframeRef}
							src={embedUrl}
							className='tikz-iframe'
							title={fileName}
							onLoad={handleIframeLoad}
							sandbox='allow-same-origin allow-scripts allow-forms allow-popups allow-modals allow-downloads allow-popups-to-escape-sandbox'
							allow='clipboard-read; clipboard-write'
						/>
					</>
				)}
				{showSaveIndicator && (
					<div className='save-indicator'>
						<span>{t('Saved')}</span>
					</div>
				)}
			</div>
		</div>
	);
};

export default TikzViewer;
