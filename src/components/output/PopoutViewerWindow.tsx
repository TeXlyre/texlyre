// src/components/output/PopoutViewerWindow.tsx
import { t } from '@/i18n';
import React, { useEffect, useRef, useState } from 'react';

import { pluginRegistry } from '../../plugins/PluginRegistry';
import { useSettings } from '../../hooks/useSettings';
import { toArrayBuffer } from '../../utils/fileUtils';
import type { RendererController } from '../../plugins/PluginInterface';
import type {
  PopoutContentKind,
  PopoutMessage,
} from '../../services/PopoutViewerService';

interface PopoutViewerWindowProps {
  projectId: string;
}

const PopoutViewerWindow: React.FC<PopoutViewerWindowProps> = ({ projectId }) => {
  const [content, setContent] = useState<Uint8Array | ArrayBuffer | string | null>(null);
  const [kind, setKind] = useState<PopoutContentKind>('pdf');
  const [mimeType, setMimeType] = useState<string>('application/pdf');
  const [fileName, setFileName] = useState<string>('output.pdf');
  const [projectName, setProjectName] = useState<string>('Output');
  const [compileLog, setCompileLog] = useState<string>('');
  const [compileStatus, setCompileStatus] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const controllerRef = useRef<RendererController | null>(null);
  const { getSetting } = useSettings();

  const useEnhancedRenderer = getSetting('pdf-renderer-enable')?.value ?? true;

  useEffect(() => {
    const channel = new BroadcastChannel(`texlyre-popout-${projectId}`);
    channelRef.current = channel;

    const handleMessage = (event: MessageEvent) => {
      const message = event.data as PopoutMessage;
      switch (message.type) {
        case 'content-update':
          if (message.data?.content !== undefined) {
            const incoming = message.data.content;
            const incomingKind = message.data.kind ?? kind;

            if (
              (incomingKind === 'canvas-pdf' || incomingKind === 'canvas-svg') &&
              controllerRef.current?.updateContent
            ) {
              controllerRef.current.updateContent(incoming);
            }

            setContent(incoming);
            if (message.data.kind) setKind(message.data.kind);
            if (message.data.mimeType) setMimeType(message.data.mimeType);
            if (message.data.fileName) setFileName(message.data.fileName);
            if (message.data.projectName) setProjectName(message.data.projectName);
          }
          if (message.data?.compileLog !== undefined) setCompileLog(message.data.compileLog);
          if (message.data?.status !== undefined) setCompileStatus(message.data.status);
          setIsLoading(false);
          break;
        case 'content-clear':
          setContent(null);
          setCompileLog('');
          setCompileStatus(0);
          setIsLoading(false);
          break;
      }
    };

    channel.addEventListener('message', handleMessage);
    channel.postMessage({ type: 'window-ready', timestamp: Date.now() });

    const handleBeforeUnload = () => {
      channel.postMessage({ type: 'window-closed', timestamp: Date.now() });
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      channel.removeEventListener('message', handleMessage);
      channel.close();
    };
  }, [projectId]);

  const handleSave = (saveName: string) => {
    if (!content) return;
    const blob =
      typeof content === 'string'
        ? new Blob([content], { type: mimeType })
        : new Blob([toArrayBuffer(content as Uint8Array)], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = saveName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const renderContent = () => {
    if (!content) return null;

    const rendererId = kind === 'pdf' ? 'pdf-renderer' : 'canvas-renderer';
    const outputType = kind === 'pdf' ? 'pdf' : 'canvas';
    const renderer = pluginRegistry.getRendererForOutput(outputType, rendererId);

    const rendererContent =
      typeof content === 'string' ? content : toArrayBuffer(content as Uint8Array);

    if (kind === 'pdf' && (!renderer || !useEnhancedRenderer)) {
      return (
        <embed
          src={URL.createObjectURL(
            new Blob([toArrayBuffer(content as Uint8Array)], { type: 'application/pdf' })
          )}
          type="application/pdf"
          style={{ width: '100%', height: '100%' }}
        />
      );
    }

    if (!renderer) {
      return <div className="canvas-fallback">{t('Renderer not available')}</div>;
    }

    return React.createElement(renderer.renderOutput, {
      content: rendererContent,
      mimeType,
      fileName,
      onSave: kind === 'pdf' ? handleSave : undefined,
      controllerRef: (controller: RendererController) => {
        controllerRef.current = controller;
      },
    });
  };

  const downloadLabel =
    kind === 'pdf'
      ? t('Download PDF')
      : kind === 'canvas-pdf'
        ? t('Download PDF')
        : t('Download SVG');

  return (
    <div
      style={{
        height: '100vh',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: 'var(--pico-background, #fff)',
        color: 'var(--pico-color, #000)',
      }}
    >
      <header
        style={{
          padding: '0.5rem 1rem',
          width: '100%',
          borderBottom: '1px solid var(--pico-border-color, #ddd)',
          backgroundColor: 'var(--pico-secondary-background, #f8f9fa)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: '1.2rem' }}>{projectName}</h1>
          <p style={{ margin: 0, fontSize: '0.9rem', opacity: 0.7 }}>
            {kind === 'pdf' || kind === 'canvas-pdf' ? t('PDF Output') : t('SVG Output')}
          </p>
        </div>
        {content && kind === 'pdf' && (
          <button
            onClick={() => handleSave(fileName)}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: 'var(--pico-primary, #007bff)',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            {downloadLabel}
          </button>
        )}
      </header>

      <div style={{ flex: 1, overflow: 'hidden' }}>
        {isLoading ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              flexDirection: 'column',
              gap: '1rem',
            }}
          >
            <div>{t('Loading viewer...')}</div>
            <div style={{ fontSize: '0.9rem', opacity: 0.7 }}>
              {t('Waiting for compilation results from main window')}
            </div>
          </div>
        ) : !content ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              flexDirection: 'column',
              gap: '1rem',
            }}
          >
            <div>{t('No output available')}</div>
            {compileStatus !== 0 && (
              <div style={{ fontSize: '0.9rem', color: 'var(--pico-del-color, #dc3545)' }}>
                {t('Compilation failed. Check the log in the main window.')}
              </div>
            )}
            <div style={{ fontSize: '0.9rem', opacity: 0.7 }}>
              {t('Compile a document in the main window to see output here')}
            </div>
          </div>
        ) : (
          <div style={{ height: '100%', width: '100%' }}>{renderContent()}</div>
        )}
      </div>
    </div>
  );
};

export default PopoutViewerWindow;