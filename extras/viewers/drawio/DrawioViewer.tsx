import { t } from '@/i18n';
import type React from 'react';
import { useEffect, useRef, useState, useCallback, useMemo } from 'react';

import { DownloadIcon, SaveIcon } from '@/components/common/Icons';
import { PluginControlGroup, PluginHeader } from '@/components/common/PluginHeader';
import { usePluginFileInfo } from '@/hooks/usePluginFileInfo';
import { useSettings } from '@/hooks/useSettings';
import type { ViewerProps } from '@/plugins/PluginInterface';
import { fileStorageService } from '@/services/FileStorageService';
import { formatFileSize } from '@/utils/fileUtils';
import './styles.css';
import { PLUGIN_NAME, PLUGIN_VERSION } from './DrawioViewerPlugin';
import DrawioPngExportButton from './DrawioPngExportButton';
import DrawioSvgExportButton from './DrawioSvgExportButton';

type DrawioSource = 'cdn' | 'github';

const DrawioViewer: React.FC<ViewerProps> = ({ content, fileName, fileId }) => {
    const { getSetting } = useSettings();
    const fileInfo = usePluginFileInfo(fileId, fileName);

    const autoSave = (getSetting('drawio-viewer-auto-save')?.value as boolean) ?? false;
    const autoSaveFile = (getSetting('drawio-viewer-auto-save-file')?.value as boolean) ?? false;
    const theme = (getSetting('drawio-viewer-theme')?.value as 'auto' | 'light' | 'dark') ?? 'auto';
    const source = (getSetting('drawio-viewer-source')?.value as DrawioSource) ?? 'cdn';
    const cdnBaseUrl = (getSetting('drawio-viewer-cdn-base-url')?.value as string) ?? 'https://embed.diagrams.net';
    const githubBaseUrl =
        (getSetting('drawio-viewer-github-base-url')?.value as string) ?? 'https://texlyre.github.io/drawio-embed-mirror';

    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [hasChanges, setHasChanges] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [drawioContent, setDrawioContent] = useState<string>('');
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const [iframeLoaded, setIframeLoaded] = useState(false);
    const [showSaveIndicator, setShowSaveIndicator] = useState(false);

    const iframeRef = useRef<HTMLIFrameElement>(null);
    const originalContentRef = useRef<string>('');
    const messageQueueRef = useRef<any[]>([]);
    const pendingExportRef = useRef<{ format: string; resolve: (data: string) => void } | null>(null);
    const pendingSaveRef = useRef<boolean>(false);
    const saveIndicatorTimerRef = useRef<number | null>(null);

    const getThemeParam = useCallback(() => {
        if (theme === 'auto') {
            return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        }
        return theme;
    }, [theme]);

    const resolvedTheme = useMemo(() => getThemeParam(), [getThemeParam]);
    const uiParam = useMemo(() => (resolvedTheme === 'dark' ? 'dark' : 'kennedy'), [resolvedTheme]);

    const baseUrl = useMemo(() => (source === 'github' ? githubBaseUrl : cdnBaseUrl), [source, githubBaseUrl, cdnBaseUrl]);
    const drawioOrigin = useMemo(() => new URL(baseUrl).origin, [baseUrl]);

    const embedUrl = useMemo(() => {
        if (source === 'github') {
            const params =
                `embed=1&proto=json&spin=1&libraries=1&saveAndExit=0&noSaveBtn=1&noExitBtn=1` +
                `&db=0&od=0&gapi=0&tr=0&gh=0&gl=0&stealth=1&offline=1&ui=${encodeURIComponent(uiParam)}`;
            return `${baseUrl}/${resolvedTheme}/app.html?${params}`;
        }

        return (
            `${baseUrl}/?embed=1&proto=json&spin=1&libraries=1&saveAndExit=0&noSaveBtn=1&noExitBtn=1` +
            `&db=0&od=0&gapi=0&tr=0&gh=0&gl=0&stealth=1&ui=${encodeURIComponent(uiParam)}`
        );
    }, [source, baseUrl, resolvedTheme, uiParam]);

    useEffect(() => {
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

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
        pendingExportRef.current = null;
        pendingSaveRef.current = false;
    }, [embedUrl]);

    useEffect(() => {
        if (!(content instanceof ArrayBuffer)) {
            setIsLoading(false);
            setError(t('Invalid content format'));
            return;
        }

        try {
            const decoder = new TextDecoder('utf-8');
            let text = decoder.decode(content);

            if (!text.trim()) {
                text = `<?xml version="1.0" encoding="UTF-8"?>
<mxfile host="app.diagrams.net" modified="${new Date().toISOString()}" agent="TeXlyre" version="1.0.0" type="device">
  <diagram name="Page-1" id="page-1">
    <mxGraphModel dx="1422" dy="794" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="827" pageHeight="1169" math="0" shadow="0">
      <root>
        <mxCell id="0" />
        <mxCell id="1" parent="0" />
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>`;
            }

            setDrawioContent(text);
            originalContentRef.current = text;
            setIsLoading(false);
            setError(null);
        } catch (err) {
            console.error('Error decoding Draw.io content:', err);
            setError(t('Failed to decode file content'));
            setIsLoading(false);
        }
    }, [content, t]);

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

    const sendMessageToDrawio = useCallback(
        (message: any) => {
            if (iframeLoaded && iframeRef.current?.contentWindow) {
                console.log('Sending message to draw.io:', message);
                iframeRef.current.contentWindow.postMessage(JSON.stringify(message), drawioOrigin);
            } else {
                messageQueueRef.current.push(message);
            }
        },
        [iframeLoaded, drawioOrigin]
    );

    const triggerSaveInDrawio = () => {
        if (!fileId || !iframeLoaded) return;

        pendingSaveRef.current = true;

        sendMessageToDrawio({
            action: 'export',
            format: 'xml'
        });
    };

    const handleSave = async (contentToSave?: string) => {
        if (!fileId) return;

        const content = contentToSave || drawioContent;
        if (!content.trim()) {
            console.warn('Attempted to save empty content');
            return;
        }

        setIsSaving(true);
        setError(null);

        try {
            const encoder = new TextEncoder();
            const dataToSave = encoder.encode(content);

            await fileStorageService.updateFileContent(fileId, dataToSave.buffer);

            originalContentRef.current = content;
            setHasChanges(false);

            sendMessageToDrawio({ action: 'status', modified: false });
            flashSavedIndicator();
        } catch (err) {
            console.error('Error saving Draw.io file:', err);
            setError(`Failed to save file: ${err instanceof Error ? err.message : 'Unknown error'}`);
        } finally {
            setIsSaving(false);
        }
    };

    const handleMessage = useCallback(
        (event: MessageEvent) => {
            if (event.origin !== drawioOrigin) return;
            if (typeof event.data !== 'string') return;

            try {
                const message = JSON.parse(event.data);

                if (message.error) {
                    console.warn('Draw.io embed error:', message.error, message);
                    return;
                }

                console.log('Received message from draw.io:', message.event);

                if (message.event === 'init') {
                    setIframeLoaded(true);

                    sendMessageToDrawio({
                        action: 'load',
                        xml: drawioContent,
                        autosave: autoSave ? 1 : 0
                    });

                    while (messageQueueRef.current.length > 0) {
                        const queuedMessage = messageQueueRef.current.shift();
                        if (iframeRef.current?.contentWindow) {
                            iframeRef.current.contentWindow.postMessage(JSON.stringify(queuedMessage), drawioOrigin);
                        }
                    }
                    return;
                }

                if (message.event === 'save') {
                    console.log('Save event received, XML length:', message.xml?.length);

                    setDrawioContent(message.xml);
                    setHasChanges(true);

                    if (pendingSaveRef.current && fileId) {
                        pendingSaveRef.current = false;
                        handleSave(message.xml);
                    } else if (autoSaveFile && fileId) {
                        handleSave(message.xml);
                    }

                    sendMessageToDrawio({ action: 'status', modified: false });
                    return;
                }

                if (message.event === 'autosave') {
                    console.log('Autosave event received, XML length:', message.xml?.length);

                    setDrawioContent(message.xml);
                    setHasChanges(true);

                    if (autoSaveFile && fileId) {
                        handleSave(message.xml);
                    }
                    return;
                }

                if (message.event === 'export') {
                    console.log(
                        'Export event received, format:',
                        message.format,
                        'data length:',
                        message.data?.length,
                        'xml length:',
                        message.xml?.length
                    );

                    if (pendingSaveRef.current && fileId) {
                        pendingSaveRef.current = false;

                        const xml = typeof message.xml === 'string' ? message.xml : '';
                        if (xml.trim()) {
                            setDrawioContent(xml);
                            setHasChanges(true);
                            handleSave(xml);
                            sendMessageToDrawio({ action: 'status', modified: false });
                        } else {
                            console.warn('Export did not include XML; cannot save to file.', message);
                            setError(t('Export did not include XML'));
                        }

                        return;
                    }

                    if (pendingExportRef.current) {
                        pendingExportRef.current.resolve(message.data);
                        pendingExportRef.current = null;
                    }
                    return;
                }

                if (message.event === 'configure') {
                    sendMessageToDrawio({
                        action: 'configure',
                        config: {
                            defaultFonts: [
                                'Helvetica',
                                'Verdana',
                                'Times New Roman',
                                'Garamond',
                                'Comic Sans MS',
                                'Courier New',
                                'Georgia',
                                'Lucida Console',
                                'Tahoma'
                            ]
                        }
                    });
                    return;
                }
            } catch (err) {
                console.error('Error handling message from draw.io:', err);
            }
        },
        [drawioOrigin, drawioContent, autoSave, autoSaveFile, fileId, sendMessageToDrawio, handleSave, t]
    );

    useEffect(() => {
        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, [handleMessage]);

    const handleExport = useCallback(
        async (options: any): Promise<string> => {
            if (!iframeLoaded) {
                throw new Error(t('Draw.io editor not loaded yet'));
            }

            return new Promise<string>((resolve, reject) => {
                pendingExportRef.current = { format: options.format, resolve };

                setTimeout(() => {
                    if (pendingExportRef.current) {
                        pendingExportRef.current = null;
                        reject(new Error('Export timeout'));
                    }
                }, 30000);

                const exportMessage: Record<string, any> = {
                    action: 'export',
                    format: options.format
                };

                if (options.border !== undefined) exportMessage.border = options.border;
                if (options.scale !== undefined) exportMessage.scale = options.scale;
                if (options.transparent !== undefined) exportMessage.transparent = options.transparent;
                if (options.background !== undefined) exportMessage.background = options.background;
                if (options.shadow !== undefined) exportMessage.shadow = options.shadow;
                if (options.grid !== undefined) exportMessage.grid = options.grid;

                console.log('Sending export message to draw.io:', exportMessage);
                sendMessageToDrawio(exportMessage);
            });
        },
        [iframeLoaded, sendMessageToDrawio, t]
    );

    const handleDownload = () => {
        try {
            const blob = new Blob([drawioContent], { type: 'application/xml' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error('Error downloading file:', err);
            setError(`Failed to download file: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
    };

    const tooltipInfo = [
        t('Source: {source}', { source: t(source) }),
        t('Status: {status}', { status: isOnline ? t('Online') : t('Offline - cached') }),
        t('Auto-save editor: {status}', { status: autoSave ? t('enabled') : t('disabled') }),
        t('Auto-save file: {status}', { status: autoSaveFile ? t('enabled') : t('disabled') }),
        t('Theme: {theme}', { theme: t(theme) }),
        t('MIME Type: {mimeType}', { mimeType: fileInfo.mimeType || 'application/vnd.jgraph.mxfile' }),
        t('Size: {size}', { size: formatFileSize(fileInfo.fileSize) })
    ];

    const headerControls = (
        <>
            <PluginControlGroup>
                {fileId && (
                    <button
                        onClick={() => {
                            pendingSaveRef.current = true;
                            triggerSaveInDrawio();
                        }}
                        title={t('Save File (Ctrl+S)')}
                        disabled={isSaving || !iframeLoaded}
                        className={hasChanges ? 'active' : ''}>
                        <SaveIcon />
                    </button>
                )}
                <button onClick={handleDownload} title={t('Download as Draw.io XML')} disabled={!iframeLoaded}>
                    <DownloadIcon />
                </button>
            </PluginControlGroup>

            <PluginControlGroup>
                <DrawioPngExportButton disabled={!iframeLoaded} fileName={fileName} onExport={handleExport} />
                <DrawioSvgExportButton disabled={!iframeLoaded} fileName={fileName} onExport={handleExport} />
            </PluginControlGroup>
        </>
    );

    return (
        <div className="drawio-viewer-container">
            <PluginHeader
                fileName={fileInfo.fileName}
                filePath={fileInfo.filePath}
                pluginName={PLUGIN_NAME}
                pluginVersion={PLUGIN_VERSION}
                tooltipInfo={tooltipInfo}
                controls={headerControls}
            />

            <div className="drawio-viewer-content">
                {error && <div className="drawio-error-message">{error}</div>}

                {!isOnline && (
                    <div className="drawio-warning-message">
                        {t('You are currently offline. Draw.io is cached and will work, but some features may be limited.')}
                    </div>
                )}

                {isLoading && <div className="loading-indicator">{t('Loading diagram...')}</div>}

                {!isLoading && !error && (
                    <iframe
                        ref={iframeRef}
                        src={embedUrl}
                        className="drawio-iframe"
                        title={fileName}
                        sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals allow-downloads allow-popups-to-escape-sandbox"
                    />
                )}

                {showSaveIndicator && (
                    <div className="save-indicator">
                        <span>{t('Saved')}</span>
                    </div>
                )}
            </div>
        </div>
    );
};

export default DrawioViewer;
