// extras/collaborative_viewers/drawio/DrawioCollaborativeViewer.tsx
import { t } from '@/i18n';
import type React from 'react';
import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import * as Y from 'yjs';

import { DownloadIcon, SaveIcon } from '@/components/common/Icons';
import { PluginControlGroup, PluginHeader } from '@/components/common/PluginHeader';
import { usePluginFileInfo } from '@/hooks/usePluginFileInfo';
import { useSettings } from '@/hooks/useSettings';
import { useAuth } from '@/hooks/useAuth';
import type { CollaborativeViewerProps } from '@/plugins/PluginInterface';
import { fileStorageService } from '@/services/FileStorageService';
import { formatFileSize } from '@/utils/fileUtils';
import { collabService } from '@/services/CollabService';
import '../../viewers/drawio/styles.css';
import { PLUGIN_NAME, PLUGIN_VERSION } from './DrawioCollaborativeViewerPlugin';
import DrawioSplashScreen from '../../viewers/drawio/DrawioSplashScreen';
import DrawioPngExportButton from '../../viewers/drawio/DrawioPngExportButton';
import DrawioSvgExportButton from '../../viewers/drawio/DrawioSvgExportButton';
import { DrawioYjsAdapter } from './DrawioYjsAdapter';

const BASE_PATH = __BASE_PATH__;

