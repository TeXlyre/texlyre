import { t } from '@/i18n';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';

import { useCollab } from '../../hooks/useCollab';
import { useFileTree } from '../../hooks/useFileTree';
import { useLaTeX } from '../../hooks/useLaTeX';
import type { DocumentList } from '../../types/documents';
import type { FileNode } from '../../types/files';
import { isTemporaryFile } from '../../utils/fileUtils';
import { ChevronDownIcon, ExportIcon } from '../common/Icons';

interface LaTeXExportButtonProps {
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

const LaTeXExportButton: React.FC<LaTeXExportButtonProps> = ({
    className = '',
    selectedDocId,
    documents,
    linkedFileInfo,
    useSharedSettings = false
}) => {
    const { exportDocument, latexEngine } = useLaTeX();
    const { selectedFileId, getFile, fileTree } = useFileTree();
    const { data: doc, changeData: changeDoc } = useCollab<DocumentList>();
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [autoMainFile, setAutoMainFile] = useState<string | undefined>();
    const [userSelectedMainFile, setUserSelectedMainFile] = useState<string | undefined>();
    const [availableTexFiles, setAvailableTexFiles] = useState<string[]>([]);
    const [selectedEngine, setSelectedEngine] = useState<'pdftex' | 'xetex' | 'luatex'>('pdftex');
    const [selectedFormat, setSelectedFormat] = useState<'pdf' | 'dvi'>('pdf');
    const [includeLog, setIncludeLog] = useState(false);
    const [includeDvi, setIncludeDvi] = useState(false);
    const [includeBbl, setIncludeBbl] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const projectMainFile = useSharedSettings ? doc?.projectMetadata?.mainFile : undefined;
    const effectiveMainFile = projectMainFile || userSelectedMainFile || autoMainFile;

    useEffect(() => {
        setSelectedEngine(latexEngine);
    }, [latexEngine]);

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
            if (selectedDocId && linkedFileInfo?.filePath && linkedFileInfo.filePath.endsWith('.tex')) {
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
        if (selectedEngine !== 'xetex' && selectedFormat === 'dvi') {
            setSelectedFormat('pdf');
        }
    }, [selectedEngine, selectedFormat]);

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
            await exportDocument(effectiveMainFile, {
                engine: selectedEngine,
                format: selectedFormat,
                includeLog,
                includeDvi,
                includeBbl
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
        if (!path) return t('No .tex file');
        return path.split('/').pop() || path;
    };

    const getDisplayName = (path?: string) => {
        if (!path) return t('No .tex file');

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
        <div className={`latex-export-buttons ${className}`} ref={dropdownRef}>
            <div className="compile-button-group">
                <button
                    className={`latex-button export-button ${isExporting ? 'exporting' : ''}`}
                    onClick={handleExport}
                    disabled={isDisabled}
                    title={t('Export')}>
                    <ExportIcon />
                </button>

                <button
                    className="latex-button dropdown-toggle"
                    onClick={toggleDropdown}
                    disabled={isExporting}
                    title={t('Export Options')}>
                    <ChevronDownIcon />
                </button>
            </div>

            {isDropdownOpen && (
                <div className="latex-dropdown">
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
                                {availableTexFiles.map((filePath) => (
                                    <option key={filePath} value={filePath}>
                                        {getFileName(filePath)}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}

                    <div className="engine-selector">
                        <div className="engine-label">{t('LaTeX Engine:')}</div>
                        <select
                            value={selectedEngine}
                            onChange={(e) => setSelectedEngine(e.target.value as 'pdftex' | 'xetex' | 'luatex')}
                            className="engine-select"
                            disabled={isExporting}>
                            <option value="pdftex">{t('pdfTeX')}</option>
                            <option value="xetex">{t('XeTeX')}</option>
                        </select>
                    </div>

                    <div className="format-selector">
                        <div className="format-label">{t('Export Format:')}</div>
                        <select
                            value={selectedFormat}
                            onChange={(e) => setSelectedFormat(e.target.value as 'pdf' | 'dvi')}
                            className="format-select"
                            disabled={isExporting}>
                            <option value="pdf">PDF</option>
                            {selectedEngine === 'xetex' && <option value="dvi">DVI</option>}
                        </select>
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

                        {selectedFormat === 'pdf' && selectedEngine === 'xetex' && (
                            <label className="export-checkbox">
                                <input
                                    type="checkbox"
                                    checked={includeDvi}
                                    onChange={(e) => setIncludeDvi(e.target.checked)}
                                    disabled={isExporting}
                                />
                                {t('Include DVI/XDV file')}
                            </label>
                        )}

                        <label className="export-checkbox">
                            <input
                                type="checkbox"
                                checked={includeBbl}
                                onChange={(e) => setIncludeBbl(e.target.checked)}
                                disabled={isExporting}
                            />
                            {t('Include BBL file')}
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
            )}
        </div>
    );
};

export default LaTeXExportButton;