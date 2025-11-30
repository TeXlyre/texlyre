// src/components/output/TypstExportButton.tsx
import { t } from '@/i18n';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';

import { useCollab } from '../../hooks/useCollab';
import { useFileTree } from '../../hooks/useFileTree';
import { useTypst } from '../../hooks/useTypst';
import type { DocumentList } from '../../types/documents';
import type { FileNode } from '../../types/files';
import type { TypstOutputFormat } from '../../types/typst';
import { isTemporaryFile } from '../../utils/fileUtils';
import { ChevronDownIcon, DownloadIcon } from '../common/Icons';

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
    const { exportDocument, currentFormat } = useTypst();
    const { selectedFileId, getFile, fileTree } = useFileTree();
    const { data: doc } = useCollab<DocumentList>();
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [autoMainFile, setAutoMainFile] = useState<string | undefined>();
    const [userSelectedMainFile, setUserSelectedMainFile] = useState<string | undefined>();
    const [availableTypstFiles, setAvailableTypstFiles] = useState<string[]>([]);
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

    const handleExport = async (format: TypstOutputFormat, includeLog: boolean) => {
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
                    onClick={() => handleExport(currentFormat, false)}
                    disabled={isDisabled}
                    title={t('Export Output')}>
                    <DownloadIcon />
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
                        <div className="export-option" onClick={() => handleExport('svg', false)}>
                            {t('Export SVG')}
                        </div>
                        <div className="export-option" onClick={() => handleExport('svg', true)}>
                            {t('Export SVG with Log')}
                        </div>
                        <div className="export-option" onClick={() => handleExport('canvas', false)}>
                            {t('Export Canvas')}
                        </div>
                        <div className="export-option" onClick={() => handleExport('canvas', true)}>
                            {t('Export Canvas with Log')}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default TypstExportButton;