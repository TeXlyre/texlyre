import { t } from '@/i18n';
import type React from 'react';
import { useEffect, useRef, useState, useCallback } from 'react';

import {
    DownloadIcon,
    SaveIcon
} from '@/components/common/Icons';
import {
    PluginControlGroup,
    PluginHeader
} from '@/components/common/PluginHeader';
import { usePluginFileInfo } from '@/hooks/usePluginFileInfo';
import { useSettings } from '@/hooks/useSettings';
import type { ViewerProps } from '@/plugins/PluginInterface';
import { fileStorageService } from '@/services/FileStorageService';
import { formatFileSize } from '@/utils/fileUtils';
import './styles.css';
import { PLUGIN_NAME, PLUGIN_VERSION } from './DrawioViewerPlugin';

const DRAWIO_CDN = 'https://embed.diagrams.net/';

const DrawioViewer: React.FC<ViewerProps> = ({
    content,
    fileName,
    fileId
}) => {
    const { getSetting } = useSettings();
    const fileInfo = usePluginFileInfo(fileId, fileName);

    const autoSave = getSetting('drawio-viewer-auto-save')?.value as boolean ?? false;
    const theme = getSetting('drawio-viewer-theme')?.value as 'auto' | 'light' | 'dark' ?? 'auto';

    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [hasChanges, setHasChanges] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [drawioContent, setDrawioContent] = useState<string>('');
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const [iframeLoaded, setIframeLoaded] = useState(false);

    const iframeRef = useRef<HTMLIFrameElement>(null);
    const originalContentRef = useRef<string>('');
    const messageQueueRef = useRef<any[]>([]);
    const pendingExportRef = useRef<{ format: string; resolve: (data: string) => void } | null>(null);

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
    }, [content]);

    const sendMessageToDrawio = useCallback((message: any) => {
        if (iframeLoaded && iframeRef.current?.contentWindow) {
            console.log('Sending message to draw.io:', message);
            iframeRef.current.contentWindow.postMessage(JSON.stringify(message), '*');
        } else {
            messageQueueRef.current.push(message);
        }
    }, [iframeLoaded]);

    const handleMessage = useCallback((event: MessageEvent) => {
        if (typeof event.data !== 'string') return;

        try {
            const message = JSON.parse(event.data);
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
                        iframeRef.current.contentWindow.postMessage(JSON.stringify(queuedMessage), '*');
                    }
                }
            } else if (message.event === 'save') {
                console.log('Save event received, XML length:', message.xml?.length);
                setDrawioContent(message.xml);
                setHasChanges(true);

                if (autoSave && fileId) {
                    handleSave(message.xml);
                }

                sendMessageToDrawio({ action: 'status', modified: false });
            } else if (message.event === 'autosave') {
                console.log('Autosave event received, XML length:', message.xml?.length);
                setDrawioContent(message.xml);
                setHasChanges(true);
            } else if (message.event === 'export') {
                console.log('Export event received, format:', message.format, 'data length:', message.data?.length);

                if (pendingExportRef.current) {
                    pendingExportRef.current.resolve(message.data);
                    pendingExportRef.current = null;
                }
            } else if (message.event === 'configure') {
                sendMessageToDrawio({
                    action: 'configure',
                    config: {
                        defaultFonts: ['Helvetica', 'Verdana', 'Times New Roman', 'Garamond', 'Comic Sans MS', 'Courier New', 'Georgia', 'Lucida Console', 'Tahoma'],
                    }
                });
            }
        } catch (err) {
            console.error('Error handling message from draw.io:', err);
        }
    }, [drawioContent, autoSave, fileId, sendMessageToDrawio]);

    useEffect(() => {
        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, [handleMessage]);

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
        } catch (err) {
            console.error('Error saving Draw.io file:', err);
            setError(
                `Failed to save file: ${err instanceof Error ? err.message : 'Unknown error'}`
            );
        } finally {
            setIsSaving(false);
        }
    };

    const handleExportPNG = async () => {
        if (!iframeLoaded) {
            setError(t('Draw.io editor not loaded yet'));
            return;
        }

        setIsExporting(true);
        setError(null);

        try {
            const exportPromise = new Promise<string>((resolve, reject) => {
                pendingExportRef.current = { format: 'png', resolve };

                setTimeout(() => {
                    if (pendingExportRef.current) {
                        pendingExportRef.current = null;
                        reject(new Error('Export timeout'));
                    }
                }, 30000);
            });

            sendMessageToDrawio({
                action: 'export',
                format: 'png'
            });

            const data = await exportPromise;
            handleExportData(data, 'png');
        } catch (err) {
            console.error('Error exporting PNG:', err);
            setError(t('Failed to export PNG'));
        } finally {
            setIsExporting(false);
        }
    };

    const handleExportSVG = async () => {
        if (!iframeLoaded) {
            setError(t('Draw.io editor not loaded yet'));
            return;
        }

        setIsExporting(true);
        setError(null);

        try {
            const exportPromise = new Promise<string>((resolve, reject) => {
                pendingExportRef.current = { format: 'svg', resolve };

                setTimeout(() => {
                    if (pendingExportRef.current) {
                        pendingExportRef.current = null;
                        reject(new Error('Export timeout'));
                    }
                }, 30000);
            });

            sendMessageToDrawio({
                action: 'export',
                format: 'svg'
            });

            const data = await exportPromise;
            handleExportData(data, 'svg');
        } catch (err) {
            console.error('Error exporting SVG:', err);
            setError(t('Failed to export SVG'));
        } finally {
            setIsExporting(false);
        }
    };

    const handleExportData = (data: string, format: string) => {
        try {
            console.log('Processing export data for format:', format);

            const mimeType = format === 'png' ? 'image/png' : 'image/svg+xml';

            let blob: Blob;

            if (format === 'svg') {
                if (data.startsWith('data:image/svg+xml;base64,')) {
                    const base64Data = data.substring('data:image/svg+xml;base64,'.length);
                    const byteCharacters = atob(base64Data);
                    const byteNumbers = new Array(byteCharacters.length);
                    for (let i = 0; i < byteCharacters.length; i++) {
                        byteNumbers[i] = byteCharacters.charCodeAt(i);
                    }
                    const byteArray = new Uint8Array(byteNumbers);
                    blob = new Blob([byteArray], { type: mimeType });
                } else if (data.startsWith('<svg') || data.startsWith('<?xml')) {
                    blob = new Blob([data], { type: mimeType });
                } else {
                    const svgContent = atob(data);
                    blob = new Blob([svgContent], { type: mimeType });
                }
            } else {
                let base64Data = data;

                if (data.startsWith('data:')) {
                    const parts = data.split(',');
                    if (parts.length > 1) {
                        base64Data = parts[1];
                    }
                }

                const byteCharacters = atob(base64Data);
                const byteNumbers = new Array(byteCharacters.length);
                for (let i = 0; i < byteCharacters.length; i++) {
                    byteNumbers[i] = byteCharacters.charCodeAt(i);
                }
                const binaryData = new Uint8Array(byteNumbers);
                blob = new Blob([binaryData], { type: mimeType });
            }

            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName.replace(/\.(drawio|dio|xml)$/i, `.${format}`);
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            console.log('Export successful:', format);
        } catch (err) {
            console.error('Error processing export data:', err);
            setError(
                `Failed to export file: ${err instanceof Error ? err.message : 'Unknown error'}`
            );
        }
    };

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
            setError(
                `Failed to download file: ${err instanceof Error ? err.message : 'Unknown error'}`
            );
        }
    };

    const triggerSaveInDrawio = () => {
        sendMessageToDrawio({
            action: 'export',
            format: 'xml'
        });
    };

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if ((event.ctrlKey || event.metaKey) && event.key === 's') {
                event.preventDefault();
                if (fileId && iframeLoaded) {
                    triggerSaveInDrawio();
                    setTimeout(() => {
                        if (drawioContent) {
                            handleSave(drawioContent);
                        }
                    }, 100);
                }
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [drawioContent, fileId, iframeLoaded]);

    const getThemeParam = () => {
        if (theme === 'auto') {
            return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        }
        return theme;
    };

    const embedUrl = `${DRAWIO_CDN}?embed=1&ui=${getThemeParam()}&proto=json&spin=1&libraries=1&saveAndExit=0&noSaveBtn=1&noExitBtn=1`;

    const tooltipInfo = [
        t('Status: {status}', { status: isOnline ? t('Online') : t('Offline - cached') }),
        t('Auto-save: {status}', { status: autoSave ? t('enabled') : t('disabled') }),
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
                            triggerSaveInDrawio();
                            setTimeout(() => handleSave(), 100);
                        }}
                        title={t('Save File (Ctrl+S)')}
                        disabled={isSaving || !iframeLoaded}
                        className={hasChanges ? 'active' : ''}>
                        <SaveIcon />
                    </button>
                )}
                <button
                    onClick={handleDownload}
                    title={t('Download as Draw.io XML')}
                    disabled={!iframeLoaded}>
                    <DownloadIcon />
                </button>
            </PluginControlGroup>

            <PluginControlGroup>
                <button
                    onClick={handleExportPNG}
                    title={t('Export as PNG')}
                    disabled={!iframeLoaded || isExporting}>
                    PNG
                </button>
                <button
                    onClick={handleExportSVG}
                    title={t('Export as SVG')}
                    disabled={!iframeLoaded || isExporting}>
                    SVG
                </button>
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

                {isLoading && (
                    <div className="loading-indicator">{t('Loading diagram...')}</div>
                )}

                {!isLoading && !error && (
                    <iframe
                        ref={iframeRef}
                        src={embedUrl}
                        className="drawio-iframe"
                        title={fileName}
                        sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals allow-downloads allow-popups-to-escape-sandbox"
                    />
                )}

                {(isSaving || isExporting) && (
                    <div className="save-indicator">
                        <span>{isSaving ? t('Saving...') : t('Exporting...')}</span>
                    </div>
                )}
            </div>
        </div>
    );
};

export default DrawioViewer;