const DrawioCollaborativeViewer: React.FC<CollaborativeViewerProps> = ({
    content,
    fileName,
    fileId,
    docUrl,
    documentId,
    isDocumentSelected,
    onUpdateContent
}) => {
    const { getSetting } = useSettings();
    const { user } = useAuth();
    const fileInfo = usePluginFileInfo(fileId, fileName);

    const autoSave = (getSetting('drawio-viewer-auto-save')?.value as boolean) ?? false;
    const autoSaveFile = (getSetting('drawio-viewer-auto-save-file')?.value as boolean) ?? false;
    const theme = (getSetting('drawio-viewer-theme')?.value as string) ?? 'auto-app';
    const language = (getSetting('drawio-viewer-language')?.value as string) ?? 'auto-app';

    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [hasChanges, setHasChanges] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [drawioContent, setDrawioContent] = useState<string>('');
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const [iframeLoaded, setIframeLoaded] = useState(false);
    const [showSaveIndicator, setShowSaveIndicator] = useState(false);
    const [yjsDoc, setYjsDoc] = useState<Y.Doc | null>(null);
    const [yjsProvider, setYjsProvider] = useState<any>(null);

    const iframeRef = useRef<HTMLIFrameElement>(null);
    const adapterRef = useRef<DrawioYjsAdapter | null>(null);
    const saveIndicatorTimerRef = useRef<number | null>(null);
    const onUpdateContentRef = useRef(onUpdateContent);

    useEffect(() => {
        onUpdateContentRef.current = onUpdateContent;
    }, [onUpdateContent]);

    const projectId = useMemo(() => {
        const hash = docUrl.split(':').pop() || '';
        return hash;
    }, [docUrl]);

    const collectionName = useMemo(() => `yjs_${documentId}`, [documentId]);

    useEffect(() => {
        console.log('[DrawioCollaborativeViewer] Connecting to Y.Doc:', projectId, collectionName);

        const { doc, provider } = collabService.connect(projectId, collectionName);
        setYjsDoc(doc);
        setYjsProvider(provider);

        return () => {
            console.log('[DrawioCollaborativeViewer] Disconnecting from Y.Doc');
            collabService.disconnect(projectId, collectionName);
        };
    }, [projectId, collectionName]);

    const getThemeParam = useCallback(() => {
        if (theme === 'auto-app') {
            const appTheme = getSetting('theme-variant')?.value as string || 'system';
            if (appTheme === 'system') {
                return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
            }
            return appTheme === 'dark' ? 'dark' : 'light';
        }
        if (theme === 'auto-drawio') {
            return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        }
        return theme;
    }, [theme, getSetting]);

    const getLanguageParam = useCallback(() => {
        if (language === 'auto-app') {
            const appLanguage = getSetting('language')?.value as string || 'en';
            return appLanguage;
        }
        return undefined;
    }, [language, getSetting]);

    const resolvedTheme = useMemo(() => getThemeParam(), [getThemeParam]);
    const resolvedLanguage = useMemo(() => getLanguageParam(), [getLanguageParam]);
    const uiParam = useMemo(() => (resolvedTheme === 'dark' ? 'dark' : 'kennedy'), [resolvedTheme]);

    const baseUrl = `${BASE_PATH}/core/drawio-embed`;
    const drawioOrigin = useMemo(() => new URL(baseUrl, window.location.origin).origin, [baseUrl]);

    const embedUrl = useMemo(() => {
        const params =
            `embed=1&proto=json&spin=1&libraries=1&saveAndExit=0&noSaveBtn=1&noExitBtn=1` +
            `&db=0&od=0&gapi=0&tr=0&gh=0&gl=0&stealth=1&ui=${encodeURIComponent(uiParam)}` +
            (resolvedLanguage ? `&lang=${encodeURIComponent(resolvedLanguage)}` : '');
        return `${baseUrl}/${resolvedTheme}/app.html?${params}`;
    }, [baseUrl, resolvedTheme, uiParam, resolvedLanguage]);

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

        if (adapterRef.current) {
            adapterRef.current.destroy();
            adapterRef.current = null;
        }
    }, [fileId, fileName, embedUrl]);

    useEffect(() => {
        let cancelled = false;

        const run = async () => {
            try {
                let text = '';

                if (content instanceof ArrayBuffer) {
                    text = new TextDecoder('utf-8').decode(content);
                } else if (typeof content === 'string') {
                    text = content;
                } else {
                    setIsLoading(false);
                    setError(t('Invalid content format'));
                    return;
                }

                const isTrulyEmptyFile = (fileInfo.fileSize ?? 0) === 0;

                if (!text.trim() && !isTrulyEmptyFile && fileId) {
                    const file = await fileStorageService.getFile(fileId);
                    if (cancelled) return;

                    const stored = file?.content;

                    if (stored instanceof ArrayBuffer) {
                        text = new TextDecoder('utf-8').decode(stored);
                    } else if (typeof stored === 'string') {
                        text = stored;
                    }
                }

                if (!text.trim()) {
                    if (!isTrulyEmptyFile) {
                        return;
                    }

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
                setIsLoading(false);
                setError(null);
            } catch (err) {
                console.error('Error decoding Draw.io content:', err);
                setError(t('Failed to decode file content'));
                setIsLoading(false);
            }
        };

        run();
        return () => {
            cancelled = true;
        };
    }, [content, t, fileId, fileInfo.fileSize]);


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

    const handleSave = useCallback(async (contentToSave: string) => {
        if (!fileId) return;

        if (!contentToSave.trim()) {
            console.warn('Attempted to save empty content');
            return;
        }

        setIsSaving(true);
        setError(null);

        try {
            const encoder = new TextEncoder();
            const dataToSave = encoder.encode(contentToSave);

            await fileStorageService.updateFileContent(fileId, dataToSave.buffer);

            setHasChanges(false);
            flashSavedIndicator();
        } catch (err) {
            console.error('Error saving Draw.io file:', err);
            setError(`Failed to save file: ${err instanceof Error ? err.message : 'Unknown error'}`);
        } finally {
            setIsSaving(false);
        }
    }, [fileId, flashSavedIndicator]);

    useEffect(() => {
        if (!iframeLoaded || !drawioContent || !yjsDoc || adapterRef.current) {
            return;
        }

        console.log('[DrawioCollaborativeViewer] Initializing adapter');

        const adapter = new DrawioYjsAdapter({
            doc: yjsDoc,
            awareness: yjsProvider?.awareness,
            iframeRef,
            drawioOrigin,
            onContentChange: (xml: string) => {
                // console.log('[DrawioCollaborativeViewer] Content changed from adapter, length:', xml.length);
                setDrawioContent(xml);
                setHasChanges(true);

                onUpdateContentRef.current(xml);

                if (autoSaveFile && fileId) {
                    handleSave(xml);
                }
            }
        });

        adapter.initialize(drawioContent);
        adapterRef.current = adapter;

        if (yjsProvider?.awareness && user) {
            yjsProvider.awareness.setLocalStateField('user', {
                id: user.id,
                username: user.username,
                name: user.name || user.username,
                color: user.color || '#4A90E2',
                colorLight: user.colorLight || '#85B8F0',
            });
            console.log('[DrawioCollaborativeViewer] Set local user in awareness:', user.username);
        }

        return () => {
            console.log('[DrawioCollaborativeViewer] Effect cleanup - NOT destroying adapter');
        };
    }, [iframeLoaded, drawioContent, yjsDoc, yjsProvider, drawioOrigin, autoSaveFile, fileId, handleSave, user]);

    useEffect(() => {
        return () => {
            console.log('[DrawioCollaborativeViewer] Component unmounting, destroying adapter');
            if (adapterRef.current) {
                adapterRef.current.destroy();
                adapterRef.current = null;
            }
        };
    }, []);

    const handleIframeLoad = useCallback(() => {
        console.log('[DrawioCollaborativeViewer] Iframe loaded');
        setIframeLoaded(true);
    }, []);

    const handleExport = useCallback(
        async (options: any): Promise<string> => {
            if (!iframeLoaded || !adapterRef.current) {
                throw new Error(t('Draw.io editor not loaded yet'));
            }

            return adapterRef.current.requestExport(options.format, options);
        },
        [iframeLoaded, t]
    );

    const handleDownload = useCallback(() => {
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
    }, [drawioContent, fileName]);

    const handleManualSave = useCallback(() => {
        handleSave(drawioContent);
    }, [drawioContent, handleSave]);

    const getThemeDisplayText = () => {
        if (theme === 'auto-app') return t('Auto (Follows App Theme)');
        if (theme === 'auto-drawio') return t('Auto (Follows Draw.io Theme)');
        return t(theme);
    };

    const getLanguageDisplayText = () => {
        if (language === 'auto-app') return t('Auto (Follows App Language)');
        if (language === 'auto-drawio') return t('Auto (Follows Draw.io Language)');
        return language;
    };

    const tooltipInfo = useMemo(() => [
        t('Auto-save editor: {status}', { status: autoSave ? t('enabled') : t('disabled') }),
        t('Auto-save file: {status}', { status: autoSaveFile ? t('enabled') : t('disabled') }),
        t('Theme: {theme}', { theme: getThemeDisplayText() }),
        t('Language: {language}', { language: getLanguageDisplayText() }),
        t('Collaborative Mode: Active'),
        t('Document ID: {documentId}', { documentId }),
        t('MIME Type: {mimeType}', { mimeType: fileInfo.mimeType || 'application/vnd.jgraph.mxfile' }),
        t('Size: {size}', { size: formatFileSize(fileInfo.fileSize) })
    ], [autoSave, autoSaveFile, theme, language, documentId, fileInfo.mimeType, fileInfo.fileSize, t]);

    const headerControls = useMemo(() => (
        <>
            <PluginControlGroup>
                {fileId && (
                    <button
                        onClick={handleManualSave}
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
    ), [fileId, isSaving, iframeLoaded, hasChanges, fileName, handleManualSave, handleDownload, handleExport, t]);

    if (isLoading) {
        return (
            <div className="drawio-viewer-container">
                <div className="loading-indicator">{t('Loading diagram...')}</div>
            </div>
        );
    }

    return (
        <div className="drawio-viewer-container">
            <PluginHeader
                fileName={fileInfo.fileName}
                filePath={fileInfo.filePath}
                pluginName={PLUGIN_NAME}
                pluginVersion={PLUGIN_VERSION}
                tooltipInfo={tooltipInfo}
                controls={headerControls}
                awareness={yjsProvider?.awareness}
            />

            <div className="drawio-viewer-content">
                {error && <div className="drawio-error-message">{error}</div>}

                {!isOnline && (
                    <div className="drawio-warning-message">
                        {t('You are currently offline. Draw.io is cached and will work, but some features may be limited.')}
                    </div>
                )}

                {!error && (
                    <>
                        <DrawioSplashScreen iframeLoaded={iframeLoaded} />
                        <iframe
                            key={fileId ?? fileName}
                            ref={iframeRef}
                            src={embedUrl}
                            className="drawio-iframe"
                            title={fileName}
                            onLoad={handleIframeLoad}
                            sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals allow-downloads allow-popups-to-escape-sandbox"
                        />
                    </>
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

export default DrawioCollaborativeViewer;