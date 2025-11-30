// src/components/output/LaTeXExportButton.tsx
import { t } from '@/i18n';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';

import { useCollab } from '../../hooks/useCollab';
import { useFileTree } from '../../hooks/useFileTree';
import { useLaTeX } from '../../hooks/useLaTeX';
import type { DocumentList } from '../../types/documents';
import type { FileNode } from '../../types/files';
import { isTemporaryFile } from '../../utils/fileUtils';
import { ChevronDownIcon, DownloadIcon } from '../common/Icons';

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
    const { exportDocument } = useLaTeX();
    const { selectedFileId, getFile, fileTree } = useFileTree();
    const { data: doc } = useCollab<DocumentList>();
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [autoMainFile, setAutoMainFile] = useState<string | undefined>();
    const [userSelectedMainFile, setUserSelectedMainFile] = useState<string | undefined>();
    const [availableTexFiles, setAvailableTexFiles] = useState<string[]>([]);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const projectMainFile = useSharedSettings ? doc?.projectMetadata?.mainFile : undefined;
    const effectiveMainFile = projectMainFile || userSelectedMainFile || autoMainFile;

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

    const handleExport = async (format: 'pdf' | 'dvi', includeLog: boolean) => {
        if (!effectiveMainFile || isExporting) return;

        setIsExporting(true);
        try {
            await exportDocument(effectiveMainFile, { format, includeLog });
        } finally {
            setIsExporting(false);
            setIsDropdownOpen(false);
        }
    };

    const toggleDropdown = (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsDropdownOpen(!isDropdownOpen);
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
                    onClick={() => handleExport('pdf', false)}
                    disabled={isDisabled}
                    title={t('Export PDF')}>
                    <DownloadIcon />
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
                        <div className="main-file-label">{t('Export file:')}</div>
                        <div className="main-file-path" title={effectiveMainFile}>
                            {getDisplayName(effectiveMainFile)}
                        </div>
                    </div>

                    <div className="export-options">
                        <div className="export-option" onClick={() => handleExport('pdf', false)}>
                            {t('Export PDF')}
                        </div>
                        <div className="export-option" onClick={() => handleExport('pdf', true)}>
                            {t('Export PDF with Log')}
                        </div>
                        <div className="export-option" onClick={() => handleExport('dvi', false)}>
                            {t('Export DVI')}
                        </div>
                        <div className="export-option" onClick={() => handleExport('dvi', true)}>
                            {t('Export DVI with Log')}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default LaTeXExportButton;