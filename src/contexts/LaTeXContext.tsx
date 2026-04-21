// src/contexts/LaTeXContext.tsx
import { t } from '@/i18n';
import type React from 'react';
import {
  type ReactNode,
  createContext,
  useEffect,
  useCallback,
  useRef,
  useState
} from 'react';

import { useFileTree } from '../hooks/useFileTree';
import { useSettings } from '../hooks/useSettings';
import { latexService } from '../services/LaTeXService';
import { BUSYTEX_BUNDLE_LABELS } from '../extensions/texlyre-busytex/BusyTeXService';
import type { LaTeXContextType, LaTeXOutputFormat, LaTeXEngine } from '../types/latex';
import { parseUrlFragments } from '../utils/urlUtils';
import { pdfWindowService } from '../services/PdfWindowService';

export const LaTeXContext = createContext<LaTeXContextType | null>(null);

interface LaTeXProviderProps {
  children: ReactNode;
}

export const LaTeXProvider: React.FC<LaTeXProviderProps> = ({ children }) => {
  const { fileTree, refreshFileTree } = useFileTree();
  const { registerSetting, getSetting } = useSettings();
  const [isCompiling, setIsCompiling] = useState<boolean>(false);
  const [hasAutoCompiled, setHasAutoCompiled] = useState(false);
  const [compileError, setCompileError] = useState<string | null>(null);
  const [compiledPdf, setCompiledPdf] = useState<Uint8Array | null>(null);
  const [compiledCanvas, setCompiledCanvas] = useState<Uint8Array | null>(null);
  const [compileLog, setCompileLog] = useState<string>('');
  const [currentView, setCurrentView] = useState<'log' | 'output'>('log');
  const [currentFormat, setCurrentFormat] = useState<LaTeXOutputFormat>('pdf');
  const [logIndicator, setLogIndicator] = useState<'idle' | 'success' | 'error'>('idle');
  const [latexEngine, setLatexEngineState] = useState<LaTeXEngine>('pdftex');
  const [activeCompiler, setActiveCompiler] = useState<string | null>(null);
  const settingsRegistered = useRef(false);

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
    if (settingsRegistered.current) return;
    settingsRegistered.current = true;

    const initialEngine =
      getSetting('latex-engine')?.value as LaTeXEngine ?? 'pdftex';
    const initialTexliveEndpoint =
      getSetting('latex-texlive-endpoint')?.value as string ?? 'http://texlive.localhost:8082';
    const initialStoreCache =
      getSetting('latex-store-cache')?.value as boolean ?? true;
    const initialStoreWorkingDirectory =
      getSetting('latex-store-working-directory')?.value as boolean ?? false;
    const initialAutoCompile =
      getSetting('latex-auto-compile-on-open')?.value as boolean ?? false;
    const initialDefaultFormat =
      getSetting('latex-default-format')?.value as LaTeXOutputFormat ?? 'pdf';
    const initialAutoNavigate =
      getSetting('latex-auto-navigate-to-main')?.value as string ?? 'conditional';
    const initialBusyTeXEndpoint =
      getSetting('latex-busytex-endpoint')?.value as string ?? 'http://texlive2026.localhost:8082';
    const initialBusyTeXBundles =
      getSetting('latex-busytex-bundles')?.value as string ?? 'recommended';

    setLatexEngineState(initialEngine);
    setCurrentFormat(initialDefaultFormat);

    latexService.setTexliveEndpoint(initialTexliveEndpoint);
    latexService.setStoreCache(initialStoreCache);
    latexService.setStoreWorkingDirectory(initialStoreWorkingDirectory);
    latexService.setBusyTeXEndpoint(initialBusyTeXEndpoint);
    latexService.setBusyTeXBundles(initialBusyTeXBundles.split(',').filter(Boolean));

    registerSetting({
      id: 'latex-engine',
      category: t('Compilation'),
      subcategory: t('LaTeX'),
      type: 'select',
      label: t('LaTeX Engine'),
      description: t('Choose the LaTeX engine for compilation'),
      defaultValue: initialEngine,
      options: [
        { label: t('pdfTeX (SwiftLaTeX / TeX Live 2020)'), value: 'pdftex' },
        { label: t('XeTeX (SwiftLaTeX / TeX Live 2020)'), value: 'xetex' },
        { label: t('pdfTeX (BusyTeX / TeX Live 2026)'), value: 'busytex-pdftex' },
        { label: t('XeTeX (BusyTeX / TeX Live 2026)'), value: 'busytex-xetex' },
        { label: t('LuaTeX (BusyTeX / TeX Live 2026)'), value: 'busytex-luatex' },
      ],
      onChange: (value) => {
        handleSetLatexEngine(value as LaTeXEngine);
      },
    });

    registerSetting({
      id: 'latex-texlive-endpoint',
      category: t('Compilation'),
      subcategory: t('LaTeX'),
      type: 'text',
      label: t('TexLive server endpoint (SwiftLaTeX)'),
      description: t('URL endpoint for TexLive package downloads used by SwiftLaTeX engines'),
      defaultValue: initialTexliveEndpoint,
      onChange: (value) => {
        latexService.setTexliveEndpoint(value as string);
      },
    });

    registerSetting({
      id: 'latex-busytex-endpoint',
      category: t('Compilation'),
      subcategory: t('LaTeX'),
      type: 'text',
      label: t('TeX Live 2026 remote endpoint (BusyTeX)'),
      description: t('On-demand TeX Live 2026 server for packages beyond preloaded bundles. Leave blank to disable.'),
      defaultValue: initialBusyTeXEndpoint,
      onChange: (value) => {
        latexService.setBusyTeXEndpoint(value as string);
      },
    });

    registerSetting({
      id: 'latex-busytex-bundles',
      category: t('Compilation'),
      subcategory: t('LaTeX'),
      type: 'select',
      label: t('BusyTeX preloaded bundle'),
      description: t('TeX Live 2026 package bundle to preload. Larger bundles take longer to download but cover more packages offline.'),
      defaultValue: initialBusyTeXBundles,
      options: Object.entries(BUSYTEX_BUNDLE_LABELS).map(([id, label]) => ({
        label: t(label),
        value: id,
      })),
      onChange: (value) => {
        const bundles = (value as string).split(',').filter(Boolean);
        latexService.setBusyTeXBundles(bundles);
      },
    });

    registerSetting({
      id: 'latex-sourcemap-enabled',
      category: t('Compilation'),
      subcategory: t('LaTeX'),
      type: 'checkbox',
      label: t('Enable source map (SyncTeX)'),
      description: t('Enable SyncTeX source mapping between editor and PDF output'),
      defaultValue: true,
    });

    registerSetting({
      id: 'latex-auto-compile-on-open',
      category: t('Compilation'),
      subcategory: t('LaTeX'),
      type: 'checkbox',
      label: t('Auto-compile on project open'),
      description: t('Automatically compile LaTeX when opening a project'),
      defaultValue: initialAutoCompile,
    });

    registerSetting({
      id: 'latex-auto-navigate-to-main',
      category: t('Compilation'),
      subcategory: t('LaTeX'),
      type: 'select',
      label: t('Auto-navigate to main file on compile'),
      description: t('Control when to automatically navigate to the main LaTeX file during compilation'),
      defaultValue: initialAutoNavigate,
      options: [
        { label: t('Only when no LaTeX file is open'), value: 'conditional' },
        { label: t('Always navigate to main file'), value: 'always' },
        { label: t('Never navigate to main file'), value: 'never' },
      ],
    });

    registerSetting({
      id: 'latex-default-format',
      category: t('Compilation'),
      subcategory: t('LaTeX'),
      type: 'select',
      label: t('Default output format'),
      description: t('Default format for LaTeX compilation'),
      defaultValue: initialDefaultFormat,
      options: [
        { label: t('PDF'), value: 'pdf' },
        { label: t('Canvas (PDF)'), value: 'canvas-pdf' },
      ],
      onChange: (value) => {
        setCurrentFormat(value as LaTeXOutputFormat);
      },
    });

    registerSetting({
      id: 'latex-store-cache',
      category: t('Compilation'),
      subcategory: t('LaTeX'),
      type: 'checkbox',
      label: t('Store compilation cache'),
      description: t('Save TeX cache files for faster subsequent compilations'),
      defaultValue: initialStoreCache,
      onChange: (value) => {
        latexService.setStoreCache(value as boolean);
      },
    });

    registerSetting({
      id: 'latex-store-working-directory',
      category: t('Compilation'),
      subcategory: t('LaTeX'),
      type: 'checkbox',
      label: t('Store working directory'),
      description: t('Save all working directory files after compilation'),
      defaultValue: initialStoreWorkingDirectory,
      onChange: (value) => {
        latexService.setStoreWorkingDirectory(value as boolean);
      },
    });

    registerSetting({
      id: 'latex-notifications',
      category: t('Compilation'),
      subcategory: t('LaTeX'),
      type: 'checkbox',
      label: t('Show compilation notifications'),
      description: t('Display notifications for LaTeX compilation activities'),
      defaultValue: true,
      onChange: () => { },
    });
  }, [registerSetting, getSetting]);

  useEffect(() => {
    return latexService.addStatusListener(() => {
      setIsCompiling(latexService.getStatus() === 'compiling');
    });
  }, []);

  const handleSetLatexEngine = async (engine: LaTeXEngine): Promise<void> => {
    if (engine === latexEngine) return;
    setLatexEngineState(engine);
  };

  const getProjectName = (): string => {
    if (document.title && document.title !== 'TeXlyre') return document.title;
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
    setCurrentFormat(format);

    if (latexService.getCurrentEngineType() !== latexEngine) {
      await latexService.setEngine(latexEngine);
    } else if (!latexService.isReady()) {
      await latexService.initialize(latexEngine);
    }

    setIsCompiling(true);
    setCompileError(null);
    setActiveCompiler('latex');

    if (format === 'canvas-pdf') {
      setCompiledPdf(null);
    } else {
      setCompiledCanvas(null);
    }

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
            pdfWindowService.sendPdfUpdate(result.pdf, fileName, getProjectName());
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
  }, [getSetting, handleSetLatexEngine, hasAutoCompiled]);

  const clearCache = async (): Promise<void> => {
    try {
      await latexService.clearCacheDirectories();
      await refreshFileTree();
    } catch (error) {
      console.error('Failed to clear cache:', error);
      setCompileError('Failed to clear cache');
    }
  };

  const compileWithClearCache = async (mainFileName: string): Promise<void> => {
    if (latexService.getCurrentEngineType() !== latexEngine) {
      await latexService.setEngine(latexEngine);
    } else if (!latexService.isReady()) {
      await latexService.initialize(latexEngine);
    }

    const format = currentFormat;
    setIsCompiling(true);
    setCompileError(null);
    setActiveCompiler('latex');

    if (format === 'canvas-pdf') {
      setCompiledPdf(null);
    } else {
      setCompiledCanvas(null);
    }

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
            pdfWindowService.sendPdfUpdate(result.pdf, fileName, getProjectName());
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

  const stopCompilation = () => {
    if (isCompiling && latexService.isCompiling()) {
      latexService.stopCompilation();
      setIsCompiling(false);
      setCompileError('Compilation stopped by user');
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
    } = {}
  ): Promise<void> => {
    await latexService.exportDocument(mainFileName, fileTree, options);
  };

  const toggleOutputView = () => {
    setCurrentView(currentView === 'log' ? 'output' : 'log');
  };

  return (
    <LaTeXContext.Provider
      value={{
        isCompiling,
        compileError,
        compiledPdf,
        compiledCanvas,
        compileLog,
        compileDocument,
        stopCompilation,
        toggleOutputView,
        currentView,
        currentFormat,
        setCurrentFormat,
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
