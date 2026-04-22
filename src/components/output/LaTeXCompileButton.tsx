// src/components/output/LaTeXCompileButton.tsx
import { t } from '@/i18n';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';

import PdfWindowToggleButton from './PopoutViewerToggleButton';
import PositionedDropdown from '../common/PositionedDropdown';
import { usePersistentState } from '../../hooks/usePersistentState';
import { useCollab } from '../../hooks/useCollab';
import { useFileTree } from '../../hooks/useFileTree';
import { useLaTeX } from '../../hooks/useLaTeX';
import { useSettings } from '../../hooks/useSettings';
import { useProperties } from '../../hooks/useProperties';
import type { LaTeXOutputFormat, LaTeXEngine } from '../../types/latex';
import type { DocumentList } from '../../types/documents';
import type { FileNode } from '../../types/files';
import { isLatexFile, isTemporaryFile } from '../../utils/fileUtils';
import { fileStorageService } from '../../services/FileStorageService';
import { latexService } from '../../services/LaTeXService';
import { BUSYTEX_BUNDLE_LABELS } from '../../extensions/texlyre-busytex/BusyTeXService';
import { ChevronDownIcon, ClearCompileIcon, PlayIcon, StopIcon, TrashIcon, OptionsIcon } from '../common/Icons';

interface LaTeXCompileButtonProps {
  dropdownKey?: string;
  className?: string;
  selectedDocId?: string | null;
  documents?: Array<{ id: string; name: string; }>;
  onNavigateToLinkedFile?: () => void;
  onExpandLatexOutput?: () => void;
  linkedFileInfo?: {
    fileName?: string;
    filePath?: string;
    fileId?: string;
  } | null;
  shouldNavigateOnCompile?: boolean;
  useSharedSettings?: boolean;
}

const SWIFT_ENGINES: Array<{ label: string; value: LaTeXEngine }> = [
  { label: 'pdfTeX (SwiftLaTeX)', value: 'pdftex' },
  { label: 'XeTeX (SwiftLaTeX)', value: 'xetex' },
];

const BUSYTEX_ENGINES: Array<{ label: string; value: LaTeXEngine }> = [
  { label: 'pdfTeX (BusyTeX)', value: 'busytex-pdftex' },
  { label: 'XeTeX (BusyTeX)', value: 'busytex-xetex' },
  { label: 'LuaTeX (BusyTeX)', value: 'busytex-luatex' },
];

