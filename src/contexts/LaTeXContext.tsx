// src/contexts/LaTeXContext.tsx
import { t } from '@/i18n';
import type React from 'react';
import {
  type ReactNode,
  createContext,
  useEffect,
  useCallback,
  useState
} from 'react';

import { useFileTree } from '../hooks/useFileTree';
import { useSettings } from '../hooks/useSettings';
import { latexService } from '../services/LaTeXService';
import type { LaTeXContextType, LaTeXOutputFormat, LaTeXEngine } from '../types/latex';
import { parseUrlFragments } from '../utils/urlUtils';
import { pdfWindowService } from '../services/PdfWindowService';

export const LaTeXContext = createContext<LaTeXContextType | null>(null);

interface LaTeXProviderProps {
  children: ReactNode;
}

export const LaTeXProvider: React.FC<LaTeXProviderProps> = ({ children }) => {
  const { fileTree, refreshFileTree } = useFileTree();
  const { getSetting, updateSetting } = useSettings();
  const [isCompiling, setIsCompiling] = useState<boolean>(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [hasAutoCompiled, setHasAutoCompiled] = useState(false);
  const [compileError, setCompileError] = useState<string | null>(null);
  const [compiledPdf, setCompiledPdf] = useState<Uint8Array | null>(null);
  const [compiledCanvas, setCompiledCanvas] = useState<Uint8Array | null>(null);
  const [compileLog, setCompileLog] = useState<string>('');
  const [currentView, setCurrentView] = useState<'log' | 'output'>('log');
  const [logIndicator, setLogIndicator] = useState<'idle' | 'success' | 'error'>('idle');
  const [activeCompiler, setActiveCompiler] = useState<string | null>(null);

  const latexEngine =
    getSetting('latex-engine')?.value as LaTeXEngine ?? 'pdftex';
  const currentFormat =
    getSetting('latex-default-format')?.value as LaTeXOutputFormat ?? 'pdf';
  const texliveEndpoint =
    getSetting('latex-texlive-endpoint')?.value as string ?? 'http://texlive.localhost:8082';
  const storeCache =
    getSetting('latex-store-cache')?.value as boolean ?? true;
  const storeWorkingDirectory =
    getSetting('latex-store-working-directory')?.value as boolean ?? false;
  const busyTeXEndpoint =
    getSetting('latex-busytex-endpoint')?.value as string ?? 'http://texlive2026.localhost:8082';
  const busyTeXBundles =
    getSetting('latex-busytex-bundles')?.value as string ?? 'recommended';

  useEffect(() => {
    const handleCompilerActive = (event: CustomEvent) => {
      setActiveCompiler(event.detail.type);
    };
    document.addEventListener('compiler-active', handleCompilerActive as EventListener);
    return () => {
      document.removeEventListener('compiler-active', handleCompilerActive as EventListener);
    };
  }, []);

  useEffect(() => {
    latexService.setTexliveEndpoint(texliveEndpoint);
    latexService.setStoreCache(storeCache);
    latexService.setStoreWorkingDirectory(storeWorkingDirectory);
    latexService.setBusyTeXEndpoint(busyTeXEndpoint);
    latexService.setBusyTeXBundles(busyTeXBundles.split(',').filter(Boolean));
  }, [
    texliveEndpoint,
    storeCache,
    storeWorkingDirectory,
    busyTeXEndpoint,
    busyTeXBundles
  ]);

  const getProjectName = (): string => {
    if (document.title && document.title !== 'TeXlyre') {
      return document.title;
    }

    const hash = window.location.hash;
    if (hash.includes('yjs:')) {
      const projectId = hash.split('yjs:')[1].split('&')[0];
      return `Project ${projectId.substring(0, 8)}`;
    }

    return 'LaTeX Project';
  };

  const compileDocument = async (
    mainFileName: string,
    format: LaTeXOutputFormat = currentFormat
  ): Promise<void> => {
    if (format !== currentFormat) {
      updateSetting('latex-default-format', format);
    }

    try {
      const engineToUse = latexService.getCurrentEngineType();
      if (!latexService.isReady()) {
        await latexService.initialize(engineToUse);
      }
    } finally {
      setIsInitializing(false);
    }

    setIsCompiling(true);
    setCompileError(null);
    setActiveCompiler('latex');

    setCompiledPdf(null);
    setCompiledCanvas(null);

    try {
      const result = await latexService.compileLaTeX(mainFileName, fileTree, format);

      setCompileLog(result.log);
      if (result.status === 0 && result.pdf) {
        switch (format) {
          case 'pdf':
            setCompiledPdf(result.pdf);
            setCurrentView('output');
            setLogIndicator('success');
            const fileName = mainFileName.split('/').pop()?.replace(/\.(tex|ltx|latex)$/i, '.pdf') || 'output.pdf';
            const projectName = getProjectName();

            pdfWindowService.sendPdfUpdate(
              result.pdf,
              fileName,
              projectName
            );
            break;
          case 'canvas-pdf':
            setCompiledCanvas(result.pdf);
            setCurrentView('output');
            setLogIndicator('success');
            break;
        }
      } else {
        setCompileError(t('Compilation failed. Check the log in the main window.'));
        if (format === 'pdf') setCurrentView('log');
        setLogIndicator('error');

        pdfWindowService.sendCompileResult(result.status, result.log);
      }

      await refreshFileTree();
    } catch (error) {
      setCompileError(error instanceof Error ? error.message : t('Unknown error'));
      setCurrentView('log');
      setLogIndicator('error');

      pdfWindowService.sendCompileResult(-1, error instanceof Error ? error.message : t('Unknown error'));
    } finally {
      setIsCompiling(false);
    }
  };

  const triggerAutoCompile = useCallback(() => {
    const hashUrl = window.location.hash.substring(1);
    const fragments = parseUrlFragments(hashUrl);

    if (fragments.compile) {
      const cleanUrl = hashUrl.replace(/&compile:[^&]*/, '');
      window.location.hash = cleanUrl;

      const engine = fragments.compile as LaTeXEngine;
      if (['pdftex', 'xetex', 'busytex-pdftex', 'busytex-xetex', 'busytex-luatex'].includes(engine)) {
        handleSetLatexEngine(engine).then(() => {
          document.dispatchEvent(new CustomEvent('trigger-compile'));
        });
        setHasAutoCompiled(true);
        return;
      }
    }

    const autoCompileEnabled = getSetting('latex-auto-compile-on-open')?.value as boolean ?? false;
    if (autoCompileEnabled && !hasAutoCompiled) {
      document.dispatchEvent(new CustomEvent('trigger-compile'));
      setHasAutoCompiled(true);
    }
  }, [getSetting, hasAutoCompiled, latexEngine]);

  const stopCompilation = () => {
    if (isCompiling && latexService.isCompiling()) {
      latexService.stopCompilation();
      latexService.dismissCurrentNotification();
      setIsCompiling(false);
      setCompileError(t('Compilation stopped by user'));
    }
  };

  const exportDocument = async (
    mainFileName: string,
    options: {
      engine?: LaTeXEngine;
      format?: 'pdf' | 'dvi';
      includeLog?: boolean;
      includeDvi?: boolean;
      includeBbl?: boolean;
      includeWorkDir?: boolean;
    } = {}
  ): Promise<void> => {
    try {
      await latexService.exportDocument(mainFileName, fileTree, options);
    } finally {
      setIsExporting(false);
    }
  };

  const toggleOutputView = () => {
    setCurrentView(currentView === 'log' ? 'output' : 'log');
  };

  const clearCache = async (): Promise<void> => {
    try {
      await latexService.clearCacheDirectories();
      await refreshFileTree();
    } catch (error) {
      console.error('Failed to clear cache:', error);
      setCompileError('Failed to clear cache');
    }
  };

  const compileWithClearCache = async (
    mainFileName: string,
    format: LaTeXOutputFormat = currentFormat
  ): Promise<void> => {
    if (format !== currentFormat) {
      updateSetting('latex-default-format', format);
    }

    try {
      const engineToUse = latexService.getCurrentEngineType();
      if (!latexService.isReady()) {
        await latexService.initialize(engineToUse);
      }
    } finally {
      setIsInitializing(false);
    }

    setIsCompiling(true);
    setCompileError(null);
    setActiveCompiler('latex');

    setCompiledPdf(null);
    setCompiledCanvas(null);

    try {
      const result = await latexService.clearCacheAndCompile(mainFileName, fileTree, format);

      setCompileLog(result.log);
      if (result.status === 0 && result.pdf) {
        switch (format) {
          case 'pdf':
            setCompiledPdf(result.pdf);
            setCurrentView('output');
            setLogIndicator('success');
            const fileName = mainFileName.split('/').pop()?.replace(/\.(tex|ltx|latex)$/i, '.pdf') || 'output.pdf';
            const projectName = getProjectName();

            pdfWindowService.sendPdfUpdate(
              result.pdf,
              fileName,
              projectName
            );
            break;
          case 'canvas-pdf':
            setCompiledCanvas(result.pdf);
            setCurrentView('output');
            setLogIndicator('success');
            break;
        }
      } else {
        setCompileError(t('Compilation failed. Check the log in the main window.'));
        if (format === 'pdf') setCurrentView('log');
        setLogIndicator('error');

        pdfWindowService.sendCompileResult(result.status, result.log);
      }

      await refreshFileTree();
    } catch (error) {
      setCompileError(error instanceof Error ? error.message : t('Unknown error'));
      setCurrentView('log');
      setLogIndicator('error');

      pdfWindowService.sendCompileResult(-1, error instanceof Error ? error.message : t('Unknown error'));
    } finally {
      setIsCompiling(false);
    }
  };

  const handleSetLatexEngine = useCallback(async (engine: LaTeXEngine): Promise<void> => {
    if (engine === latexEngine) return;
    updateSetting('latex-engine', engine);
  }, [latexEngine, updateSetting]);

  const handleSetCurrentFormat = useCallback((format: LaTeXOutputFormat) => {
    if (format === currentFormat) return;
    updateSetting('latex-default-format', format);
  }, [currentFormat, updateSetting]);

  return (
    <LaTeXContext.Provider
      value={{
        isCompiling,
        isInitializing,
        setIsInitializing,
        isExporting,
        setIsExporting,
        compileError,
        compiledPdf,
        compiledCanvas,
        compileLog,
        currentFormat,
        setCurrentFormat: handleSetCurrentFormat,
        compileDocument,
        stopCompilation,
        toggleOutputView,
        currentView,
        logIndicator,
        latexEngine,
        setLatexEngine: handleSetLatexEngine,
        clearCache,
        compileWithClearCache,
        triggerAutoCompile,
        activeCompiler,
        exportDocument,
      }}>
      {children}
    </LaTeXContext.Provider>
  );
};