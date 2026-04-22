// src/components/output/LaTeXOutput.tsx
import { t } from '@/i18n';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useFileTree } from '../../hooks/useFileTree';
import { useLaTeX } from '../../hooks/useLaTeX';
import { useSourceMap } from '../../hooks/useSourceMap';
import { useProperties } from '../../hooks/useProperties';
import { useSettings } from '../../hooks/useSettings';
import { pluginRegistry } from '../../plugins/PluginRegistry';
import type { RendererController } from '../../plugins/PluginInterface';
import type { LaTeXOutputFormat } from '../../types/latex';
import type { SourceMapClickMode } from '../../types/sourceMap';
import ResizablePanel from '../common/ResizablePanel';
import LaTeXCompileButton from './LaTeXCompileButton';
import SourceMapFloatingButton from './SourceMapFloatingButton';
import { isLatexFile, toArrayBuffer } from '../../utils/fileUtils';

interface LaTeXOutputProps {
  className?: string;
  selectedDocId?: string | null;
  documents?: Array<{ id: string; name: string }>;
  onNavigateToLinkedFile?: () => void;
  onExpandLatexOutput?: () => void;
  linkedFileInfo?: {
    fileName?: string;
    filePath?: string;
    fileId?: string;
  } | null;
}

const LaTeXOutput: React.FC<LaTeXOutputProps> = ({
  className = '',
  selectedDocId,
  documents,
  onNavigateToLinkedFile,
  onExpandLatexOutput,
  linkedFileInfo,
}) => {
  const {
    compileLog,
    compiledPdf,
    compiledCanvas,
    currentView,
    toggleOutputView,
    logIndicator,
    currentFormat,
    setCurrentFormat,
    compileDocument,
  } = useLaTeX();
  const { selectedFileId, getFile } = useFileTree();
  const {
    reverseSync,
    currentHighlight,
    isAvailable: sourceMapAvailable,
    reverseClickEnabled,
    reverseClickMode,
  } = useSourceMap();
  const { getSetting } = useSettings();
  const { getProperty, setProperty, registerProperty } = useProperties();
  const propertiesRegistered = useRef(false);

  const [visualizerHeight, setVisualizerHeight] = useState(300);
  const [visualizerCollapsed, setVisualizerCollapsed] = useState(false);

  const useEnhancedRenderer = getSetting('pdf-renderer-enable')?.value ?? true;
  const loggerPlugin = pluginRegistry.getLoggerForType('latex');
  const pdfRendererPlugin = pluginRegistry.getRendererForOutput('pdf');
  const canvasControllerRef = useRef<RendererController | null>(null);
  const pdfControllerRef = useRef<RendererController | null>(null);

  const clickCountRef = useRef(0);
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const indicatorColor = {
    idle: '#777',
    success: '#28a745',
    warn: '#ffc107',
    error: '#dc3545',
  }[logIndicator ?? 'idle'];

  useEffect(() => {
    if (canvasControllerRef.current?.setHighlight) {
      canvasControllerRef.current.setHighlight(currentHighlight);
    }
    if (pdfControllerRef.current?.setHighlight) {
      pdfControllerRef.current.setHighlight(currentHighlight);
    }
  }, [currentHighlight]);

  useEffect(() => {
    if (
      compiledCanvas &&
      currentFormat === 'canvas-pdf' &&
      canvasControllerRef.current?.updateContent
    ) {
      canvasControllerRef.current.updateContent(compiledCanvas);
    }
  }, [compiledCanvas, currentFormat]);

  useEffect(() => {
    if (propertiesRegistered.current) return;
    propertiesRegistered.current = true;

    registerProperty({
      id: 'log-visualizer-height',
      category: 'UI',
      subcategory: 'Layout',
      defaultValue: 300,
    });

    registerProperty({
      id: 'log-visualizer-collapsed',
      category: 'UI',
      subcategory: 'Layout',
      defaultValue: false,
    });
  }, [registerProperty]);

  useEffect(() => {
    const storedHeight = getProperty('log-visualizer-height');
    const storedCollapsed = getProperty('log-visualizer-collapsed');

    if (storedHeight !== undefined) {
      setVisualizerHeight(Number(storedHeight));
    }

    if (storedCollapsed !== undefined) {
      setVisualizerCollapsed(Boolean(storedCollapsed));
    }
  }, [getProperty]);

  const handleVisualizerResize = (height: number) => {
    setVisualizerHeight(height);
    setProperty('log-visualizer-height', height);
  };

  const handleVisualizerCollapse = (collapsed: boolean) => {
    setVisualizerCollapsed(collapsed);
    setProperty('log-visualizer-collapsed', collapsed);
  };

  const handleLineClick = async (line: number) => {
    if (!selectedFileId) return;

    try {
      const file = await getFile(selectedFileId);
      if (!file || !isLatexFile(file.path)) {
        console.log('[LaTeXOutput] Selected file is not a .tex file');
        return;
      }

      const event = new CustomEvent('codemirror-goto-line', {
        detail: {
          line: line,
          fileId: selectedFileId,
          filePath: file.path,
        },
      });
      document.dispatchEvent(event);
    } catch (error) {
      console.error('Error handling line click:', error);
    }
  };

  const handleSavePdf = useCallback(
    (fileName: string) => {
      if (!compiledPdf) return;

      const blob = new Blob([toArrayBuffer(compiledPdf)], {
        type: 'application/pdf',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },
    [compiledPdf],
  );

  const handleTabSwitch = useCallback(
    (format: LaTeXOutputFormat) => {
      if (currentFormat !== format) {
        setCurrentFormat(format);
        setProperty('latex-output-format', format);

        if (
          selectedDocId &&
          linkedFileInfo &&
          isLatexFile(linkedFileInfo.filePath)
        ) {
          compileDocument(linkedFileInfo.filePath, format);
        } else if (selectedFileId) {
          getFile(selectedFileId).then((file) => {
            if (file && isLatexFile(file.path)) {
              compileDocument(file.path, format);
            }
          });
        }
      }
    },
    [
      currentFormat,
      setCurrentFormat,
      setProperty,
      compileDocument,
      selectedDocId,
      linkedFileInfo,
      selectedFileId,
      getFile,
    ],
  );

  const handleLocationClick = useCallback(
    (page: number, x: number, y: number) => {
      if (!reverseClickEnabled) return;

      clickCountRef.current++;
      if (clickTimerRef.current) clearTimeout(clickTimerRef.current);

      clickTimerRef.current = setTimeout(() => {
        const required: Record<SourceMapClickMode, number> = {
          single: 1,
          double: 2,
          triple: 3,
        };
        if (clickCountRef.current >= required[reverseClickMode]) {
          reverseSync(page, x, y);
        }
        clickCountRef.current = 0;
      }, 300);
    },
    [reverseClickEnabled, reverseClickMode, reverseSync],
  );

  useEffect(() => {
    return () => {
      if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
    };
  }, []);

  const outputViewerContent = useMemo(() => {
    if (currentView !== 'output') return null;

    if (currentFormat === 'pdf' && compiledPdf) {
      return (
        <div className="pdf-viewer">
          {pdfRendererPlugin && useEnhancedRenderer ? (
            React.createElement(pdfRendererPlugin.renderOutput, {
              content: toArrayBuffer(compiledPdf.buffer),
              mimeType: 'application/pdf',
              fileName: 'output.pdf',
              onSave: handleSavePdf,
              onLocationClick: handleLocationClick,
              controllerRef: (controller: RendererController) => {
                pdfControllerRef.current = controller;
              },
            })
          ) : (
            <embed
              src={URL.createObjectURL(
                new Blob([toArrayBuffer(compiledPdf)], {
                  type: 'application/pdf',
                }),
              )}
              type="application/pdf"
              style={{ width: '100%', height: '100%' }}
            />
          )}
        </div>
      );
    }

    if (currentFormat === 'canvas-pdf' && compiledCanvas) {
      const canvasRenderer = pluginRegistry.getRendererForOutput(
        'canvas',
        'canvas-renderer',
      );
      return (
        <div className="canvas-viewer">
          {canvasRenderer ? (
            React.createElement(canvasRenderer.renderOutput, {
              content: compiledCanvas || new ArrayBuffer(0),
              mimeType: 'application/pdf',
              fileName: 'output.pdf',
              controllerRef: (controller: RendererController) => {
                canvasControllerRef.current = controller;
              },
              onLocationClick: handleLocationClick,
            })
          ) : (
            <div className="canvas-fallback">
              {t('Canvas renderer not available')}
            </div>
          )}
        </div>
      );
    }

    return null;
  }, [
    currentView,
    currentFormat,
    !!compiledPdf,
    !!compiledCanvas,
    pdfRendererPlugin,
    useEnhancedRenderer,
    handleSavePdf,
    handleLocationClick,
  ]);

  const hasAnyOutput = compiledPdf || compiledCanvas;

  return (
    <div className={`latex-output ${className}`} style={{ position: 'relative' }}>
      <div className="output-header">
        <div className="view-tabs">
          <button
            className={`tab-button ${currentView === 'log' ? 'active' : ''}`}
            onClick={() => currentView !== 'log' && toggleOutputView()}
          >
            <div
              className="status-dot"
              style={{ backgroundColor: indicatorColor }}
            />
            {t('Log')}
          </button>
          {currentView === 'output' && (
            <>
              <button
                className={`tab-button ${currentView === 'output' && currentFormat === 'pdf' ? 'active' : ''}`}
                onClick={() => handleTabSwitch('pdf')}
              >
                {t('PDF')}
              </button>
              <button
                className={`tab-button ${currentView === 'output' && currentFormat === 'canvas-pdf' ? 'active' : ''}`}
                onClick={() => handleTabSwitch('canvas-pdf')}
              >
                {t('Canvas (PDF)')}
              </button>
            </>
          )}
          {currentView === 'log' && (
            <button
              className={'tab-button'}
              onClick={() => toggleOutputView()}
              disabled={!hasAnyOutput}
            >
              {t('Output')}
            </button>
          )}
        </div>
        <LaTeXCompileButton
          dropdownKey={'latex-output-dropdown'}
          className="output-compile-button"
          selectedDocId={selectedDocId}
          documents={documents}
          onNavigateToLinkedFile={onNavigateToLinkedFile}
          onExpandLatexOutput={onExpandLatexOutput}
          linkedFileInfo={linkedFileInfo}
          shouldNavigateOnCompile={false}
        />
      </div>

      {!compileLog && !hasAnyOutput ? (
        <div className="empty-state">
          <p>
            {t('No output available. Compile a LaTeX document to see results.')}
          </p>
        </div>
      ) : (
        <>
          {currentView === 'log' && (
            <div className="log-view-container">
              {loggerPlugin ? (
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
                    onCollapse={handleVisualizerCollapse}
                  >
                    <div className="visualizer-panel">
                      {React.createElement(loggerPlugin.renderVisualizer, {
                        log: compileLog,
                        onLineClick: handleLineClick,
                      })}
                    </div>
                  </ResizablePanel>
                  <div className="raw-log-panel">
                    <pre className="log-viewer">{compileLog}</pre>
                  </div>
                </div>
              ) : (
                <div className="log-viewer">
                  <pre>{compileLog}</pre>
                </div>
              )}
            </div>
          )}

          {outputViewerContent}
        </>
      )}

      {sourceMapAvailable && (
        <SourceMapFloatingButton
          onForwardSync={() => {
            document.dispatchEvent(new CustomEvent('trigger-sourcemap-forward'));
          }}
        />
      )}
    </div>
  );
};

export default LaTeXOutput;
