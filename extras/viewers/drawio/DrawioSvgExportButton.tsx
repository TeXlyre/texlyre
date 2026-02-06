// extras/viewers/drawio/DrawioPngExportButton.tsx
import { t } from '@/i18n';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { nanoid } from 'nanoid';

import PositionedDropdown from '@/components/common/PositionedDropdown';
import { ChevronDownIcon, LoaderIcon } from '@/components/common/Icons';
import { useProperties } from '@/hooks/useProperties';
import { fileStorageService } from '@/services/FileStorageService';
import type { FileNode } from '@/types/files';

interface DrawioSvgExportButtonProps {
    className?: string;
    disabled?: boolean;
    fileName: string;
    onExport: (options: {
        format: 'svg';
        border?: number;
        scale?: number;
        background?: string;
        transparent?: boolean;
        shadow?: boolean;
    }) => Promise<string>;
}

const DrawioSvgExportButton: React.FC<DrawioSvgExportButtonProps> = ({
    className = '',
    disabled = false,
    fileName,
    onExport
}) => {
    const { getProperty, setProperty, registerProperty } = useProperties();
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const propertiesRegistered = useRef(false);
    const [propertiesLoaded, setPropertiesLoaded] = useState(false);

    const [margin, setMargin] = useState(0);
    const [scale, setScale] = useState(1);
    const [backgroundColor, setBackgroundColor] = useState('#ffffff');
    const [transparentBackground, setTransparentBackground] = useState(true);

    useEffect(() => {
        if (propertiesRegistered.current) return;
        propertiesRegistered.current = true;

        registerProperty({
            id: 'drawio-svg-margin',
            category: 'Export',
            subcategory: 'Draw.io SVG',
            defaultValue: 0
        });

        registerProperty({
            id: 'drawio-svg-scale',
            category: 'Export',
            subcategory: 'Draw.io SVG',
            defaultValue: 1
        });

        registerProperty({
            id: 'drawio-svg-background',
            category: 'Export',
            subcategory: 'Draw.io SVG',
            defaultValue: '#ffffff'
        });

        registerProperty({
            id: 'drawio-svg-transparent',
            category: 'Export',
            subcategory: 'Draw.io SVG',
            defaultValue: true
        });
    }, [registerProperty]);

    useEffect(() => {
        if (propertiesLoaded) return;

        const storedMargin = getProperty('drawio-svg-margin');
        const storedScale = getProperty('drawio-svg-scale');
        const storedBackground = getProperty('drawio-svg-background');
        const storedTransparent = getProperty('drawio-svg-transparent');

        if (storedMargin !== undefined) {
            setMargin(Number(storedMargin));
        }

        if (storedScale !== undefined) {
            setScale(Number(storedScale));
        }

        if (storedBackground !== undefined) {
            setBackgroundColor(String(storedBackground));
        }

        if (storedTransparent !== undefined) {
            setTransparentBackground(Boolean(storedTransparent));
        }

        setPropertiesLoaded(true);
    }, [getProperty, propertiesLoaded]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as Node;

            if (dropdownRef.current && !dropdownRef.current.contains(target)) {
                const portaledDropdown = document.querySelector('.drawio-svg-dropdown');
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
    }, []);

    const handleSaveAsSvg = async () => {
        if (disabled || isExporting) return;

        setIsExporting(true);

        try {
            const exportOptions: any = {
                format: 'svg' as const,
            };

            if (margin > 0) {
                exportOptions.border = margin;
            }

            if (scale !== 1) {
                exportOptions.scale = scale;
            }

            if (transparentBackground) {
                exportOptions.transparent = true;
            } else if (backgroundColor) {
                exportOptions.background = backgroundColor;
            }

            console.log('SVG Export options:', exportOptions);

            const data = await onExport(exportOptions);

            let svgContent: string;

            if (data.startsWith('data:image/svg+xml;base64,')) {
                const base64Data = data.substring('data:image/svg+xml;base64,'.length);
                svgContent = atob(base64Data);
            } else if (data.startsWith('<svg') || data.startsWith('<?xml')) {
                svgContent = data;
            } else {
                svgContent = atob(data);
            }

            const encoder = new TextEncoder();
            const svgData = encoder.encode(svgContent);

            const newFileName = fileName.replace(/\.(drawio|dio|xml)$/i, '.svg');
            const newFilePath = fileName.replace(/\.(drawio|dio|xml)$/i, '.svg');

            const newFile: FileNode = {
                id: nanoid(),
                name: newFileName.split('/').pop() || newFileName,
                path: newFilePath.startsWith('/') ? newFilePath : `/${newFilePath}`,
                type: 'file',
                content: svgData.buffer,
                lastModified: Date.now(),
                size: svgData.byteLength,
                isBinary: false,
                mimeType: 'image/svg+xml',
                isDeleted: false
            };

            await fileStorageService.storeFile(newFile);

        } catch (error) {
            console.error('Error saving SVG:', error);
        } finally {
            setIsExporting(false);
        }
    };

    const handleDownloadAsSvg = async () => {
        if (disabled || isExporting) return;

        setIsExporting(true);

        try {
            const exportOptions: any = {
                format: 'svg' as const,
            };

            if (margin > 0) {
                exportOptions.border = margin;
            }

            if (scale !== 1) {
                exportOptions.scale = scale;
            }

            if (transparentBackground) {
                exportOptions.transparent = true;
            } else if (backgroundColor) {
                exportOptions.background = backgroundColor;
            }

            console.log('SVG Export options:', exportOptions);

            const data = await onExport(exportOptions);

            let svgContent: string;

            if (data.startsWith('data:image/svg+xml;base64,')) {
                const base64Data = data.substring('data:image/svg+xml;base64,'.length);
                svgContent = atob(base64Data);
            } else if (data.startsWith('<svg') || data.startsWith('<?xml')) {
                svgContent = data;
            } else {
                svgContent = atob(data);
            }

            const blob = new Blob([svgContent], { type: 'image/svg+xml' });

            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName.replace(/\.(drawio|dio|xml)$/i, '.svg');
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

        } catch (error) {
            console.error('Error downloading SVG:', error);
        } finally {
            setIsExporting(false);
            setIsDropdownOpen(false);
        }
    };

    const toggleDropdown = (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsDropdownOpen(!isDropdownOpen);
    };

    return (
        <div className={`drawio-export-button-container ${className}`} ref={dropdownRef}>
            <div className="drawio-export-button-group">
                <button
                    className={`control-button export-button ${isExporting ? 'exporting' : ''}`}
                    onClick={handleSaveAsSvg}
                    disabled={disabled || isExporting}
                    title={t('Save as SVG')}>
                    {isExporting ? <LoaderIcon /> : 'SVG'}
                </button>

                <button
                    className="control-button dropdown-toggle"
                    onClick={toggleDropdown}
                    disabled={disabled || isExporting}
                    title={t('SVG Export Options')}>
                    <ChevronDownIcon />
                </button>
            </div>

            <PositionedDropdown
                isOpen={isDropdownOpen}
                triggerElement={dropdownRef.current?.querySelector('.drawio-export-button-group') as HTMLElement}
                className="drawio-svg-dropdown">
                <div className="dropdown-option">
                    <label>
                        {t('Margin (px):')}
                        <input
                            type="number"
                            min="0"
                            max="100"
                            value={margin}
                            onChange={(e) => {
                                const value = parseInt(e.target.value, 10);
                                setMargin(value);
                                setProperty('drawio-svg-margin', value);
                            }}
                        />
                    </label>
                </div>

                <div className="dropdown-option">
                    <label>
                        {t('Image scale:')}
                        <input
                            type="number"
                            min="0.1"
                            max="10"
                            step="0.1"
                            value={scale}
                            onChange={(e) => {
                                const value = parseFloat(e.target.value);
                                setScale(value);
                                setProperty('drawio-svg-scale', value);
                            }}
                        />
                    </label>
                </div>

                <div className="dropdown-option">
                    <label>
                        <input
                            type="checkbox"
                            checked={transparentBackground}
                            onChange={(e) => {
                                setTransparentBackground(e.target.checked);
                                setProperty('drawio-svg-transparent', e.target.checked);
                            }}
                        />
                        {t('Transparent background')}
                    </label>
                </div>

                {!transparentBackground && (
                    <div className="dropdown-option">
                        <label>
                            {t('Background color:')}
                            <input
                                type="color"
                                value={backgroundColor}
                                onChange={(e) => {
                                    setBackgroundColor(e.target.value);
                                    setProperty('drawio-svg-background', e.target.value);
                                }}
                            />
                        </label>
                    </div>
                )}

                <div className="dropdown-option">
                    <button
                        className="dropdown-button"
                        onClick={handleDownloadAsSvg}
                        disabled={disabled || isExporting}>
                        {t('Download SVG')}
                    </button>
                </div>
            </PositionedDropdown>
        </div>
    );
};

export default DrawioSvgExportButton;