// src/components/output/LaTeXCompileButton.tsx
import { t } from '@/i18n';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';

import PopoutViewerToggleButton from './PopoutViewerToggleButton';
import PositionedDropdown from '../common/PositionedDropdown';
import { usePersistentState } from '../../hooks/usePersistentState';
import { useCollab } from '../../hooks/useCollab';
import { useFileTree } from '../../hooks/useFileTree';
import { useLaTeX } from '../../hooks/useLaTeX';
import { useSettings } from '../../hooks/useSettings';
import { useProperties } from '../../hooks/useProperties';
import type { DocumentList } from '../../types/documents';
import type { FileNode } from '../../types/files';
import type { LaTeXOutputFormat, LaTeXEngine } from '../../types/latex';
import { isLatexFile, isLatexMainFile, isTemporaryFile } from '../../utils/fileUtils';
import { fileStorageService } from '../../services/FileStorageService';
import { latexService } from '../../services/LaTeXService';
import { BUSYTEX_BUNDLE_LABELS } from '../../extensions/texlyre-busytex/BusyTeXService';
import { ChevronDownIcon, ClearCompileIcon, OptionsIcon, PlayIcon, ResetIcon, StopIcon, TrashIcon } from '../common/Icons';

interface LaTeXCompileButtonProps {
  dropdownKey: string;
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
    clearCache,
    compileWithClearCache,
  } = useLaTeX();
  const { selectedFileId, getFile, fileTree } = useFileTree();
  const { data: doc, changeData: changeDoc } = useCollab<DocumentList>();
  const { getSetting } = useSettings();
  const { getProperty, setProperty, registerProperty, unregisterProperty } = useProperties();
  const [autoMainFile, setAutoMainFile] = useState<string | undefined>();
  const [availableTexFiles, setAvailableTexFiles] = useState<string[]>([]);
  const [isChangingEngine, setIsChangingEngine] = useState(false);
  const [bundleCacheStatus, setBundleCacheStatus] = useState<Record<string, boolean>>({});
  const [isDeletingBundle, setIsDeletingBundle] = useState<string | null>(null);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const [isDropdownOpen, setIsDropdownOpen] = usePersistentState(dropdownKey, false);
  const [isCacheOptionsOpen, setIsCacheOptionsOpen] = usePersistentState(`${dropdownKey}-cache`, false);
  const propertiesRegistered = useRef(false);

  const projectId = fileStorageService.getCurrentProjectId() || undefined;

  const settingEngine = getSetting('latex-engine')?.value as LaTeXEngine ?? 'pdftex';
  const settingFormat = getSetting('latex-default-format')?.value as LaTeXOutputFormat ?? 'pdf';
  const settingBundle = getSetting('latex-busytex-bundles')?.value as string ?? 'recommended';

  const propMainFile = getProperty('latex-main-file', { scope: 'project', projectId }) as string | undefined;
  const propEngine = getProperty('latex-engine', { scope: 'project', projectId }) as LaTeXEngine | undefined;
  const propFormat = getProperty('latex-output-format', { scope: 'project', projectId }) as LaTeXOutputFormat | undefined;
  const propBundle = getProperty('latex-busytex-bundle', { scope: 'project', projectId }) as string | undefined;

  const projectMainFile = useSharedSettings ? doc?.projectMetadata?.mainFile : undefined;
  const projectEngine = useSharedSettings ? doc?.projectMetadata?.latexEngine : undefined;
  const projectFormat = useSharedSettings ? doc?.projectMetadata?.latexOutputFormat : undefined;

  const effectiveMainFile = projectMainFile || propMainFile || autoMainFile;
  const effectiveEngine = projectEngine || propEngine || settingEngine;
  const effectiveFormat = projectFormat || propFormat || settingFormat;
  const effectiveBundle = propBundle || settingBundle;
  const effectiveAutoCompileOnSave = useSharedSettings ?
    doc?.projectMetadata?.latexAutoCompileOnSave ?? false :
    false;

  const isBusyTeX = effectiveEngine.startsWith('busytex-');

  const compileStateRef = useRef({
    mainFile: effectiveMainFile,
    format: effectiveFormat,
    engine: effectiveEngine,
    isCompiling,
  });
  compileStateRef.current = {
    mainFile: effectiveMainFile,
    format: effectiveFormat,
    engine: effectiveEngine,
    isCompiling,
  };

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
    if (!propBundle) return;
    latexService.setBusyTeXBundles([propBundle]);
  }, [propBundle]);

  useEffect(() => {
    const findTexFiles = (nodes: FileNode[]): string[] => {
      const texFiles: string[] = [];
      for (const node of nodes) {
        if (node.type === 'file' && isLatexMainFile(node.path) && !isTemporaryFile(node.path)) {
          texFiles.push(node.path);
        }
        if (node.children) {
          texFiles.push(...findTexFiles(node.children));
        }
      }
      return texFiles;
    };

    const allTexFiles = findTexFiles(fileTree);
    setAvailableTexFiles(allTexFiles);

    const findMainFile = async () => {
      if (
        selectedDocId &&
        linkedFileInfo?.filePath &&
        isLatexMainFile(linkedFileInfo.filePath)) {
        setAutoMainFile(linkedFileInfo.filePath);
        return;
      }

      if (selectedFileId) {
        const file = await getFile(selectedFileId);
        if (file && isLatexMainFile(file.path)) {
          setAutoMainFile(file.path);
          return;
        }
      }

      if (autoMainFile && allTexFiles.includes(autoMainFile)) {
        return;
      }

      setAutoMainFile(allTexFiles[0]);
    };

    findMainFile();
  }, [selectedFileId, getFile, fileTree, selectedDocId, linkedFileInfo, autoMainFile]);

  useEffect(() => {
    if (!useSharedSettings || !projectEngine) return;
    if (projectEngine === latexService.getCurrentEngineType()) return;
    latexService.setEngine(projectEngine as LaTeXEngine).catch((err) => {
      console.error('Failed to sync shared engine:', err);
    });
  }, [projectEngine, useSharedSettings]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;

      if (dropdownRef.current && !dropdownRef.current.contains(target)) {
        const portaledDropdown = document.querySelector('.latex-dropdown');
        if (portaledDropdown && portaledDropdown.contains(target)) {
          return;
        }
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isDropdownOpen]);

  useEffect(() => {
    if (!useSharedSettings || !effectiveAutoCompileOnSave) return;

    const handleFileSaved = async () => {
      const state = compileStateRef.current;
      if (state.isCompiling) return;
      if (!state.mainFile) return;

      if (onExpandLatexOutput) {
        onExpandLatexOutput();
      }

      if (state.engine !== latexService.getCurrentEngineType()) {
        await latexService.setEngine(state.engine);
      }

      await compileDocument(state.mainFile, state.format);
    };

    document.addEventListener('file-saved', handleFileSaved);
    return () => {
      document.removeEventListener('file-saved', handleFileSaved);
    };
  }, [useSharedSettings, effectiveAutoCompileOnSave, compileDocument, onExpandLatexOutput]);

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

  const handleResetProperties = () => {
    unregisterProperty('latex-main-file', { scope: 'project', projectId });
    unregisterProperty('latex-engine', { scope: 'project', projectId });
    unregisterProperty('latex-output-format', { scope: 'project', projectId });
    unregisterProperty('latex-busytex-bundle', { scope: 'project', projectId });
    latexService.setBusyTeXBundles([settingBundle]);
  };

  const shouldNavigateToMain = async (): Promise<boolean> => {
    const navigationSetting = getSetting('latex-auto-navigate-to-main')?.value as string ?? 'conditional';

    if (navigationSetting === 'never') {
      return false;
    }

    if (navigationSetting === 'always') {
      return true;
    }

    if (navigationSetting === 'conditional') {
      if (selectedFileId) {
        try {
          const currentFile = await getFile(selectedFileId);
          if (currentFile && isLatexFile(currentFile.path)) {
            return false;
          }
        } catch (error) {
          console.warn('Error getting current file:', error);
        }
      }

      if (selectedDocId && linkedFileInfo?.filePath && isLatexFile(linkedFileInfo.filePath)) {
        return false;
      }

      return true;
    }

    return false;
  };

  const handleCompileOrStop = async () => {
    if (isCompiling) {
      stopCompilation();
    } else if (effectiveMainFile) {
      setIsInitializing(true);
      if (onExpandLatexOutput) {
        onExpandLatexOutput();
      }

      const shouldNavigate = await shouldNavigateToMain();

      if (shouldNavigateOnCompile && shouldNavigate) {
        if (linkedFileInfo?.filePath === effectiveMainFile && onNavigateToLinkedFile) {
          onNavigateToLinkedFile();
        } else {
          document.dispatchEvent(
            new CustomEvent('navigate-to-compiled-file', {
              detail: {
                filePath: effectiveMainFile
              }
            })
          );
        }
      }

      if (effectiveEngine !== latexService.getCurrentEngineType()) {
        await latexService.setEngine(effectiveEngine);
      }

      await compileDocument(effectiveMainFile, effectiveFormat);
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

    if (onExpandLatexOutput) {
      onExpandLatexOutput();
    }

    const shouldNavigate = await shouldNavigateToMain();

    if (shouldNavigateOnCompile && shouldNavigate) {
      if (linkedFileInfo?.filePath === effectiveMainFile && onNavigateToLinkedFile) {
        onNavigateToLinkedFile();
      } else {
        document.dispatchEvent(
          new CustomEvent('navigate-to-compiled-file', {
            detail: {
              filePath: effectiveMainFile
            }
          })
        );
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
        if (!changeDoc) return;
        changeDoc((d) => {
          if (!d.projectMetadata) {
            d.projectMetadata = { name: '', description: '' };
          }
          d.projectMetadata.latexEngine = engine as LaTeXEngine;
        });
      } else {
        setProperty('latex-engine', engine, { scope: 'project', projectId });
      }
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
        if (!d.projectMetadata) {
          d.projectMetadata = { name: '', description: '' };
        }
        d.projectMetadata.mainFile = filePath === 'auto' ? undefined : filePath;
      });
    } else {
      const newMainFile = filePath === 'auto' ? undefined : filePath;
      setProperty('latex-main-file', newMainFile, { scope: 'project', projectId });
    }
  };

  const handleShareMainFile = (checked: boolean) => {
    if (!useSharedSettings || !changeDoc) return;

    changeDoc((d) => {
      if (!d.projectMetadata) {
        d.projectMetadata = { name: '', description: '' };
      }
      if (checked) {
        d.projectMetadata.mainFile = propMainFile || autoMainFile;
      } else {
        delete d.projectMetadata.mainFile;
      }
    });
  };

  const handleShareEngine = (checked: boolean) => {
    if (!useSharedSettings || !changeDoc) return;

    changeDoc((d) => {
      if (!d.projectMetadata) {
        d.projectMetadata = { name: '', description: '' };
      }
      if (checked) {
        d.projectMetadata.latexEngine = effectiveEngine;
      } else {
        delete d.projectMetadata.latexEngine;
      }
    });
  };

  const handleShareFormat = (checked: boolean) => {
    if (!useSharedSettings || !changeDoc) return;

    changeDoc((d) => {
      if (!d.projectMetadata) {
        d.projectMetadata = { name: '', description: '' };
      }
      if (checked) {
        d.projectMetadata.latexOutputFormat = effectiveFormat;
      } else {
        delete d.projectMetadata.latexOutputFormat;
      }
    });
  };

  const handleAutoCompileOnSaveChange = (checked: boolean) => {
    if (!useSharedSettings || !changeDoc) return;

    changeDoc((d) => {
      if (!d.projectMetadata) {
        d.projectMetadata = { name: '', description: '' };
      }
      d.projectMetadata.latexAutoCompileOnSave = checked;
    });
  };

  const handleBundleChange = (bundleId: string) => {
    setProperty('latex-busytex-bundle', bundleId, { scope: 'project', projectId });
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
      const doc = documents.find((d) => d.id === selectedDocId);
      if (doc) {
        return `${doc.name}` + ' ' + t('(linked)');
      }
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
            isCompiling ?
              t('Stop Compilation') + ' ' + `${useSharedSettings ? t('(F8)') : ''}` :
              isChangingEngine ?
                t('Switching Engine...') :
                t('Compile LaTeX Document') + ' ' + `${useSharedSettings ? t('(F9)') : ''}`
          }>
          {isCompiling ? <StopIcon /> : isInitializing ? <div className="loading-spinner" /> : <PlayIcon />}
        </button>

        <PopoutViewerToggleButton
          className="popout-viewer-button"
          projectId={projectId || 'default'}
          title={t('Open output in new window')}
        />

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
          <div className="format-selector-header">
            <div className="dropdown-title">{t('Main File:')}</div>
            <button
              className="pdf-options-toggle"
              onClick={handleResetProperties}
              title={t('Reset to global settings')}
              disabled={isChangingEngine || isCompiling}>
              <ResetIcon />
            </button>
          </div>
          <div className="dropdown-value" title={effectiveMainFile}>
            {getDisplayName(effectiveMainFile)}
            {projectMainFile && <span className="shared-indicator">{t('(shared)')}</span>}
          </div>
        </div>
        {useSharedSettings &&
          <div className="dropdown-section">
            <div className="dropdown-label">{t('Select main file:')}</div>
            <select
              value={projectMainFile || propMainFile || 'auto'}
              onChange={(e) => handleMainFileChange(e.target.value)}
              className="dropdown-select"
              disabled={isChangingEngine || isCompiling}>
              <option value="auto">{t('Auto-detect')}</option>
              {availableTexFiles.map((filePath) =>
                <option key={filePath} value={filePath}>
                  {getFileName(filePath)}
                </option>
              )}
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
        }

        <div className="dropdown-section">
          <div className="format-selector-header">
            <div className="dropdown-title">{t('LaTeX Engine:')}</div>
          </div>
          <div className="format-selector-group">
            <select
              value={effectiveEngine}
              onChange={(e) => handleEngineChange(e.target.value)}
              className="dropdown-select"
              disabled={isChangingEngine || isCompiling}>
              <optgroup label={t('SwiftLaTeX (TeX Live 2020)')}>
                {SWIFT_ENGINES.map(({ label, value }) =>
                  <option key={value} value={value}>{t(label)}</option>
                )}
              </optgroup>
              <optgroup label={t('BusyTeX (TeX Live 2026)')}>
                {BUSYTEX_ENGINES.map(({ label, value }) =>
                  <option key={value} value={value}>{t(label)}</option>
                )}
              </optgroup>
            </select>
            {isBusyTeX &&
              <button
                className={`pdf-options-toggle ${isCacheOptionsOpen ? 'active' : ''}`}
                onClick={() => setIsCacheOptionsOpen(!isCacheOptionsOpen)}
                title={t('Bundle Cache Options')}
                disabled={isChangingEngine || isCompiling}>
                <OptionsIcon />
              </button>
            }
          </div>
          {isBusyTeX && isCacheOptionsOpen &&
            <div className="pdf-options-section">
              <div className="dropdown-label">{t('Bundle for next compile:')}</div>
              <select
                value={effectiveBundle}
                onChange={(e) => handleBundleChange(e.target.value)}
                className="dropdown-select"
                disabled={isChangingEngine || isCompiling}>
                {Object.entries(BUSYTEX_BUNDLE_LABELS).map(([id, label]) =>
                  <option key={id} value={id}>{t(label)}</option>
                )}
              </select>
              <div className="dropdown-label" style={{ marginTop: 'var(--space-sm)' }}>{t('Cached bundles:')}</div>
              {Object.entries(BUSYTEX_BUNDLE_LABELS).map(([bundleId, label]) =>
                <div key={bundleId} className="bundle-cache-row">
                  <span className="bundle-label">{t(label)}</span>
                  <span className={`bundle-status ${bundleCacheStatus[bundleId] ? 'cached' : 'not-cached'}`}>
                    {bundleCacheStatus[bundleId] ? t('cached') : t('not downloaded')}
                  </span>
                  {bundleCacheStatus[bundleId] &&
                    <button
                      className="bundle-delete-btn"
                      onClick={() => handleDeleteBundle(bundleId)}
                      disabled={isDeletingBundle === bundleId || isCompiling}
                      title={t('Delete cached bundle')}>
                      <TrashIcon />
                    </button>
                  }
                </div>
              )}
            </div>
          }
          {useSharedSettings &&
            <label className="dropdown-checkbox">
              <input
                type="checkbox"
                checked={!!projectEngine}
                onChange={(e) => handleShareEngine(e.target.checked)}
                disabled={isChangingEngine || isCompiling} />
              {t('Share with collaborators')}
            </label>
          }
          {isChangingEngine &&
            <div className="engine-status">{t('Switching engine...')}</div>
          }
        </div>

        <div className="dropdown-section">
          <div className="format-selector-header">
            <div className="dropdown-title">{t('Output Format:')}</div>
          </div>
          <div className="format-selector-group">
            <select
              value={effectiveFormat}
              onChange={(e) => {
                const format = e.target.value as LaTeXOutputFormat;
                if (useSharedSettings && projectFormat) {
                  if (!changeDoc) return;
                  changeDoc((d) => {
                    if (!d.projectMetadata) {
                      d.projectMetadata = { name: '', description: '' };
                    }
                    d.projectMetadata.latexOutputFormat = format;
                  });
                } else {
                  setProperty('latex-output-format', format, { scope: 'project', projectId });
                }
              }}
              className="dropdown-select"
              disabled={isChangingEngine || isCompiling}>
              <option value="pdf">{t('PDF')}</option>
              <option value="canvas-pdf">{t('Canvas (PDF)')}</option>
            </select>
          </div>
          {/* TODO (fabawi): disabled for now as it conflicts with the output setting from tabs*/}
          {/* {useSharedSettings &&
            <label className="dropdown-checkbox">
              <input
                type="checkbox"
                checked={!!projectFormat}
                onChange={(e) => handleShareFormat(e.target.checked)}
                disabled={isChangingEngine || isCompiling} />
              {t('Share with collaborators')}
            </label>
          } */}
        </div>

        <div className="dropdown-section">
          {useSharedSettings &&
            <label className="dropdown-checkbox">
              <input
                type="checkbox"
                checked={effectiveAutoCompileOnSave}
                onChange={(e) => handleAutoCompileOnSaveChange(e.target.checked)}
                disabled={isCompiling} />

              {t('Auto-compile on save')}
            </label>
          }

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