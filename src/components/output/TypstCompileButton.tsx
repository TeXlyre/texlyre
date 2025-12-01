// src/components/output/TypstCompileButton.tsx
import { t } from '@/i18n';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';

import { usePersistentState } from '../../hooks/usePersistentState';
import PdfWindowToggleButton from './PopoutViewerToggleButton';
import { useCollab } from '../../hooks/useCollab';
import { useFileTree } from '../../hooks/useFileTree';
import { useTypst } from '../../hooks/useTypst';
import { useSettings } from '../../hooks/useSettings';
import type { DocumentList } from '../../types/documents';
import type { TypstPdfOptions } from '../../types/typst';
import type { FileNode } from '../../types/files';
import type { TypstOutputFormat } from '../../types/typst';
import { isTemporaryFile } from '../../utils/fileUtils';
import { fileStorageService } from '../../services/FileStorageService';
import { OptionsIcon, ChevronDownIcon, ClearCompileIcon, PlayIcon, StopIcon, TrashIcon } from '../common/Icons';

interface TypstCompileButtonProps {
  dropdownKey: string;
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
  shouldNavigateOnCompile?: boolean;
  useSharedSettings?: boolean;
}

const TypstCompileButton: React.FC<TypstCompileButtonProps> = ({
  dropdownKey,
  className = '',
  selectedDocId,
  documents,
  onNavigateToLinkedFile,
  onExpandTypstOutput,
  linkedFileInfo,
  shouldNavigateOnCompile = false,
  useSharedSettings = false
}) => {
  const { isCompiling, compileDocument, stopCompilation, clearCache } = useTypst();
  const { selectedFileId, getFile, fileTree } = useFileTree();
  const { data: doc, changeData: changeDoc } = useCollab<DocumentList>();
  const { getSetting } = useSettings();
  const [autoMainFile, setAutoMainFile] = useState<string | undefined>();
  const [userSelectedMainFile, setUserSelectedMainFile] = useState<string | undefined>();
  const [availableTypstFiles, setAvailableTypstFiles] = useState<string[]>([]);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const [isDropdownOpen, setIsDropdownOpen] = usePersistentState(dropdownKey, false);
  const [isPdfOptionsOpen, setIsPdfOptionsOpen] = usePersistentState(`${dropdownKey}-pdf`, false);

  const projectMainFile = useSharedSettings ? doc?.projectMetadata?.mainFile : undefined;
  const effectiveMainFile = projectMainFile || userSelectedMainFile || autoMainFile;
  const projectFormat = useSharedSettings ? doc?.projectMetadata?.typstOutputFormat : undefined;
  const [localFormat, setLocalFormat] = useState<TypstOutputFormat>('pdf');
  const [localPdfOptions, setLocalPdfOptions] = useState<TypstPdfOptions>({
    pdfStandard: '"ua-1"',
    pdfTags: true
  });
  const effectiveFormat = projectFormat || localFormat;
  const effectiveAutoCompileOnSave = useSharedSettings
    ? doc?.projectMetadata?.typstAutoCompileOnSave ?? false
    : false;

  useEffect(() => {
    const findTypstFiles = (nodes: FileNode[]): string[] => {
      const typstFiles: string[] = [];
      for (const node of nodes) {
        if (node.type === 'file' && node.path.endsWith('.typ') && !isTemporaryFile(node.path)) {
          typstFiles.push(node.path);
        }
        if (node.children) {
          typstFiles.push(...findTypstFiles(node.children));
        }
      }
      return typstFiles;
    };

    const allTypstFiles = findTypstFiles(fileTree);
    setAvailableTypstFiles(allTypstFiles);

    const findMainFile = async () => {
      if (
        selectedDocId &&
        linkedFileInfo?.filePath &&
        linkedFileInfo.filePath.endsWith('.typ')) {
        setAutoMainFile(linkedFileInfo.filePath);
        return;
      }

      if (selectedFileId) {
        const file = await getFile(selectedFileId);
        if (file?.path.endsWith('.typ')) {
          setAutoMainFile(file.path);
          return;
        }
      }

      const typstFile = allTypstFiles[0];
      setAutoMainFile(typstFile);
    };

    findMainFile();
  }, [selectedFileId, getFile, fileTree, selectedDocId, linkedFileInfo]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)) {
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

        if (!candidatePath?.endsWith('.typ')) return;

        const mainFileToCompile =
          detail.isFile ? effectiveMainFile : candidatePath;
        const targetFormat = effectiveFormat;
        const shouldShareFormat = !!projectFormat;
        const pdfOptions = targetFormat === 'pdf' && shouldShareFormat && doc?.projectMetadata?.typstPdfOptions
          ? doc.projectMetadata.typstPdfOptions
          : undefined;

        setTimeout(async () => {
          if (onExpandTypstOutput) {
            onExpandTypstOutput();
          }
          await compileDocument(mainFileToCompile, targetFormat, pdfOptions);
        }, 120);
      } catch (error) {
        console.error('Error in Typst auto-compile on save:', error);
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
    effectiveFormat,
    projectFormat,
    isCompiling,
    compileDocument,
    onExpandTypstOutput,
    linkedFileInfo,
    doc?.projectMetadata?.typstPdfOptions,
  ]);

  const shouldNavigateToMain = async (mainFilePath: string): Promise<boolean> => {
    const navigationSetting = getSetting('typst-auto-navigate-to-main')?.value as string ?? 'conditional';

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
          if (currentFile?.path.endsWith('.typ')) {
            return false;
          }
        } catch (error) {
          console.warn('Error getting current file:', error);
        }
      }

      if (selectedDocId && linkedFileInfo?.fileName?.endsWith('.typ')) {
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
      if (onExpandTypstOutput) {
        onExpandTypstOutput();
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

      const shouldShareFormat = !!projectFormat;
      const pdfOptions = effectiveFormat === 'pdf'
        ? (shouldShareFormat && doc?.projectMetadata?.typstPdfOptions
          ? doc.projectMetadata.typstPdfOptions
          : (!shouldShareFormat ? localPdfOptions : undefined))
        : undefined;

      await compileDocument(effectiveMainFile, effectiveFormat, pdfOptions);
    }
  };

  const handleClearCache = async () => {
    try {
      clearCache();
    } catch (error) {
      console.error('Failed to clear cache:', error);
    }
  };

  const handleClearCacheAndCompile = async () => {
    if (!effectiveMainFile) return;

    if (onExpandTypstOutput) {
      onExpandTypstOutput();
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

    const shouldShareFormat = !!projectFormat;
    const pdfOptions = effectiveFormat === 'pdf'
      ? (shouldShareFormat && doc?.projectMetadata?.typstPdfOptions
        ? doc.projectMetadata.typstPdfOptions
        : (!shouldShareFormat ? localPdfOptions : undefined))
      : undefined;

    try {
      clearCache();
      await compileDocument(effectiveMainFile, effectiveFormat, pdfOptions);
    } catch (error) {
      console.error('Failed to compile with cache clear:', error);
    }
  };

  const toggleDropdown = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsDropdownOpen(!isDropdownOpen);
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
      setUserSelectedMainFile(filePath === 'auto' ? undefined : filePath);
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

  const handleShareFormat = (checked: boolean) => {
    if (!useSharedSettings || !changeDoc) return;

    changeDoc((d) => {
      if (!d.projectMetadata) {
        d.projectMetadata = { name: '', description: '' };
      }
      if (checked) {
        d.projectMetadata.typstOutputFormat = effectiveFormat;
      } else {
        delete d.projectMetadata.typstOutputFormat;
      }
    });
  };

  const handleAutoCompileOnSaveChange = (checked: boolean) => {
    if (!useSharedSettings || !changeDoc) return;

    changeDoc((d) => {
      if (!d.projectMetadata) {
        d.projectMetadata = { name: '', description: '' };
      }
      d.projectMetadata.typstAutoCompileOnSave = checked;
    });
  };

  const getFileName = (path?: string) => {
    if (!path) return t('No .typ file');
    return path.split('/').pop() || path;
  };

  const getDisplayName = (path?: string) => {
    if (!path) return t('No .typ file');

    if (selectedDocId && linkedFileInfo?.filePath === path && documents) {
      const doc = documents.find((d) => d.id === selectedDocId);
      if (doc) {
        return `${doc.name}` + ' ' + t('(linked)');
      }
    }

    return getFileName(path);
  };

  const isDisabled = !isCompiling && !effectiveMainFile;

  return (
    <div className={`typst-compile-buttons ${className}`} ref={dropdownRef}>
      <div className="compile-button-group">
        <button
          className={`typst-button compile-button ${isCompiling ? 'compiling' : ''}`}
          onClick={handleCompileOrStop}
          disabled={isDisabled}
          title={
            isCompiling ?
              t('Stop Compilation') + ' ' + `${useSharedSettings ? t('(F8)') : ''}` :
              t('Compile Typst Document') + ' ' + `${useSharedSettings ? t('(F9)') : ''}`
          }>
          {isCompiling ? <StopIcon /> : <PlayIcon />}
        </button>

        <PdfWindowToggleButton
          className="pdf-window-button"
          projectId={fileStorageService.getCurrentProjectId() || 'default'}
          title={t('Open PDF in new window')} />

        <button
          className="typst-button dropdown-toggle"
          onClick={toggleDropdown}
          title={t('Compilation Options')}>
          <ChevronDownIcon />
        </button>
      </div>

      {isDropdownOpen &&
        <div className="typst-dropdown">
          <div className="main-file-display">
            <div className="main-file-label">{t('Main file:')}</div>
            <div className="main-file-path" title={effectiveMainFile}>
              {getDisplayName(effectiveMainFile)}
              {projectMainFile && <span className="shared-indicator">{t('(shared)')}</span>}
            </div>
          </div>
          {useSharedSettings &&
            <div className="main-file-selector">
              <div className="main-file-selector-label">{t('Select main file:')}</div>
              <select
                value={projectMainFile || userSelectedMainFile || 'auto'}
                onChange={(e) => handleMainFileChange(e.target.value)}
                className="main-file-select"
                disabled={isCompiling}>
                <option value="auto">{t('Auto-detect')}</option>
                {availableTypstFiles.map((filePath) =>
                  <option key={filePath} value={filePath}>
                    {getFileName(filePath)}
                  </option>
                )}
              </select>
              <label className="share-checkbox">
                <input
                  type="checkbox"
                  checked={!!projectMainFile}
                  onChange={(e) => handleShareMainFile(e.target.checked)}
                  disabled={isCompiling || !effectiveMainFile} />
                {t('Save and share with collaborators')}
              </label>
            </div>
          }

          <div className="format-selector">
            <div className="format-selector-header">
              <div className="format-label">{t('Output Format:')}</div>
            </div>
            <div className="format-selector-group">
              <select
                value={effectiveFormat}
                onChange={(e) => {
                  const format = e.target.value as TypstOutputFormat;
                  if (useSharedSettings && projectFormat) {
                    if (!changeDoc) return;
                    changeDoc((d) => {
                      if (!d.projectMetadata) {
                        d.projectMetadata = { name: '', description: '' };
                      }
                      d.projectMetadata.typstOutputFormat = format;
                    });
                  } else {
                    setLocalFormat(format);
                  }
                  if (format !== 'pdf') {
                    setIsPdfOptionsOpen(false);
                  }
                }}
                className="format-select"
                disabled={isCompiling}>
                <option value="pdf">PDF</option>
                <option value="svg">SVG</option>
                <option value="canvas">{t('Canvas')}</option>
              </select>
              {effectiveFormat === 'pdf' && (
                <button
                  className={`pdf-options-toggle ${isPdfOptionsOpen ? 'active' : ''}`}
                  onClick={() => setIsPdfOptionsOpen(!isPdfOptionsOpen)}
                  title={t('PDF Options')}
                  disabled={isCompiling}>
                  <OptionsIcon />
                </button>
              )}
            </div>
            {effectiveFormat === 'pdf' && isPdfOptionsOpen && (
              <div className="pdf-options-section">
                <div className="pdf-option">
                  <label className="pdf-option-label">{t('PDF Standard:')}</label>
                  <select
                    value={useSharedSettings
                      ? (doc?.projectMetadata?.typstPdfOptions?.pdfStandard || '"ua-1"')
                      : localPdfOptions.pdfStandard
                    }
                    onChange={(e) => {
                      if (useSharedSettings) {
                        if (!changeDoc) return;
                        changeDoc((d) => {
                          if (!d.projectMetadata) {
                            d.projectMetadata = { name: '', description: '' };
                          }
                          if (!d.projectMetadata.typstPdfOptions) {
                            d.projectMetadata.typstPdfOptions = {};
                          }
                          d.projectMetadata.typstPdfOptions.pdfStandard = e.target.value;
                        });
                      } else {
                        setLocalPdfOptions({ ...localPdfOptions, pdfStandard: e.target.value });
                      }
                    }}
                    className="pdf-option-select"
                    disabled={isCompiling}>
                    <option value='"1.7"'>{t('PDF/A-1')}</option>
                    <option value='"ua-1"'>{t('PDF/UA-1')}</option>
                    <option value='"2.0"'>{t('PDF 2.0')}</option>
                  </select>
                </div>

                <label className="pdf-option-checkbox">
                  <input
                    type="checkbox"
                    checked={useSharedSettings
                      ? (doc?.projectMetadata?.typstPdfOptions?.pdfTags !== false)
                      : localPdfOptions.pdfTags
                    }
                    onChange={(e) => {
                      if (useSharedSettings) {
                        if (!changeDoc) return;
                        changeDoc((d) => {
                          if (!d.projectMetadata) {
                            d.projectMetadata = { name: '', description: '' };
                          }
                          if (!d.projectMetadata.typstPdfOptions) {
                            d.projectMetadata.typstPdfOptions = {};
                          }
                          d.projectMetadata.typstPdfOptions.pdfTags = e.target.checked;
                        });
                      } else {
                        setLocalPdfOptions({ ...localPdfOptions, pdfTags: e.target.checked });
                      }
                    }}
                    disabled={isCompiling}
                  />
                  {t('Enable PDF tags (accessibility)')}
                </label>
              </div>
            )}

            {useSharedSettings &&
              <label className="share-checkbox">
                <input
                  type="checkbox"
                  checked={!!projectFormat}
                  onChange={(e) => handleShareFormat(e.target.checked)}
                  disabled={isCompiling} />
                {t('Save and share with collaborators')}
              </label>
            }

            {useSharedSettings && (
              <label className="auto-compile-checkbox">
                <input
                  type="checkbox"
                  checked={effectiveAutoCompileOnSave}
                  onChange={(e) => handleAutoCompileOnSaveChange(e.target.checked)}
                  disabled={isCompiling}
                />
                {t('Auto-compile on save')}
              </label>
            )}
          </div>

          <div className="cache-controls">
            <div
              className="cache-item clear-cache"
              onClick={handleClearCache}
              title={t('Clear compilation cache')}>
              <TrashIcon />{t('Clear Cache')}
            </div>
            <div
              className="cache-item clear-and-compile"
              onClick={handleClearCacheAndCompile}
              title={t('Clear cache and compile') + ' ' + `${useSharedSettings ? t('(Shift+F9)') : ''}`}>
              <ClearCompileIcon />{t('Clear & Compile')}
            </div>
          </div>
        </div>
      }
    </div>
  );
};

export default TypstCompileButton;