const LaTeXCompileButton: React.FC<LaTeXCompileButtonProps> = ({
  dropdownKey,
  className = '',
  selectedDocId,
  documents,
  onNavigateToLinkedFile,
  onExpandLatexOutput,
  linkedFileInfo,
  shouldNavigateOnCompile = false,
  useSharedSettings = false
}) => {
  const {
    isCompiling,
    isInitializing,
    setIsInitializing,
    isExporting,
    compileDocument,
    stopCompilation,
    latexEngine,
    setLatexEngine,
    clearCache,
    compileWithClearCache,
    currentFormat,
    setCurrentFormat
  } = useLaTeX();
  const { selectedFileId, getFile, fileTree } = useFileTree();
  const { data: doc, changeData: changeDoc } = useCollab<DocumentList>();
  const { getSetting } = useSettings();
  const { getProperty, setProperty, registerProperty } = useProperties();
  const [autoMainFile, setAutoMainFile] = useState<string | undefined>();
  const [userSelectedMainFile, setUserSelectedMainFile] = useState<string | undefined>();
  const [availableTexFiles, setAvailableTexFiles] = useState<string[]>([]);
  const [isChangingEngine, setIsChangingEngine] = useState(false);
  const [bundleCacheStatus, setBundleCacheStatus] = useState<Record<string, boolean>>({});
  const [isDeletingBundle, setIsDeletingBundle] = useState<string | null>(null);
  const [selectedBundle, setSelectedBundle] = useState<string>('recommended');
  const [isCacheOptionsOpen, setIsCacheOptionsOpen] = useState(false);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const [isDropdownOpen, setIsDropdownOpen] = usePersistentState(dropdownKey, false);
  const propertiesRegistered = useRef(false);
  const [propertiesLoaded, setPropertiesLoaded] = useState(false);

  const isBusyTeX = latexEngine.startsWith('busytex-');

  const projectMainFile = useSharedSettings ? doc?.projectMetadata?.mainFile : undefined;
  const effectiveAutoCompileOnSave = useSharedSettings
    ? doc?.projectMetadata?.latexAutoCompileOnSave ?? false
    : false;
  const projectEngine = useSharedSettings ? doc?.projectMetadata?.latexEngine : undefined;
  const effectiveEngine = projectEngine || latexEngine;
  const effectiveMainFile = projectMainFile || userSelectedMainFile || autoMainFile;

  useEffect(() => {
    if (propertiesRegistered.current) return;
    propertiesRegistered.current = true;

    registerProperty({
      id: 'latex-main-file',
      category: 'Compilation',
      subcategory: 'LaTeX',
      defaultValue: undefined
    });

    registerProperty({
      id: 'latex-engine',
      category: 'Compilation',
      subcategory: 'LaTeX',
      defaultValue: 'pdftex'
    });

    registerProperty({
      id: 'latex-output-format',
      category: 'Compilation',
      subcategory: 'LaTeX',
      defaultValue: 'pdf'
    });

    registerProperty({
      id: 'latex-busytex-bundle',
      category: 'Compilation',
      subcategory: 'LaTeX',
      defaultValue: 'recommended'
    });
  }, [registerProperty]);

  useEffect(() => {
    if (propertiesLoaded) return;

    const storedMainFile = getProperty('latex-main-file');
    const storedEngine = getProperty('latex-engine');
    const storedFormat = getProperty('latex-output-format');
    const storedBundle = getProperty('latex-busytex-bundle');

    if (storedMainFile !== undefined) setUserSelectedMainFile(storedMainFile as string | undefined);
    if (storedEngine !== undefined) setLatexEngine(storedEngine as LaTeXEngine);
    if (storedFormat !== undefined) setCurrentFormat(storedFormat as LaTeXOutputFormat);
    if (storedBundle !== undefined) {
      setSelectedBundle(storedBundle as string);
      latexService.setBusyTeXBundles([storedBundle as string]);
    }

    setPropertiesLoaded(true);
  }, [getProperty, propertiesLoaded, setLatexEngine]);

  useEffect(() => {
    const findTexFiles = (nodes: FileNode[]): string[] => {
      const texFiles: string[] = [];
      for (const node of nodes) {
        if (node.type === 'file' && isLatexFile(node.path) && !isTemporaryFile(node.path)) {
          texFiles.push(node.path);
        }
        if (node.children) texFiles.push(...findTexFiles(node.children));
      }
      return texFiles;
    };

    const allTexFiles = findTexFiles(fileTree);
    setAvailableTexFiles(allTexFiles);

    const findMainFile = async () => {
      if (autoMainFile && allTexFiles.includes(autoMainFile)) return;

      if (selectedDocId && linkedFileInfo?.filePath && isLatexFile(linkedFileInfo.filePath)) {
        setAutoMainFile(linkedFileInfo.filePath);
        return;
      }

      if (selectedFileId) {
        const file = await getFile(selectedFileId);
        if (file && isLatexFile(file.path)) {
          setAutoMainFile(file.path);
          return;
        }
      }

      setAutoMainFile(allTexFiles[0]);
    };

    findMainFile();
  }, [selectedFileId, getFile, fileTree, selectedDocId, linkedFileInfo]);

  useEffect(() => {
    if (useSharedSettings && projectEngine && projectEngine !== latexEngine) {
      setLatexEngine(projectEngine as LaTeXEngine);
    }
  }, [projectEngine, latexEngine, setLatexEngine, useSharedSettings]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (dropdownRef.current && !dropdownRef.current.contains(target)) {
        const portaledDropdown = document.querySelector('.latex-dropdown');
        if (portaledDropdown && portaledDropdown.contains(target)) return;
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isDropdownOpen]);

  useEffect(() => {
    if (!useSharedSettings || !effectiveAutoCompileOnSave || !effectiveMainFile) return;

    const handleFileSaved = async (event: Event) => {
      if (isCompiling) return;
      try {
        const customEvent = event as CustomEvent;
        const detail = customEvent.detail;
        if (!detail) return;

        const candidatePath = detail.isFile
          ? detail.fileId
            ? detail.filePath || (await fileStorageService.getFile(detail.fileId))?.path
            : undefined
          : linkedFileInfo?.filePath ?? detail.filePath;

        if (!candidatePath || !isLatexFile(candidatePath)) return;

        const mainFileToCompile = detail.isFile ? effectiveMainFile : candidatePath;

        setTimeout(async () => {
          if (onExpandLatexOutput) onExpandLatexOutput();
          await compileDocument(mainFileToCompile);
        }, 120);
      } catch (error) {
        console.error('Error in auto-compile on save:', error);
      }
    };

    document.addEventListener('file-saved', handleFileSaved);
    return () => document.removeEventListener('file-saved', handleFileSaved);
  }, [
    useSharedSettings, effectiveAutoCompileOnSave, effectiveMainFile, isCompiling,
    compileDocument, onExpandLatexOutput, linkedFileInfo,
  ]);

  useEffect(() => {
    if (!isBusyTeX || !isCacheOptionsOpen) return;

    const checkBundleCache = async () => {
      const status: Record<string, boolean> = {};
      for (const bundleId of Object.keys(BUSYTEX_BUNDLE_LABELS)) {
        status[bundleId] = await latexService.isBusyTeXBundleCached(bundleId);
      }
      setBundleCacheStatus(status);
    };

    checkBundleCache();
  }, [isBusyTeX, isCacheOptionsOpen]);

  const shouldNavigateToMain = async (mainFilePath: string): Promise<boolean> => {
    const navigationSetting = getSetting('latex-auto-navigate-to-main')?.value as string ?? 'conditional';

    if (navigationSetting === 'never') return false;
    if (navigationSetting === 'always') return true;

    if (navigationSetting === 'conditional') {
      if (selectedFileId) {
        try {
          const currentFile = await getFile(selectedFileId);
          if (currentFile && isLatexFile(currentFile.path)) return false;
        } catch (error) {
          console.warn('Error getting current file:', error);
        }
      }
      if (selectedDocId && linkedFileInfo?.fileName && isLatexFile(linkedFileInfo.fileName)) return false;
      return true;
    }

    return false;
  };

  const handleCompileOrStop = async () => {
    if (isCompiling) {
      stopCompilation();
    } else if (effectiveMainFile) {
      setIsInitializing(true);
      if (onExpandLatexOutput) onExpandLatexOutput();

      const shouldNavigate = await shouldNavigateToMain(effectiveMainFile);
      if (shouldNavigateOnCompile && shouldNavigate) {
        if (linkedFileInfo?.filePath === effectiveMainFile && onNavigateToLinkedFile) {
          onNavigateToLinkedFile();
        } else {
          document.dispatchEvent(new CustomEvent('navigate-to-compiled-file', {
            detail: { filePath: effectiveMainFile }
          }));
        }
      }

      await compileDocument(effectiveMainFile, currentFormat);
    }
  };

  const handleClearCache = async () => {
    try {
      await clearCache();
    } catch (error) {
      console.error('Failed to clear cache:', error);
    }
  };

  const handleClearCacheAndCompile = async () => {
    if (!effectiveMainFile) return;
    if (onExpandLatexOutput) onExpandLatexOutput();

    const shouldNavigate = await shouldNavigateToMain(effectiveMainFile);
    if (shouldNavigateOnCompile && shouldNavigate) {
      if (linkedFileInfo?.filePath === effectiveMainFile && onNavigateToLinkedFile) {
        onNavigateToLinkedFile();
      } else {
        document.dispatchEvent(new CustomEvent('navigate-to-compiled-file', {
          detail: { filePath: effectiveMainFile }
        }));
      }
    }

    try {
      await compileWithClearCache(effectiveMainFile);
    } catch (error) {
      console.error('Failed to compile with cache clear:', error);
    }
  };

  useEffect(() => {
    const buttonElement = document.querySelector('.header-compile-button');
    if (buttonElement) {
      (buttonElement as any).clearAndCompile = handleClearCacheAndCompile;
    }
  }, [handleClearCacheAndCompile]);

  const toggleDropdown = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsDropdownOpen(!isDropdownOpen);
  };

  const handleEngineChange = async (engine: string) => {
    setIsChangingEngine(true);
    try {
      if (useSharedSettings && projectEngine) {
        if (changeDoc) {
          changeDoc((d) => {
            if (!d.projectMetadata) d.projectMetadata = { name: '', description: '' };
            d.projectMetadata.latexEngine = engine as LaTeXEngine;
          });
        }
      } else {
        await setLatexEngine(engine as LaTeXEngine);
        setProperty('latex-engine', engine);
      }
      // setIsDropdownOpen(false);
    } catch (error) {
      console.error('Failed to change engine:', error);
    } finally {
      setIsChangingEngine(false);
    }
  };

  const handleMainFileChange = (filePath: string) => {
    if (useSharedSettings && projectMainFile) {
      if (!changeDoc) return;
      changeDoc((d) => {
        if (!d.projectMetadata) d.projectMetadata = { name: '', description: '' };
        d.projectMetadata.mainFile = filePath === 'auto' ? undefined : filePath;
      });
    } else {
      const newMainFile = filePath === 'auto' ? undefined : filePath;
      setUserSelectedMainFile(newMainFile);
      setProperty('latex-main-file', newMainFile);
    }
  };

  const handleShareMainFile = (checked: boolean) => {
    if (!useSharedSettings || !changeDoc) return;
    changeDoc((d) => {
      if (!d.projectMetadata) d.projectMetadata = { name: '', description: '' };
      if (checked) { d.projectMetadata.mainFile = userSelectedMainFile || autoMainFile; }
      else { delete d.projectMetadata.mainFile; }
    });
  };

  const handleShareEngine = (checked: boolean) => {
    if (!useSharedSettings || !changeDoc) return;
    changeDoc((d) => {
      if (!d.projectMetadata) d.projectMetadata = { name: '', description: '' };
      if (checked) { d.projectMetadata.latexEngine = latexEngine; }
      else { delete d.projectMetadata.latexEngine; }
    });
  };

  const handleAutoCompileOnSaveChange = (checked: boolean) => {
    if (!useSharedSettings || !changeDoc) return;
    changeDoc((d) => {
      if (!d.projectMetadata) d.projectMetadata = { name: '', description: '' };
      d.projectMetadata.latexAutoCompileOnSave = checked;
    });
  };

  const handleBundleChange = (bundleId: string) => {
    setSelectedBundle(bundleId);
    setProperty('latex-busytex-bundle', bundleId);
    latexService.setBusyTeXBundles([bundleId]);
  };

  const handleDeleteBundle = async (bundleId: string) => {
    setIsDeletingBundle(bundleId);
    try {
      await latexService.deleteBusyTeXBundle(bundleId);
      setBundleCacheStatus((prev) => ({ ...prev, [bundleId]: false }));
    } catch (error) {
      console.error('Failed to delete bundle:', error);
    } finally {
      setIsDeletingBundle(null);
    }
  };

  const getFileName = (path?: string) => {
    if (!path) return t('No .tex file');
    return path.split('/').pop() || path;
  };

  const getDisplayName = (path?: string) => {
    if (!path) return t('No .tex file');
    if (selectedDocId && linkedFileInfo?.filePath === path && documents) {
      const found = documents.find((d) => d.id === selectedDocId);
      if (found) return `${found.name} ${t('(linked)')}`;
    }
    return getFileName(path);
  };

  const isDisabled = isInitializing || isExporting || (!isCompiling && (!effectiveMainFile || isChangingEngine));

  return (
    <div className={`latex-compile-buttons ${className}`} ref={dropdownRef}>
      <div className="compile-button-group">
        <button
          className={`latex-button compile-button ${isCompiling ? 'compiling' : ''} ${isInitializing ? 'initializing' : ''} ${isChangingEngine ? 'loading' : ''}`}
          onClick={handleCompileOrStop}
          disabled={isDisabled}
          title={
            isCompiling
              ? t('Stop Compilation') + ' ' + `${useSharedSettings ? t('(F8)') : ''}`
              : isChangingEngine
                ? t('Switching Engine...')
                : t('Compile LaTeX Document') + ' ' + `${useSharedSettings ? t('(F9)') : ''}`
          }>
          {isCompiling ? <StopIcon /> : isInitializing ? <div className="loading-spinner" /> : <PlayIcon />}
        </button>

        <PdfWindowToggleButton
          className="pdf-window-button"
          projectId={fileStorageService.getCurrentProjectId() || 'default'}
          title={t('Open PDF in new window')} />

        <button
          className="latex-button dropdown-toggle"
          onClick={toggleDropdown}
          disabled={isChangingEngine}
          title={t('Compilation Options')}>
          <ChevronDownIcon />
        </button>
      </div>

      <PositionedDropdown
        isOpen={isDropdownOpen}
        triggerElement={dropdownRef.current?.querySelector('.compile-button-group') as HTMLElement}
        className="latex-dropdown">

        <div className="dropdown-section">
          <div className="dropdown-title">{t('Main File:')}</div>
          <div className="dropdown-value" title={effectiveMainFile}>
            {getDisplayName(effectiveMainFile)}
            {projectMainFile && <span className="shared-indicator">{t('(shared)')}</span>}
          </div>
        </div>

        {useSharedSettings && (
          <div className="dropdown-section">
            <div className="dropdown-label">{t('Select main file:')}</div>
            <select
              value={projectMainFile || userSelectedMainFile || 'auto'}
              onChange={(e) => handleMainFileChange(e.target.value)}
              className="dropdown-select"
              disabled={isChangingEngine || isCompiling}>
              <option value="auto">{t('Auto-detect')}</option>
              {availableTexFiles.map((filePath) => (
                <option key={filePath} value={filePath}>{getFileName(filePath)}</option>
              ))}
            </select>
            <label className="dropdown-checkbox">
              <input
                type="checkbox"
                checked={!!projectMainFile}
                onChange={(e) => handleShareMainFile(e.target.checked)}
                disabled={isChangingEngine || isCompiling || !effectiveMainFile} />
              {t('Share with collaborators')}
            </label>
          </div>
        )}

        <div className="dropdown-section">
          <div className="dropdown-title">{t('LaTeX Engine:')}</div>
          <div className="format-selector-group">
            <select
              value={effectiveEngine}
              onChange={(e) => handleEngineChange(e.target.value)}
              className="dropdown-select"
              disabled={isChangingEngine || isCompiling}>
              <optgroup label={t('SwiftLaTeX (TeX Live 2020)')}>
                {SWIFT_ENGINES.map(({ label, value }) => (
                  <option key={value} value={value}>{t(label)}</option>
                ))}
              </optgroup>
              <optgroup label={t('BusyTeX (TeX Live 2026)')}>
                {BUSYTEX_ENGINES.map(({ label, value }) => (
                  <option key={value} value={value}>{t(label)}</option>
                ))}
              </optgroup>
            </select>
            {isBusyTeX && (
              <button
                className={`pdf-options-toggle ${isCacheOptionsOpen ? 'active' : ''}`}
                onClick={() => setIsCacheOptionsOpen(!isCacheOptionsOpen)}
                title={t('Bundle Cache Options')}
                disabled={isChangingEngine || isCompiling}>
                <OptionsIcon />
              </button>
            )}
          </div>
          {/* TODO (fabawi): Need to restore this but it is causing infinite loop on change for now */}
          {/* {useSharedSettings && (
            <label className="dropdown-checkbox">
              <input
                type="checkbox"
                checked={!!projectEngine}
                onChange={(e) => handleShareEngine(e.target.checked)}
                disabled={isChangingEngine || isCompiling} />
              {t('Share with collaborators')}
            </label>
          )} */}
          {isChangingEngine && (
            <div className="engine-status">{t('Switching engine...')}</div>
          )}
          {isBusyTeX && isCacheOptionsOpen && (
            <div className="pdf-options-section">
              <div className="dropdown-label">{t('Bundle for next compile:')}</div>
              <select
                value={selectedBundle}
                onChange={(e) => handleBundleChange(e.target.value)}
                className="dropdown-select"
                disabled={isChangingEngine || isCompiling}>
                {Object.entries(BUSYTEX_BUNDLE_LABELS).map(([id, label]) => (
                  <option key={id} value={id}>{t(label)}</option>
                ))}
              </select>
              <div className="dropdown-label" style={{ marginTop: 'var(--space-sm)' }}>{t('Cached bundles:')}</div>
              {Object.entries(BUSYTEX_BUNDLE_LABELS).map(([bundleId, label]) => (
                <div key={bundleId} className="bundle-cache-row">
                  <span className="bundle-label">{t(label)}</span>
                  <span className={`bundle-status ${bundleCacheStatus[bundleId] ? 'cached' : 'not-cached'}`}>
                    {bundleCacheStatus[bundleId] ? t('cached') : t('not downloaded')}
                  </span>
                  {bundleCacheStatus[bundleId] && (
                    <button
                      className="bundle-delete-btn"
                      onClick={() => handleDeleteBundle(bundleId)}
                      disabled={isDeletingBundle === bundleId || isCompiling}
                      title={t('Delete cached bundle')}>
                      <TrashIcon />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="dropdown-section">
          <div className="format-selector-header">
            <div className="dropdown-title">{t('Output Format:')}</div>
          </div>
          <select
            value={currentFormat}
            onChange={(e) => {
              const format = e.target.value as LaTeXOutputFormat;
              setCurrentFormat(format);
              setProperty('latex-output-format', format);
            }}
            className="dropdown-select"
            disabled={isChangingEngine || isCompiling}>
            <option value="pdf">{t('PDF')}</option>
            <option value="canvas-pdf">{t('Canvas (PDF)')}</option>
          </select>
        </div>

        <div className="dropdown-section">
          {useSharedSettings && (
            <label className="dropdown-checkbox">
              <input
                type="checkbox"
                checked={effectiveAutoCompileOnSave}
                onChange={(e) => handleAutoCompileOnSaveChange(e.target.checked)}
                disabled={isCompiling} />
              {t('Auto-compile on save')}
            </label>
          )}

          <div
            className="cache-item"
            onClick={handleClearCache}
            title={t('Clear compilation cache and source files')}>
            <TrashIcon />{t('Clear Cache')}
          </div>
          <div
            className="cache-item"
            onClick={handleClearCacheAndCompile}
            title={t('Clear cache and compile') + ' ' + `${useSharedSettings ? t('(Shift+F9)') : ''}`}>
            <ClearCompileIcon />{t('Clear & Compile')}
          </div>
        </div>
      </PositionedDropdown>
    </div>
  );
};

export default LaTeXCompileButton;