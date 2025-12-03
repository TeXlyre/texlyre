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
import type { DocumentList } from '../../types/documents';
import type { FileNode } from '../../types/files';
import { isTemporaryFile } from '../../utils/fileUtils';
import { fileStorageService } from '../../services/FileStorageService';
import { ChevronDownIcon, ClearCompileIcon, PlayIcon, StopIcon, TrashIcon } from '../common/Icons';

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
    compileDocument,
    stopCompilation,
    latexEngine,
    setLatexEngine,
    clearCache,
    compileWithClearCache
  } = useLaTeX();
  const { selectedFileId, getFile, fileTree } = useFileTree();
  const { data: doc, changeData: changeDoc } = useCollab<DocumentList>();
  const { getSetting } = useSettings();
  const { getProperty, setProperty, registerProperty } = useProperties();
  const [autoMainFile, setAutoMainFile] = useState<string | undefined>();
  const [userSelectedMainFile, setUserSelectedMainFile] = useState<string | undefined>();
  const [availableTexFiles, setAvailableTexFiles] = useState<string[]>([]);
  const [isChangingEngine, setIsChangingEngine] = useState(false);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const [isDropdownOpen, setIsDropdownOpen] = usePersistentState(dropdownKey, false);
  const propertiesRegistered = useRef(false);
  const [propertiesLoaded, setPropertiesLoaded] = useState(false);

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
  }, [registerProperty]);

  useEffect(() => {
    if (propertiesLoaded) return;

    const storedMainFile = getProperty('latex-main-file');
    const storedEngine = getProperty('latex-engine');

    if (storedMainFile !== undefined) {
      setUserSelectedMainFile(storedMainFile as string | undefined);
    }

    if (storedEngine !== undefined) {
      setLatexEngine(storedEngine as 'pdftex' | 'xetex' | 'luatex');
    }

    setPropertiesLoaded(true);
  }, [getProperty, propertiesLoaded, setLatexEngine]);

  useEffect(() => {
    const findTexFiles = (nodes: FileNode[]): string[] => {
      const texFiles: string[] = [];
      for (const node of nodes) {
        if (node.type === 'file' && node.path.endsWith('.tex') && !isTemporaryFile(node.path)) {
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
        linkedFileInfo.filePath.endsWith('.tex')) {
        setAutoMainFile(linkedFileInfo.filePath);
        return;
      }

      if (selectedFileId) {
        const file = await getFile(selectedFileId);
        if (file?.path.endsWith('.tex')) {
          setAutoMainFile(file.path);
          return;
        }
      }

      const texFile = allTexFiles[0];
      setAutoMainFile(texFile);
    };

    findMainFile();
  }, [selectedFileId, getFile, fileTree, selectedDocId, linkedFileInfo]);

  useEffect(() => {
    if (useSharedSettings && projectEngine && projectEngine !== latexEngine) {
      setLatexEngine(projectEngine);
    }
  }, [projectEngine, latexEngine, setLatexEngine, useSharedSettings]);

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
    if (!useSharedSettings || !effectiveAutoCompileOnSave || !effectiveMainFile) return;

    const handleFileSaved = async (event: Event) => {
      if (isCompiling) return;

      try {
        const customEvent = event as CustomEvent;
        const detail = customEvent.detail;

        if (!detail) return;

        const candidatePath = detail.isFile
          ? detail.fileId
            ? detail.filePath ||
            (await fileStorageService.getFile(detail.fileId))?.path
            : undefined
          : linkedFileInfo?.filePath ?? detail.filePath;

        if (!candidatePath?.endsWith('.tex')) return;

        const mainFileToCompile =
          detail.isFile ? effectiveMainFile : candidatePath;

        setTimeout(async () => {
          if (onExpandLatexOutput) {
            onExpandLatexOutput();
          }
          await compileDocument(mainFileToCompile);
        }, 120);
      } catch (error) {
        console.error('Error in auto-compile on save:', error);
      }
    };

    document.addEventListener('file-saved', handleFileSaved);
    return () => {
      document.removeEventListener('file-saved', handleFileSaved);
    };
  }, [
    useSharedSettings,
    effectiveAutoCompileOnSave,
    effectiveMainFile,
    isCompiling,
    compileDocument,
    onExpandLatexOutput,
    linkedFileInfo,
  ]);

  const shouldNavigateToMain = async (mainFilePath: string): Promise<boolean> => {
    const navigationSetting = getSetting('latex-auto-navigate-to-main')?.value as string ?? 'conditional';

    console.log(`[Navigation] Setting: ${navigationSetting}, selectedFileId: ${selectedFileId}, selectedDocId: ${selectedDocId}`);

    if (navigationSetting === 'never') {
      console.log("[Navigation] Never navigate - setting is 'never'");
      return false;
    }

    if (navigationSetting === 'always') {
      console.log("[Navigation] Always navigate - setting is 'always'");
      return true;
    }

    if (navigationSetting === 'conditional') {
      if (selectedFileId) {
        try {
          const currentFile = await getFile(selectedFileId);
          console.log(`[Navigation] Current file: ${currentFile?.path}, isTeX: ${currentFile?.path.endsWith('.tex')}`);
          if (currentFile?.path.endsWith('.tex')) {
            console.log(`[Navigation] Not navigating - already editing LaTeX file: ${currentFile.path}`);
            return false;
          }
        } catch (error) {
          console.warn('Error getting current file:', error);
        }
      }

      if (selectedDocId && linkedFileInfo?.fileName?.endsWith('.tex')) {
        console.log(`[Navigation] Not navigating - already editing LaTeX-linked document: ${linkedFileInfo.fileName}`);
        return false;
      }

      console.log(`[Navigation] Will navigate to main file: ${mainFilePath}`);
      return true;
    }

    return false;
  };

  const handleCompileOrStop = async () => {
    if (isCompiling) {
      stopCompilation();
    } else if (effectiveMainFile) {
      if (onExpandLatexOutput) {
        onExpandLatexOutput();
      }

      const shouldNavigate = await shouldNavigateToMain(effectiveMainFile);
      console.log(`[Navigation] Should navigate: ${shouldNavigate}, shouldNavigateOnCompile: ${shouldNavigateOnCompile}`);

      if (shouldNavigateOnCompile && shouldNavigate) {
        if (linkedFileInfo?.filePath === effectiveMainFile && onNavigateToLinkedFile) {
          console.log('[Navigation] Navigating to linked file');
          onNavigateToLinkedFile();
        } else {
          console.log(`[Navigation] Dispatching navigate-to-compiled-file event for: ${effectiveMainFile}`);
          document.dispatchEvent(
            new CustomEvent('navigate-to-compiled-file', {
              detail: {
                filePath: effectiveMainFile
              }
            })
          );
        }
      }

      await compileDocument(effectiveMainFile);
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

    const shouldNavigate = await shouldNavigateToMain(effectiveMainFile);

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
        if (changeDoc) {
          changeDoc((d) => {
            if (!d.projectMetadata) {
              d.projectMetadata = { name: '', description: '' };
            }
            d.projectMetadata.latexEngine = engine as 'pdftex' | 'xetex' | 'luatex';
          });
        }
      } else {
        await setLatexEngine(engine as 'pdftex' | 'xetex' | 'luatex');
        setProperty('latex-engine', engine);
      }
      setIsDropdownOpen(false);
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
      setUserSelectedMainFile(newMainFile);
      setProperty('latex-main-file', newMainFile);
    }
  };

  const handleShareMainFile = (checked: boolean) => {
    if (!useSharedSettings || !changeDoc) return;

    changeDoc((d) => {
      if (!d.projectMetadata) {
        d.projectMetadata = { name: '', description: '' };
      }
      if (checked) {
        d.projectMetadata.mainFile = userSelectedMainFile || autoMainFile;
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
        d.projectMetadata.latexEngine = latexEngine;
      } else {
        delete d.projectMetadata.latexEngine;
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

  const isDisabled = !isCompiling && (!effectiveMainFile || isChangingEngine);

  return (
    <div className={`latex-compile-buttons ${className}`} ref={dropdownRef}>
      <div className="compile-button-group">
        <button
          className={`latex-button compile-button ${isCompiling ? 'compiling' : ''} ${isChangingEngine ? 'loading' : ''}`}
          onClick={handleCompileOrStop}
          disabled={isDisabled}
          title={
            isCompiling ?
              t('Stop Compilation') + ' ' + `${useSharedSettings ? t('(F8)') : ''}` :
              isChangingEngine ?
                t('Switching Engine...') :
                t('Compile LaTeX Document') + ' ' + `${useSharedSettings ? t('(F9)') : ''}`
          }>

          {isCompiling ? <StopIcon /> : <PlayIcon />}
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

        {useSharedSettings &&
          <>
            <div className="dropdown-section">
              <div className="dropdown-label">{t('Select main file:')}</div>
              <select
                value={projectMainFile || userSelectedMainFile || 'auto'}
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
          </>
        }

        <div className="dropdown-section">
          <div className="dropdown-title">{t('LaTeX Engine:')}</div>
          <select
            value={effectiveEngine}
            onChange={(e) => handleEngineChange(e.target.value)}
            className="dropdown-select"
            disabled={isChangingEngine || isCompiling}>

            <option value="pdftex">{t('pdfTeX')}</option>
            <option value="xetex">{t('XeTeX')}</option>
          </select>
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
          {useSharedSettings && (
            <label className="dropdown-checkbox">
              <input
                type="checkbox"
                checked={effectiveAutoCompileOnSave}
                onChange={(e) => handleAutoCompileOnSaveChange(e.target.checked)}
                disabled={isCompiling}
              />
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