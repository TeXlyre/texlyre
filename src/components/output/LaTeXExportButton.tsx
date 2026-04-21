// src/components/output/LaTeXExportButton.tsx
import { t } from '@/i18n';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';

import PositionedDropdown from '../common/PositionedDropdown';
import { useCollab } from '../../hooks/useCollab';
import { useFileTree } from '../../hooks/useFileTree';
import { useLaTeX } from '../../hooks/useLaTeX';
import { useProperties } from '../../hooks/useProperties';
import type { LaTeXEngine } from '../../types/latex';
import type { DocumentList } from '../../types/documents';
import type { FileNode } from '../../types/files';
import { isLatexFile, isTemporaryFile } from '../../utils/fileUtils';
import { latexService } from '../../services/LaTeXService';
import { BUSYTEX_BUNDLE_LABELS } from '../../extensions/texlyre-busytex/BusyTeXService';
import { ChevronDownIcon, ExportIcon, TrashIcon, OptionsIcon } from '../common/Icons';

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

const SWIFT_ENGINES: Array<{ label: string; value: LaTeXEngine }> = [
    { label: 'pdfTeX (SwiftLaTeX)', value: 'pdftex' },
    { label: 'XeTeX (SwiftLaTeX)', value: 'xetex' },
];

const BUSYTEX_ENGINES: Array<{ label: string; value: LaTeXEngine }> = [
    { label: 'pdfTeX (BusyTeX)', value: 'busytex-pdftex' },
    { label: 'XeTeX (BusyTeX)', value: 'busytex-xetex' },
    { label: 'LuaTeX (BusyTeX)', value: 'busytex-luatex' },
];

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
    const { getProperty, setProperty, registerProperty } = useProperties();
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [autoMainFile, setAutoMainFile] = useState<string | undefined>();
    const [userSelectedMainFile, setUserSelectedMainFile] = useState<string | undefined>();
    const [availableTexFiles, setAvailableTexFiles] = useState<string[]>([]);
    const [selectedEngine, setSelectedEngine] = useState<LaTeXEngine>('pdftex');
    const [selectedFormat, setSelectedFormat] = useState<'pdf' | 'dvi'>('pdf');
    const [includeLog, setIncludeLog] = useState(false);
    const [includeDvi, setIncludeDvi] = useState(false);
    const [includeBbl, setIncludeBbl] = useState(false);
    const [selectedBundle, setSelectedBundle] = useState<string>('recommended');
    const [isCacheOptionsOpen, setIsCacheOptionsOpen] = useState(false);
    const [bundleCacheStatus, setBundleCacheStatus] = useState<Record<string, boolean>>({});
    const [isDeletingBundle, setIsDeletingBundle] = useState<string | null>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const propertiesRegistered = useRef(false);
    const [propertiesLoaded, setPropertiesLoaded] = useState(false);

    const projectMainFile = useSharedSettings ? doc?.projectMetadata?.mainFile : undefined;
    const effectiveMainFile = projectMainFile || userSelectedMainFile || autoMainFile;
    const isBusyTeX = selectedEngine.startsWith('busytex-');

    useEffect(() => {
        if (propertiesRegistered.current) return;
        propertiesRegistered.current = true;

        registerProperty({
            id: 'latex-export-main-file',
            category: 'Export',
            subcategory: 'LaTeX',
            defaultValue: undefined
        });

        registerProperty({
            id: 'latex-export-engine',
            category: 'Export',
            subcategory: 'LaTeX',
            defaultValue: 'pdftex'
        });

        registerProperty({
            id: 'latex-export-format',
            category: 'Export',
            subcategory: 'LaTeX',
            defaultValue: 'pdf'
        });

        registerProperty({
            id: 'latex-export-include-log',
            category: 'Export',
            subcategory: 'LaTeX',
            defaultValue: false
        });

        registerProperty({
            id: 'latex-export-include-dvi',
            category: 'Export',
            subcategory: 'LaTeX',
            defaultValue: false
        });

        registerProperty({
            id: 'latex-export-include-bbl',
            category: 'Export',
            subcategory: 'LaTeX',
            defaultValue: false
        });

        registerProperty({
            id: 'latex-export-busytex-bundle',
            category: 'Export',
            subcategory: 'LaTeX',
            defaultValue: 'recommended'
        });
    }, [registerProperty]);

    useEffect(() => {
        if (propertiesLoaded) return;

        const storedMainFile = getProperty('latex-export-main-file');
        const storedEngine = getProperty('latex-export-engine');
        const storedFormat = getProperty('latex-export-format');
        const storedIncludeLog = getProperty('latex-export-include-log');
        const storedIncludeDvi = getProperty('latex-export-include-dvi');
        const storedIncludeBbl = getProperty('latex-export-include-bbl');
        const storedBundle = getProperty('latex-export-busytex-bundle');

        if (storedMainFile !== undefined) setUserSelectedMainFile(storedMainFile as string | undefined);
        if (storedEngine !== undefined) setSelectedEngine(storedEngine as LaTeXEngine);
        if (storedFormat !== undefined) setSelectedFormat(storedFormat as 'pdf' | 'dvi');
        if (storedIncludeLog !== undefined) setIncludeLog(Boolean(storedIncludeLog));
        if (storedIncludeDvi !== undefined) setIncludeDvi(Boolean(storedIncludeDvi));
        if (storedIncludeBbl !== undefined) setIncludeBbl(Boolean(storedIncludeBbl));
        if (storedBundle !== undefined) setSelectedBundle(storedBundle as string);

        setPropertiesLoaded(true);
    }, [getProperty, propertiesLoaded]);

    useEffect(() => {
        setSelectedEngine(latexEngine);
    }, [latexEngine]);

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
        if (isBusyTeX && selectedFormat === 'dvi') {
            setSelectedFormat('pdf');
        }
        if (selectedEngine !== 'xetex' && selectedFormat === 'dvi') {
            setSelectedFormat('pdf');
        }
    }, [selectedEngine, selectedFormat, isBusyTeX]);

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
    }, []);

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

    const handleExport = async () => {
        if (!effectiveMainFile || isExporting) return;
        setIsExporting(true);
        try {
            await exportDocument(effectiveMainFile, {
                engine: selectedEngine,
                format: selectedFormat,
                includeLog,
                includeDvi: isBusyTeX ? false : includeDvi,
                includeBbl: isBusyTeX ? false : includeBbl,
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
                if (!d.projectMetadata) d.projectMetadata = { name: '', description: '' };
                d.projectMetadata.mainFile = filePath === 'auto' ? undefined : filePath;
            });
        } else {
            const newMainFile = filePath === 'auto' ? undefined : filePath;
            setUserSelectedMainFile(newMainFile);
            setProperty('latex-export-main-file', newMainFile);
        }
    };

    const handleBundleChange = (bundleId: string) => {
        setSelectedBundle(bundleId);
        setProperty('latex-export-busytex-bundle', bundleId);
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
                            disabled={isExporting}>
                            <option value="auto">{t('Auto-detect')}</option>
                            {availableTexFiles.map((filePath) => (
                                <option key={filePath} value={filePath}>{getFileName(filePath)}</option>
                            ))}
                        </select>
                    </div>
                )}

                <div className="dropdown-section">
                    <div className="dropdown-title">{t('LaTeX Engine:')}</div>
                    <div className="format-selector-group">
                        <select
                            value={selectedEngine}
                            onChange={(e) => {
                                const engine = e.target.value as LaTeXEngine;
                                setSelectedEngine(engine);
                                setProperty('latex-export-engine', engine);
                            }}
                            className="dropdown-select"
                            disabled={isExporting}>
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
                                disabled={isExporting}>
                                <OptionsIcon />
                            </button>
                        )}
                    </div>
                    {isBusyTeX && isCacheOptionsOpen && (
                        <div className="pdf-options-section">
                            <div className="dropdown-label">{t('Bundle for export:')}</div>
                            <select
                                value={selectedBundle}
                                onChange={(e) => handleBundleChange(e.target.value)}
                                className="dropdown-select"
                                disabled={isExporting}>
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
                                            disabled={isDeletingBundle === bundleId || isExporting}
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
                    <div className="dropdown-title">{t('Export Format:')}</div>
                    <select
                        value={selectedFormat}
                        onChange={(e) => {
                            const format = e.target.value as 'pdf' | 'dvi';
                            setSelectedFormat(format);
                            setProperty('latex-export-format', format);
                        }}
                        className="dropdown-select"
                        disabled={isExporting}>
                        <option value="pdf">PDF</option>
                        {selectedEngine === 'xetex' && <option value="dvi">DVI</option>}
                    </select>
                </div>

                <div className="dropdown-section">
                    <label className="dropdown-checkbox">
                        <input
                            type="checkbox"
                            checked={includeLog}
                            onChange={(e) => {
                                setIncludeLog(e.target.checked);
                                setProperty('latex-export-include-log', e.target.checked);
                            }}
                            disabled={isExporting} />
                        {t('Include log file')}
                    </label>

                    {!isBusyTeX && selectedFormat === 'pdf' && selectedEngine === 'xetex' && (
                        <label className="dropdown-checkbox">
                            <input
                                type="checkbox"
                                checked={includeDvi}
                                onChange={(e) => {
                                    setIncludeDvi(e.target.checked);
                                    setProperty('latex-export-include-dvi', e.target.checked);
                                }}
                                disabled={isExporting} />
                            {t('Include DVI/XDV file')}
                        </label>
                    )}

                    {!isBusyTeX && (
                        <label className="dropdown-checkbox">
                            <input
                                type="checkbox"
                                checked={includeBbl}
                                onChange={(e) => {
                                    setIncludeBbl(e.target.checked);
                                    setProperty('latex-export-include-bbl', e.target.checked);
                                }}
                                disabled={isExporting} />
                            {t('Include BBL file')}
                        </label>
                    )}
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

export default LaTeXExportButton;