// src/components/output/TypstOutput.tsx
import { t } from '@/i18n';
import React from 'react';
import { useEffect, useRef, useState, useMemo, useCallback } from 'react';

import { useFileTree } from '../../hooks/useFileTree';
import { useTypst } from '../../hooks/useTypst';
import { useProperties } from '../../hooks/useProperties';
import { useSettings } from '../../hooks/useSettings';
import { pluginRegistry } from '../../plugins/PluginRegistry';
import type { RendererController } from '../../plugins/PluginInterface'
import ResizablePanel from '../common/ResizablePanel';
import TypstCompileButton from './TypstCompileButton';
import { isTypstFile, toArrayBuffer } from '../../utils/fileUtils';

interface TypstOutputProps {
  className?: string;
  selectedDocId?: string | null;
  documents?: Array<{ id: string; name: string; }>;
  onNavigateToLinkedFile?: () => void;
  onExpandTypstOutput?: () => void;
  linkedFileInfo?: {
    fileName?: string;
    filePath?: string;
    fileId?: string;
  } | null;
}

const TypstOutput: React.FC<TypstOutputProps> = ({
  className = '',
  selectedDocId,
  documents,
  onNavigateToLinkedFile,
  onExpandTypstOutput,
  linkedFileInfo
}) => {
  const {
    compileLog,
    compiledPdf,
    compiledSvg,
    compiledCanvas,
    currentView,
    toggleOutputView,
    currentFormat,
    setCurrentFormat,
    compileDocument,
    activeCompiler
  } = useTypst();

  const { selectedFileId, getFile } = useFileTree();
  const { getSetting } = useSettings();
  const { getProperty, setProperty, registerProperty } = useProperties();
  const propertiesRegistered = useRef(false);

  const [visualizerHeight, setVisualizerHeight] = useState(300);
  const [visualizerCollapsed, setVisualizerCollapsed] = useState(false);

  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const canvasControllerRef = useRef<RendererController | null>(null);

  const useEnhancedRenderer = getSetting('pdf-renderer-enable')?.value ?? true;
  const loggerPlugin = pluginRegistry.getLoggerForType('typst');

  useEffect(() => {
    if (compiledCanvas && currentFormat === 'canvas' && canvasControllerRef.current?.updateContent) {
      canvasControllerRef.current.updateContent(compiledCanvas);
    }
  }, [compiledCanvas, currentFormat]);

  useEffect(() => {
    if (propertiesRegistered.current) return;
    propertiesRegistered.current = true;

    registerProperty({
      id: 'typst-log-visualizer-height',
      category: 'UI',
      subcategory: 'Layout',
      defaultValue: 300
    });

    registerProperty({
      id: 'typst-log-visualizer-collapsed',
      category: 'UI',
      subcategory: 'Layout',
      defaultValue: false
    });
  }, [registerProperty]);

  useEffect(() => {
    const storedHeight = getProperty('typst-log-visualizer-height');
    const storedCollapsed = getProperty('typst-log-visualizer-collapsed');

    if (storedHeight !== undefined) {
      setVisualizerHeight(Number(storedHeight));
    }

    if (storedCollapsed !== undefined) {
      setVisualizerCollapsed(Boolean(storedCollapsed));
    }
  }, [getProperty]);

  const handleVisualizerResize = (height: number) => {
    setVisualizerHeight(height);
    setProperty('typst-log-visualizer-height', height);
  };

  const handleVisualizerCollapse = (collapsed: boolean) => {
    setVisualizerCollapsed(collapsed);
    setProperty('typst-log-visualizer-collapsed', collapsed);
  };

  const handleLineClick = async (line: number) => {
    if (!selectedFileId) return;

    try {
      const file = await getFile(selectedFileId);
      if (!file || !isTypstFile(file.path)) {
        console.log('[TypstOutput] Selected file is not a .typ file');
        return;
      }

      const event = new CustomEvent('codemirror-goto-line', {
        detail: {
          line: line,
          fileId: selectedFileId,
          filePath: file.path
        }
      });
      document.dispatchEvent(event);
    } catch (error) {
      console.error('Error handling line click:', error);
    }
  };

  const getCurrentOutput = () => {
    switch (currentFormat) {
      case 'pdf':
        return compiledPdf;
      case 'svg':
        return compiledSvg;
      case 'canvas':
        return compiledCanvas;
      default:
        return null;
    }
  };

  const handleSavePdf = useCallback((fileName: string) => {
    if (!compiledPdf) return;

    const blob = new Blob([toArrayBuffer(compiledPdf)], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [compiledPdf]);

  const handleSaveOutput = useCallback((format: string, defaultName: string) => {
    const currentOutput = getCurrentOutput();
    if (!currentOutput) return;

    let blob: Blob;
    switch (format) {
      case 'svg':
        if (!compiledSvg) return;
        blob = new Blob([compiledSvg], { type: 'image/svg+xml' });
        break;
      case 'pdf':
        if (!compiledPdf) return;
        blob = new Blob([toArrayBuffer(compiledPdf)], { type: 'application/pdf' });
        break;
      case 'canvas':
        if (!compiledCanvas) return;
        blob = new Blob([toArrayBuffer(compiledCanvas)], { type: 'text/plain' });
        break;
      default:
        return;
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = defaultName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [compiledPdf, compiledSvg, compiledCanvas]);

  const handleTabSwitch = useCallback((format: 'pdf' | 'svg' | 'canvas') => {
    if (currentFormat !== format) {
      setCurrentFormat(format);

      if (selectedDocId && linkedFileInfo && isTypstFile(linkedFileInfo.filePath)) {
        compileDocument(linkedFileInfo.filePath, format);
      } else if (selectedFileId) {
        getFile(selectedFileId).then((file) => {
          if (file && isTypstFile(file.path)) {
            compileDocument(file.path, format);
          }
        });
      }
    }
  }, [currentFormat, setCurrentFormat, compileDocument, selectedDocId, linkedFileInfo, selectedFileId, getFile]);

  const outputViewerContent = useMemo(() => {
    console.log('[TypstOutput] outputViewerContent recalculating', {
      currentView,
      currentFormat,
      hasCompiledPdf: !!compiledPdf,
      hasCompiledSvg: !!compiledSvg,
      hasCompiledCanvas: !!compiledCanvas
    });
    if (currentView !== 'output') return null;

    if (currentFormat === 'pdf' && compiledPdf) {
      const pdfRenderer = pluginRegistry.getRendererForOutput('pdf', 'pdf-renderer');
      return (
        <div className="pdf-viewer">
          {pdfRenderer && useEnhancedRenderer ?
            React.createElement(pdfRenderer.renderOutput, {
              content: toArrayBuffer(compiledPdf.buffer),
              mimeType: 'application/pdf',
              fileName: 'output.pdf',
              onSave: handleSavePdf
            }) :

            <embed
              src={URL.createObjectURL(new Blob([toArrayBuffer(compiledPdf)], { type: 'application/pdf' }))}
              type="application/pdf"
              style={{ width: '100%', height: '100%' }} />

          }
        </div>);

    }

    if (currentFormat === 'svg' && compiledSvg) {
      const svgRenderer = pluginRegistry.getRendererForOutput('svg', 'svg-renderer');
      return (
        <div className="svg-viewer">
          {svgRenderer ?
            React.createElement(svgRenderer.renderOutput, {
              content: new TextEncoder().encode(compiledSvg).buffer,
              mimeType: 'image/svg+xml',
              fileName: 'output.svg',
              onSave: (fileName) => handleSaveOutput('svg', fileName)
            }) :

            <div className="svg-canvas-container" style={{
              width: '100%',
              flex: 1,
              overflow: 'hidden',
              padding: '1rem',
              backgroundColor: 'white',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              minHeight: '400px'
            }}>
              <iframe
                ref={iframeRef}
                title={t('SVG Output')}
                srcDoc={`<!DOCTYPE html>
                                <html>
                                  <head>
                                    <style>
                                      body, html { 
                                        margin: 0; 
                                        padding: 0; 
                                        height: 100%; 
                                        width: 100%; 
                                        overflow: hidden; 
                                        display: flex;
                                        justify-content: center;
                                        align-items: center;
                                      }
                                      svg { 
                                        max-width: 100%; 
                                        max-height: 100%; 
                                      }
                                    </style>
                                  </head>
                                  <body>${compiledSvg}</body>
                                </html>`}
                style={{
                  width: '100%',
                  height: '100%',
                  border: '1px solid #ddd',
                  backgroundColor: 'white'
                }} />

            </div>
          }
        </div>);

    }

    if (currentFormat === 'canvas') {
      const canvasRenderer = pluginRegistry.getRendererForOutput('canvas', 'canvas-renderer');

      return (
        <div className="canvas-viewer">
          {canvasRenderer ?
            React.createElement(canvasRenderer.renderOutput, {
              content: compiledCanvas || new ArrayBuffer(0),
              mimeType: 'image/svg+xml',
              fileName: 'output.svg',
              onDownload: (fileName) => handleSaveOutput('canvas', fileName),
              controllerRef: (controller) => { canvasControllerRef.current = controller; }
            }) :
            <div className="canvas-fallback">{t('Canvas renderer not available')}</div>
          }
        </div>
      );
    }

    return null;
  }, [currentView, currentFormat, !!compiledPdf, !!compiledSvg, !!compiledCanvas, useEnhancedRenderer, handleSavePdf, handleSaveOutput]);

  const hasAnyOutput = compiledPdf || compiledSvg || compiledCanvas;

  return (
    <div className={`typst-output ${className}`}>
      <div className="output-header">
        <div className="view-tabs">
          <button
            className={`tab-button ${currentView === 'log' ? 'active' : ''}`}
            onClick={() => currentView !== 'log' && toggleOutputView()}>{t('Log')}


          </button>
          {currentView === 'output' &&
            <>
              <button
                className={`tab-button ${currentView === 'output' && currentFormat === 'pdf' ? 'active' : ''}`}
                onClick={() => handleTabSwitch('pdf')}>

                PDF
              </button>
              <button
                className={`tab-button ${currentView === 'output' && currentFormat === 'svg' ? 'active' : ''}`}
                onClick={() => handleTabSwitch('svg')}>

                SVG
              </button>
              <button
                className={`tab-button ${currentView === 'output' && currentFormat === 'canvas' ? 'active' : ''}`}
                onClick={() => handleTabSwitch('canvas')}>{t('Canvas')}


              </button>
            </>
          }
          {currentView === 'log' &&
            <button
              className={'tab-button'}
              onClick={() => toggleOutputView()}
              disabled={!hasAnyOutput}>{t('Output')}


            </button>
          }
        </div>
        <TypstCompileButton
          dropdownKey={'typst-output-dropdown'}
          className="output-compile-button"
          selectedDocId={selectedDocId}
          documents={documents}
          onNavigateToLinkedFile={onNavigateToLinkedFile}
          onExpandTypstOutput={onExpandTypstOutput}
          linkedFileInfo={linkedFileInfo}
          shouldNavigateOnCompile={false}
          useSharedSettings={false} />

      </div>

      {!compileLog && !hasAnyOutput ?
        <div className="empty-state">
          <p>{t('No output available. Compile a Typst document to see results.')}</p>
        </div> :

        <>
          {currentView === 'log' &&
            <div className="log-view-container">
              {loggerPlugin ?
                <div className="split-log-view">
                  <ResizablePanel
                    direction="vertical"
                    alignment="end"
                    height={visualizerHeight}
                    minHeight={150}
                    maxHeight={600}
                    className="visualizer-panel-wrapper"
                    onResize={handleVisualizerResize}
                    collapsed={visualizerCollapsed}
                    onCollapse={handleVisualizerCollapse}>

                    <div className="visualizer-panel">
                      {React.createElement(loggerPlugin.renderVisualizer, {
                        log: compileLog,
                        onLineClick: handleLineClick
                      })}
                    </div>
                  </ResizablePanel>
                  <div className="raw-log-panel">
                    <pre className="log-viewer">{compileLog}</pre>
                  </div>
                </div> :

                <div className="log-viewer">
                  <pre>{compileLog}</pre>
                </div>
              }
            </div>
          }

          {outputViewerContent}
        </>
      }
    </div>);

};

export default TypstOutput;