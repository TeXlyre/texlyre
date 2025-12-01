// src/components/output/TypstExportButton.tsx
import { t } from '@/i18n';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';

import { useCollab } from '../../hooks/useCollab';
import { useFileTree } from '../../hooks/useFileTree';
import { useTypst } from '../../hooks/useTypst';
import type { DocumentList } from '../../types/documents';
import type { TypstPdfOptions } from '../../types/typst';
import type { FileNode } from '../../types/files';
import type { TypstOutputFormat } from '../../types/typst';
import { isTemporaryFile } from '../../utils/fileUtils';
import { ChevronDownIcon, OptionsIcon, ExportIcon } from '../common/Icons';

interface TypstExportButtonProps {
    className?: string;
    selectedDocId?: string | null;
    documents?: Array<{ id: string; name: string }>;
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

    const projectMainFile = useSharedSettings ? doc?.projectMetadata?.mainFile : undefined;
    const effectiveMainFile = projectMainFile || userSelectedMainFile || autoMainFile;

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
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsDropdownOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

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
            setUserSelectedMainFile(filePath === 'auto' ? undefined : filePath);
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

            {isDropdownOpen && (
                <div className="typst-dropdown">
                    <div className="main-file-display">
                        <div className="main-file-label">{t('Main file:')}</div>
                        <div className="main-file-path" title={effectiveMainFile}>
                            {getDisplayName(effectiveMainFile)}
                            {projectMainFile && <span className="shared-indicator">{t('(shared)')}</span>}
                        </div>
                    </div>

                    {useSharedSettings && (
                        <div className="main-file-selector">
                            <div className="main-file-selector-label">{t('Select main file:')}</div>
                            <select
                                value={projectMainFile || userSelectedMainFile || 'auto'}
                                onChange={(e) => handleMainFileChange(e.target.value)}
                                className="main-file-select"
                                disabled={isExporting}>
                                <option value="auto">{t('Auto-detect')}</option>
                                {availableTypstFiles.map((filePath) => (
                                    <option key={filePath} value={filePath}>
                                        {getFileName(filePath)}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}

                    <div className="format-selector">
                        <div className="format-selector-header">
                            <div className="format-label">{t('Export Format:')}</div>

                        </div>

                        <div className="format-selector-group">
                            <select
                                value={selectedFormat}
                                onChange={(e) => {
                                    const format = e.target.value as TypstOutputFormat;
                                    setSelectedFormat(format);
                                    if (format !== 'pdf') {
                                        setIsPdfOptionsOpen(false);
                                    }
                                }}
                                className="format-select"
                                disabled={isExporting}>
                                <option value="pdf">PDF</option>
                                <option value="svg">SVG</option>
                                <option value="canvas">{t('Canvas')}</option>
                            </select>
                            {selectedFormat === 'pdf' && (
                                <button
                                    className={`pdf-options-toggle ${isPdfOptionsOpen ? 'active' : ''}`}
                                    onClick={() => setIsPdfOptionsOpen(!isPdfOptionsOpen)}
                                    title={t('PDF Options')}
                                    disabled={isExporting}>
                                    <OptionsIcon />
                                </button>
                            )}
                        </div>
                        {selectedFormat === 'pdf' && isPdfOptionsOpen && (
                            <div className="pdf-options-section">
                                <div className="pdf-option">
                                    <label className="pdf-option-label">{t('PDF Standard:')}</label>
                                    <select
                                        value={localPdfOptions.pdfStandard || '"1.7"'}
                                        onChange={(e) => setLocalPdfOptions({ ...localPdfOptions, pdfStandard: e.target.value })}
                                        className="pdf-option-select"
                                        disabled={isExporting}>
                                        <option value='"1.7"'>{t('PDF/A-1')}</option>
                                        <option value='"ua-1"'>{t('PDF/UA-1')}</option>
                                        <option value='"2.0"'>{t('PDF 2.0')}</option>
                                    </select>
                                </div>

                                <label className="pdf-option-checkbox">
                                    <input
                                        type="checkbox"
                                        checked={localPdfOptions.pdfTags !== false}
                                        onChange={(e) => setLocalPdfOptions({ ...localPdfOptions, pdfTags: e.target.checked })}
                                        disabled={isExporting}
                                    />
                                    {t('Enable PDF tags (accessibility)')}
                                </label>
                            </div>
                        )}
                    </div>

                    <div className="export-options">
                        <label className="export-checkbox">
                            <input
                                type="checkbox"
                                checked={includeLog}
                                onChange={(e) => setIncludeLog(e.target.checked)}
                                disabled={isExporting}
                            />
                            {t('Include log file')}
                        </label>
                    </div>

                    <div className="export-actions">
                        <button
                            className="export-action-button"
                            onClick={handleExport}
                            disabled={isDisabled}>
                            <ExportIcon />
                            {t('Export')}
                        </button>
                    </div>
                </div>
            )
            }
        </div >
    );
};

export default TypstExportButton;