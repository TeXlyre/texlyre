// src/components/output/TypstExportButton.tsx
import { t } from '@/i18n';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';

import PositionedDropdown from '../common/PositionedDropdown';
import { useCollab } from '../../hooks/useCollab';
import { useFileTree } from '../../hooks/useFileTree';
import { useTypst } from '../../hooks/useTypst';
import { useProperties } from '../../hooks/useProperties';
import type { DocumentList } from '../../types/documents';
import type { TypstPdfOptions } from '../../types/typst';
import type { FileNode } from '../../types/files';
import type { TypstOutputFormat } from '../../types/typst';
import { isTemporaryFile } from '../../utils/fileUtils';
import { ChevronDownIcon, OptionsIcon, ExportIcon } from '../common/Icons';

interface TypstExportButtonProps {
    className?: string;
    selectedDocId?: string | null;
    documents?: Array<{ id: string; name: string; }>;
    linkedFileInfo?: {
        fileName?: string;
        filePath?: string;
        fileId?: string;
    } | null;
    useSharedSettings?: boolean;
}

const TypstExportButton: React.FC<TypstExportButtonProps> = ({
    className = '',
    selectedDocId,
    documents,
    linkedFileInfo,
    useSharedSettings = false
}) => {
    const { exportDocument } = useTypst();
    const { selectedFileId, getFile, fileTree } = useFileTree();
    const { data: doc, changeData: changeDoc } = useCollab<DocumentList>();
    const { getProperty, setProperty, registerProperty } = useProperties();
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [autoMainFile, setAutoMainFile] = useState<string | undefined>();
    const [userSelectedMainFile, setUserSelectedMainFile] = useState<string | undefined>();
    const [availableTypstFiles, setAvailableTypstFiles] = useState<string[]>([]);
    const [selectedFormat, setSelectedFormat] = useState<TypstOutputFormat>('pdf');
    const [localPdfOptions, setLocalPdfOptions] = useState<TypstPdfOptions>({
        pdfStandard: '"1.7"',
        pdfTags: true
    });
    const [isPdfOptionsOpen, setIsPdfOptionsOpen] = useState(false);
    const [includeLog, setIncludeLog] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const propertiesRegistered = useRef(false);
    const [propertiesLoaded, setPropertiesLoaded] = useState(false);

    const projectMainFile = useSharedSettings ? doc?.projectMetadata?.mainFile : undefined;
    const effectiveMainFile = projectMainFile || userSelectedMainFile || autoMainFile;

    useEffect(() => {
        if (propertiesRegistered.current) return;
        propertiesRegistered.current = true;

        registerProperty({
            id: 'typst-export-main-file',
            category: 'Export',
            subcategory: 'Typst',
            defaultValue: undefined
        });

        registerProperty({
            id: 'typst-export-format',
            category: 'Export',
            subcategory: 'Typst',
            defaultValue: 'pdf'
        });

        registerProperty({
            id: 'typst-export-pdf-standard',
            category: 'Export',
            subcategory: 'Typst',
            defaultValue: '"1.7"'
        });

        registerProperty({
            id: 'typst-export-pdf-tags',
            category: 'Export',
            subcategory: 'Typst',
            defaultValue: true
        });

        registerProperty({
            id: 'typst-export-include-log',
            category: 'Export',
            subcategory: 'Typst',
            defaultValue: false
        });
    }, [registerProperty]);

    useEffect(() => {
        if (propertiesLoaded) return;

        const storedMainFile = getProperty('typst-export-main-file');
        const storedFormat = getProperty('typst-export-format');
        const storedPdfStandard = getProperty('typst-export-pdf-standard');
        const storedPdfTags = getProperty('typst-export-pdf-tags');
        const storedIncludeLog = getProperty('typst-export-include-log');

        if (storedMainFile !== undefined) {
            setUserSelectedMainFile(storedMainFile as string | undefined);
        }

        if (storedFormat !== undefined) {
            setSelectedFormat(storedFormat as TypstOutputFormat);
        }

        if (storedPdfStandard !== undefined || storedPdfTags !== undefined) {
            setLocalPdfOptions({
                pdfStandard: storedPdfStandard as string || '"1.7"',
                pdfTags: storedPdfTags !== undefined ? Boolean(storedPdfTags) : true
            });
        }

        if (storedIncludeLog !== undefined) {
            setIncludeLog(Boolean(storedIncludeLog));
        }

        setPropertiesLoaded(true);
    }, [getProperty, propertiesLoaded]);

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
            if (selectedDocId && linkedFileInfo?.filePath && linkedFileInfo.filePath.endsWith('.typ')) {
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

    const handleExport = async () => {
        if (!effectiveMainFile || isExporting) return;

        setIsExporting(true);
        try {
            const exportPdfOptions = selectedFormat === 'pdf' ? localPdfOptions : undefined;
            await exportDocument(effectiveMainFile, {
                format: selectedFormat,
                includeLog,
                pdfOptions: exportPdfOptions
            });
        } finally {
            setIsExporting(false);
            setIsDropdownOpen(false);
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
            setProperty('typst-export-main-file', newMainFile);
        }
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
                return `${doc.name} ${t('(linked)')}`;
            }
        }

        return getFileName(path);
    };

    const isDisabled = isExporting || !effectiveMainFile;

    return (
        <div className={`typst-export-buttons ${className}`} ref={dropdownRef}>
            <div className="compile-button-group">
                <button
                    className={`typst-button export-button ${isExporting ? 'exporting' : ''}`}
                    onClick={handleExport}
                    disabled={isDisabled}
                    title={t('Export')}>
                    <ExportIcon />
                </button>

                <button
                    className="typst-button dropdown-toggle"
                    onClick={toggleDropdown}
                    disabled={isExporting}
                    title={t('Export Options')}>
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
                            disabled={isExporting}>
                            <option value="auto">{t('Auto-detect')}</option>
                            {availableTypstFiles.map((filePath) =>
                                <option key={filePath} value={filePath}>
                                    {getFileName(filePath)}
                                </option>
                            )}
                        </select>
                    </div>
                }

                <div className="dropdown-section">
                    <div className="format-selector-header">
                        <div className="dropdown-title">{t('Export Format:')}</div>
                    </div>

                    <div className="format-selector-group">
                        <select
                            value={selectedFormat}
                            onChange={(e) => {
                                const format = e.target.value as TypstOutputFormat;
                                setSelectedFormat(format);
                                setProperty('typst-export-format', format);
                                if (format !== 'pdf') {
                                    setIsPdfOptionsOpen(false);
                                }
                            }}
                            className="dropdown-select"
                            disabled={isExporting}>
                            <option value="pdf">{t('PDF')}</option>
                            <option value="svg">{t('SVG')}</option>
                            <option value="canvas">{t('Canvas')}</option>
                        </select>
                        {selectedFormat === 'pdf' &&
                            <button
                                className={`pdf-options-toggle ${isPdfOptionsOpen ? 'active' : ''}`}
                                onClick={() => setIsPdfOptionsOpen(!isPdfOptionsOpen)}
                                title={t('PDF Options')}
                                disabled={isExporting}>
                                <OptionsIcon />
                            </button>
                        }
                    </div>
                    {selectedFormat === 'pdf' && isPdfOptionsOpen &&
                        <div className="pdf-options-section">
                            <div className="pdf-option">
                                <label className="dropdown-title">{t('PDF Standard:')}</label>
                                <select
                                    value={localPdfOptions.pdfStandard || '"1.7"'}
                                    onChange={(e) => {
                                        const newOptions = { ...localPdfOptions, pdfStandard: e.target.value };
                                        setLocalPdfOptions(newOptions);
                                        setProperty('typst-export-pdf-standard', e.target.value);
                                    }}
                                    className="dropdown-select"
                                    disabled={isExporting}>
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
                                    checked={localPdfOptions.pdfTags !== false}
                                    onChange={(e) => {
                                        const newOptions = { ...localPdfOptions, pdfTags: e.target.checked };
                                        setLocalPdfOptions(newOptions);
                                        setProperty('typst-export-pdf-tags', e.target.checked);
                                    }}
                                    disabled={isExporting} />

                                {t('Enable PDF tags (accessibility)')}
                            </label>
                        </div>
                    }
                </div>

                <div className="dropdown-section">
                    <label className="dropdown-checkbox">
                        <input
                            type="checkbox"
                            checked={includeLog}
                            onChange={(e) => {
                                setIncludeLog(e.target.checked);
                                setProperty('typst-export-include-log', e.target.checked);
                            }}
                            disabled={isExporting} />

                        {t('Include log file')}
                    </label>
                </div>

                <div className="dropdown-section">
                    <button
                        className="dropdown-button"
                        onClick={handleExport}
                        disabled={isDisabled}>
                        <ExportIcon />
                        {t('Export')}
                    </button>
                </div>
            </PositionedDropdown>
        </div>
    );

};

export default TypstExportButton;