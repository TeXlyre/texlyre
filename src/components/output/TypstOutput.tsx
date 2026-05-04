// src/components/output/TypstOutput.tsx
import { t } from '@/i18n';
import React from 'react';
import { useEffect, useRef, useState, useMemo, useCallback } from 'react';

import { fileStorageService } from '../../services/FileStorageService';
import { useFileTree } from '../../hooks/useFileTree';
import { useTypst } from '../../hooks/useTypst';
import { useSourceMap } from '../../hooks/useSourceMap';
import { useProperties } from '../../hooks/useProperties';
import { useSettings } from '../../hooks/useSettings';
import { pluginRegistry } from '../../plugins/PluginRegistry';
import type { RendererController } from '../../plugins/PluginInterface'
import type { FileNode } from '../../types/files';
import ResizablePanel from '../common/ResizablePanel';
import TypstCompileButton from './TypstCompileButton';
import { isTypstFile, isTemporaryFile, toArrayBuffer } from '../../utils/fileUtils';
import { TypstOutputFormat } from '../../types/typst';
import type { SourceMapClickMode } from '../../types/sourceMap';

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
    logIndicator,
    toggleOutputView,
    currentFormat,
    compileDocument
  } = useTypst();

  const projectId = fileStorageService.getCurrentProjectId() || undefined;
  const { selectedFileId, getFile, fileTree } = useFileTree();
  const { getSetting } = useSettings();
  const { getProperty, setProperty, registerProperty } = useProperties();
  const propertiesRegistered = useRef(false);

  const [visualizerHeight, setVisualizerHeight] = useState(300);
  const [visualizerCollapsed, setVisualizerCollapsed] = useState(false);
  const [autoMainFile, setAutoMainFile] = useState<string | undefined>();

  const settingFormat = getSetting('typst-default-format')?.value as TypstOutputFormat ?? 'pdf';

  const propMainFile = getProperty('typst-main-file', { scope: 'project', projectId }) as string | undefined;
  const propFormat = getProperty('typst-output-format', { scope: 'project', projectId }) as TypstOutputFormat | undefined;

  const effectiveMainFile = propMainFile || autoMainFile;
  const effectiveFormat = propFormat || currentFormat || settingFormat;

  const {
    reverseSync,
    currentHighlight,
    reverseClickEnabled,
    reverseClickMode,
  } = useSourceMap();

  const canvasControllerRef = useRef<RendererController | null>(null);
  const clickCountRef = useRef(0);
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const useEnhancedRenderer = getSetting('pdf-renderer-enable')?.value ?? true;
  const loggerPlugin = pluginRegistry.getLoggerForType('typst');



  const indicatorColor = {
    idle: '#777',
    success: '#28a745',
    warn: '#ffc107',
    error: '#dc3545',
  }[logIndicator ?? 'idle'];

  useEffect(() => {
    if (compiledCanvas && (effectiveFormat === 'canvas' || effectiveFormat === 'canvas-pdf') && canvasControllerRef.current?.updateContent) {
      canvasControllerRef.current.updateContent(compiledCanvas);
    }
  }, [compiledCanvas, effectiveFormat]);

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

    registerProperty({
      id: 'typst-main-file',
      category: 'Compilation',
      subcategory: 'Typst',
      defaultValue: undefined,
    });

    registerProperty({
      id: 'typst-output-format',
      category: 'Compilation',
      subcategory: 'Typst',
      defaultValue: 'pdf',
    });
  }, [registerProperty]);

  useEffect(() => {
    const findTypstFiles = (nodes: FileNode[]): string[] => {
      const typstFiles: string[] = [];

      for (const node of nodes) {
        if (
          node.type === 'file' &&
          isTypstFile(node.path) &&
          !isTemporaryFile(node.path)
        ) {
          typstFiles.push(node.path);
        }

        if (node.children) {
          typstFiles.push(...findTypstFiles(node.children));
        }
      }

      return typstFiles;
    };

    const allTypstFiles = findTypstFiles(fileTree);

    const findMainFile = async () => {
      if (
        selectedDocId &&
        linkedFileInfo?.filePath &&
        isTypstFile(linkedFileInfo.filePath)
      ) {
        setAutoMainFile(linkedFileInfo.filePath);
        return;
      }

      if (selectedFileId) {
        const file = await getFile(selectedFileId);
        if (file && isTypstFile(file.path)) {
          setAutoMainFile(file.path);
          return;
        }
      }

      if (autoMainFile && allTypstFiles.includes(autoMainFile)) {
        return;
      }

      setAutoMainFile(allTypstFiles[0]);
    };

    findMainFile();
  }, [
    fileTree,
    selectedFileId,
    selectedDocId,
    linkedFileInfo,
    getFile,
    autoMainFile,
  ]);

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

  useEffect(() => {
    if (canvasControllerRef.current?.setHighlight) {
      canvasControllerRef.current.setHighlight(currentHighlight);
    }
  }, [currentHighlight]);

  useEffect(() => {
    return () => {
      if (clickTimerRef.current) {
        clearTimeout(clickTimerRef.current);
      }
    };
  }, []);

  const handleLocationClick = useCallback(
    (page: number, x: number, y: number) => {
      if (!reverseClickEnabled) return;

      clickCountRef.current++;

      if (clickTimerRef.current) {
        clearTimeout(clickTimerRef.current);
      }

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

  const resolveCompileTarget = useCallback(async (): Promise<string | undefined> => {
    if (effectiveMainFile) {
      return effectiveMainFile;
    }

    if (
      selectedDocId &&
      linkedFileInfo?.filePath &&
      isTypstFile(linkedFileInfo.filePath)
    ) {
      return linkedFileInfo.filePath;
    }

    if (selectedFileId) {
      const file = await getFile(selectedFileId);

      if (file && isTypstFile(file.path)) {
        return file.path;
      }
    }

    return undefined;
  }, [
    effectiveMainFile,
    selectedDocId,
    linkedFileInfo,
    selectedFileId,
    getFile,
  ]);

  const handleTabSwitch = useCallback(
    async (format: TypstOutputFormat) => {
      if (effectiveFormat === format) return;

      setProperty('typst-output-format', format, {
        scope: 'project',
        projectId,
      });

      const mainFile = await resolveCompileTarget();

      if (mainFile) {
        await compileDocument(mainFile, format);
      }
    },
    [
      effectiveFormat,
      setProperty,
      projectId,
      resolveCompileTarget,
      compileDocument,
    ],
  );

  const outputViewerContent = useMemo(() => {
    console.log('[TypstOutput] outputViewerContent recalculating', {
      currentView,
      effectiveFormat,
      hasCompiledPdf: !!compiledPdf,
      hasCompiledSvg: !!compiledSvg,
      hasCompiledCanvas: !!compiledCanvas
    });
    if (currentView !== 'output') return null;

    if (effectiveFormat === 'pdf' && compiledPdf) {
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

    if (effectiveFormat === 'canvas' || effectiveFormat === 'canvas-pdf') {
      const canvasRenderer = pluginRegistry.getRendererForOutput('canvas', 'canvas-renderer');

      return (
        <div className="canvas-viewer">
          {canvasRenderer ?
            React.createElement(canvasRenderer.renderOutput, {
              content: compiledCanvas || new ArrayBuffer(0),
              mimeType: effectiveFormat === 'canvas-pdf' ? 'application/pdf' : 'image/svg+xml',
              fileName: effectiveFormat === 'canvas-pdf' ? 'output.pdf' : 'output.svg',
              controllerRef: (controller) => { canvasControllerRef.current = controller; },
              onLocationClick: handleLocationClick,
            }) :
            <div className="canvas-fallback">{t('Canvas renderer not available')}</div>
          }
        </div>
      );
    }

    return null;
  }, [currentView,
    effectiveFormat,
    !!compiledPdf,
    !!compiledCanvas,
    useEnhancedRenderer,
    handleSavePdf]);

  const hasAnyOutput = compiledPdf || compiledCanvas;

  return (
    <div className={`typst-output ${className}`}>
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
          {currentView === 'output' &&
            <>
              <button
                className={`tab-button ${currentView === 'output' && effectiveFormat === 'pdf' ? 'active' : ''}`}
                onClick={() => handleTabSwitch('pdf')}>{t('PDF')}
              </button>

              <button
                className={`tab-button ${currentView === 'output' && effectiveFormat === 'canvas-pdf' ? 'active' : ''}`}
                onClick={() => handleTabSwitch('canvas-pdf')}>{t('Canvas (PDF)')}
              </button>
              <button
                className={`tab-button ${currentView === 'output' && effectiveFormat === 'canvas' ? 'active' : ''}`}
                onClick={() => handleTabSwitch('canvas')}>{t('Canvas (SVG)')}
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