// src/components/output/TypstCompileButton.tsx
import { t } from '@/i18n';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';

import PdfWindowToggleButton from './PopoutViewerToggleButton';
import PositionedDropdown from '../common/PositionedDropdown';
import { usePersistentState } from '../../hooks/usePersistentState';
import { useCollab } from '../../hooks/useCollab';
import { useFileTree } from '../../hooks/useFileTree';
import { useTypst } from '../../hooks/useTypst';
import { useSettings } from '../../hooks/useSettings';
import { useProperties } from '../../hooks/useProperties';
import type { DocumentList } from '../../types/documents';
import type { TypstPdfOptions } from '../../types/typst';
import type { FileNode } from '../../types/files';
import type { TypstOutputFormat } from '../../types/typst';
import { isTypstFile, isTemporaryFile } from '../../utils/fileUtils';
import { fileStorageService } from '../../services/FileStorageService';
import { OptionsIcon, ChevronDownIcon, ClearCompileIcon, PlayIcon, StopIcon, TrashIcon, InfoIcon } from '../common/Icons';

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
  const { getProperty, setProperty, registerProperty } = useProperties();
  const [autoMainFile, setAutoMainFile] = useState<string | undefined>();
  const [userSelectedMainFile, setUserSelectedMainFile] = useState<string | undefined>();
  const [availableTypstFiles, setAvailableTypstFiles] = useState<string[]>([]);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const [isDropdownOpen, setIsDropdownOpen] = usePersistentState(dropdownKey, false);
  const [isPdfOptionsOpen, setIsPdfOptionsOpen] = usePersistentState(`${dropdownKey}-pdf`, false);
  const propertiesRegistered = useRef(false);
  const [propertiesLoaded, setPropertiesLoaded] = useState(false);

  const projectMainFile = useSharedSettings ? doc?.projectMetadata?.mainFile : undefined;
  const effectiveMainFile = projectMainFile || userSelectedMainFile || autoMainFile;
  const projectFormat = useSharedSettings ? doc?.projectMetadata?.typstOutputFormat : undefined;
  const [localFormat, setLocalFormat] = useState<TypstOutputFormat>('pdf');
  const [localPdfOptions, setLocalPdfOptions] = useState<TypstPdfOptions>({
    pdfStandard: '"1.7"',
    pdfTags: true
  });
  const effectiveFormat = projectFormat || localFormat;
  const effectiveAutoCompileOnSave = useSharedSettings ?
    doc?.projectMetadata?.typstAutoCompileOnSave ?? false :
    false;

  useEffect(() => {
    if (propertiesRegistered.current) return;
    propertiesRegistered.current = true;

    registerProperty({
      id: 'typst-main-file',
      category: 'Compilation',
      subcategory: 'Typst',
      defaultValue: undefined
    });

    registerProperty({
      id: 'typst-output-format',
      category: 'Compilation',
      subcategory: 'Typst',
      defaultValue: 'pdf'
    });

    registerProperty({
      id: 'typst-pdf-standard',
      category: 'Compilation',
      subcategory: 'Typst',
      defaultValue: '"1.7"'
    });

    registerProperty({
      id: 'typst-pdf-tags',
      category: 'Compilation',
      subcategory: 'Typst',
      defaultValue: true
    });
  }, [registerProperty]);

  useEffect(() => {
    if (propertiesLoaded) return;

    const storedMainFile = getProperty('typst-main-file');
    const storedFormat = getProperty('typst-output-format');
    const storedPdfStandard = getProperty('typst-pdf-standard');
    const storedPdfTags = getProperty('typst-pdf-tags');

    if (storedMainFile !== undefined) {
      setUserSelectedMainFile(storedMainFile as string | undefined);
    }

    if (storedFormat !== undefined) {
      setLocalFormat(storedFormat as TypstOutputFormat);
    }

    if (storedPdfStandard !== undefined || storedPdfTags !== undefined) {
      setLocalPdfOptions({
        pdfStandard: storedPdfStandard as string || '"1.7"',
        pdfTags: storedPdfTags !== undefined ? Boolean(storedPdfTags) : true
      });
    }

    setPropertiesLoaded(true);
  }, [getProperty, propertiesLoaded]);

  useEffect(() => {
    const findTypstFiles = (nodes: FileNode[]): string[] => {
      const typstFiles: string[] = [];
      for (const node of nodes) {
        if (node.type === 'file' && isTypstFile(node.path) && !isTemporaryFile(node.path)) {
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
        isTypstFile(linkedFileInfo.filePath)) {
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

      const typstFile = allTypstFiles[0];
      setAutoMainFile(typstFile);
    };

    findMainFile();
  }, [selectedFileId, getFile, fileTree, selectedDocId, linkedFileInfo]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;

      if (dropdownRef.current && !dropdownRef.current.contains(target)) {
        const portaledDropdown = document.querySelector('.typst-dropdown');
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

        const candidatePath = detail.isFile ?
          detail.fileId ?
            detail.filePath ||
            (await fileStorageService.getFile(detail.fileId))?.path :
            undefined :
          linkedFileInfo?.filePath ?? detail.filePath;

        if (!candidatePath || !isTypstFile(candidatePath)) return;

        const mainFileToCompile =
          detail.isFile ? effectiveMainFile : candidatePath;
        const targetFormat = effectiveFormat;
        const shouldShareFormat = !!projectFormat;
        const pdfOptions = targetFormat === 'pdf' ?
          shouldShareFormat ? doc?.projectMetadata?.typstPdfOptions : localPdfOptions :
          undefined;

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
    localPdfOptions]
  );

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
          if (currentFile && isTypstFile(currentFile.path)) {
            return false;
          }
        } catch (error) {
          console.warn('Error getting current file:', error);
        }
      }

      if (selectedDocId && linkedFileInfo?.filePath && isTypstFile(linkedFileInfo.filePath)) {
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
      const pdfOptions = effectiveFormat === 'pdf' ?
        shouldShareFormat ? doc?.projectMetadata?.typstPdfOptions : localPdfOptions :
        undefined;

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
    const pdfOptions = effectiveFormat === 'pdf' ?
      shouldShareFormat ? doc?.projectMetadata?.typstPdfOptions : localPdfOptions :
      undefined;

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
      const newMainFile = filePath === 'auto' ? undefined : filePath;
      setUserSelectedMainFile(newMainFile);
      setProperty('typst-main-file', newMainFile);
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

      <PositionedDropdown
        isOpen={isDropdownOpen}
        triggerElement={dropdownRef.current?.querySelector('.compile-button-group') as HTMLElement}
        className="typst-dropdown">
        <div className="dropdown-section">
          <div className="dropdown-title">{t('Main File:')}</div>
          <div className="dropdown-value" title={effectiveMainFile}>
            {getDisplayName(effectiveMainFile)}
            {projectMainFile && <span className="shared-indicator">{t('(shared)')}</span>}
          </div>
        </div>
        {useSharedSettings &&
          <div className="dropdown-section">
            <div className="dropdown-label">{t('Select main file:')}</div>
            <select
              value={projectMainFile || userSelectedMainFile || 'auto'}
              onChange={(e) => handleMainFileChange(e.target.value)}
              className="dropdown-select"
              disabled={isCompiling}>
              <option value="auto">{t('Auto-detect')}</option>
              {availableTypstFiles.map((filePath) =>
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
                disabled={isCompiling || !effectiveMainFile} />
              {t('Share with collaborators')}
            </label>
          </div>
        }

        <div className="dropdown-section">
          <div className="format-selector-header">
            <div className="dropdown-title">{t('Output Format:')}</div>
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
                  setProperty('typst-output-format', format);
                }
                if (format !== 'pdf') {
                  setIsPdfOptionsOpen(false);
                }
              }}
              className="dropdown-select"
              disabled={isCompiling}>
              <option value="pdf">{t('PDF')}</option>
              <option value="canvas">{t('Canvas (SVG)')}</option>
            </select>
            {effectiveFormat === 'pdf' &&
              <button
                className={`pdf-options-toggle ${isPdfOptionsOpen ? 'active' : ''}`}
                onClick={() => setIsPdfOptionsOpen(!isPdfOptionsOpen)}
                title={t('PDF Options')}
                disabled={isCompiling}>
                <OptionsIcon />
              </button>
            }
          </div>
          {effectiveFormat === 'pdf' && isPdfOptionsOpen &&
            <div className="pdf-options-section">
              <div className="pdf-option">
                <label className="dropdown-title">{t('PDF Standard:')}</label>
                <select
                  value={useSharedSettings && projectFormat ?
                    doc?.projectMetadata?.typstPdfOptions?.pdfStandard || '"1.7"' :
                    localPdfOptions.pdfStandard
                  }
                  onChange={(e) => {
                    if (useSharedSettings && projectFormat) {
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
                      const newOptions = { ...localPdfOptions, pdfStandard: e.target.value };
                      setLocalPdfOptions(newOptions);
                      setProperty('typst-pdf-standard', e.target.value);
                    }
                  }}
                  className="dropdown-select"
                  disabled={isCompiling}>
                  <>
                    <optgroup label={t('PDF Versions')}>
                      <option value='"1.4"'>{t('PDF 1.4')}</option>
                      <option value='"1.5"'>{t('PDF 1.5')}</option>
                      <option value='"1.6"'>{t('PDF 1.6')}</option>
                      <option value='"1.7"'>{t('PDF 1.7')}</option>
                      <option value='"2.0"'>{t('PDF 2.0')}</option>
                    </optgroup>
                    <optgroup label={t('PDF/A Standards')}>
                      <option value='"a-1b"'>{t('PDF/A-1b')}</option>
                      <option value='"a-1a"'>{t('PDF/A-1a')}</option>
                      <option value='"a-2b"'>{t('PDF/A-2b')}</option>
                      <option value='"a-2u"'>{t('PDF/A-2u')}</option>
                      <option value='"a-2a"'>{t('PDF/A-2a')}</option>
                      <option value='"a-3b"'>{t('PDF/A-3b')}</option>
                      <option value='"a-3u"'>{t('PDF/A-3u')}</option>
                      <option value='"a-3a"'>{t('PDF/A-3a')}</option>
                      <option value='"a-4"'>{t('PDF/A-4')}</option>
                      <option value='"a-4f"'>{t('PDF/A-4f')}</option>
                      <option value='"a-4e"'>{t('PDF/A-4e')}</option>
                    </optgroup>
                    <optgroup label={t('Accessibility Standards')}>
                      <option value='"ua-1"'>{t('PDF/UA-1 \u267F')}</option>
                    </optgroup>
                  </>
                </select>
                <a
                  href="https://typst.app/docs/reference/pdf/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="dropdown-link">
                  {t('Learn more about PDF standards')}
                </a>
              </div>

              <label className="dropdown-checkbox">
                <input
                  type="checkbox"
                  checked={useSharedSettings && projectFormat ?
                    doc?.projectMetadata?.typstPdfOptions?.pdfTags !== false :
                    localPdfOptions.pdfTags
                  }
                  onChange={(e) => {
                    if (useSharedSettings && projectFormat) {
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
                      const newOptions = { ...localPdfOptions, pdfTags: e.target.checked };
                      setLocalPdfOptions(newOptions);
                      setProperty('typst-pdf-tags', e.target.checked);
                    }
                  }}
                  disabled={isCompiling} />

                {t('Enable PDF tags (accessibility)')}
              </label>
            </div>
          }

          {useSharedSettings &&
            <label className="dropdown-checkbox">
              <input
                type="checkbox"
                checked={!!projectFormat}
                onChange={(e) => handleShareFormat(e.target.checked)}
                disabled={isCompiling} />
              {t('Share with collaborators')}
            </label>
          }
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
            title={t('Clear compilation cache')}>
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

export default TypstCompileButton;