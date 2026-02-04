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

interface DrawioPngExportButtonProps {
    className?: string;
    disabled?: boolean;
    fileName: string;
    onExport: (options: {
        format: 'png';
        border?: number;
        scale?: number;
        background?: string;
        transparent?: boolean;
        shadow?: boolean;
        grid?: boolean;
    }) => Promise<string>;
}

const DrawioPngExportButton: React.FC<DrawioPngExportButtonProps> = ({
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
    const [transparentBackground, setTransparentBackground] = useState(false);

    useEffect(() => {
        if (propertiesRegistered.current) return;
        propertiesRegistered.current = true;

        registerProperty({
            id: 'drawio-png-margin',
            category: 'Export',
            subcategory: 'Draw.io PNG',
            defaultValue: 0
        });

        registerProperty({
            id: 'drawio-png-scale',
            category: 'Export',
            subcategory: 'Draw.io PNG',
            defaultValue: 1
        });

        registerProperty({
            id: 'drawio-png-background',
            category: 'Export',
            subcategory: 'Draw.io PNG',
            defaultValue: '#ffffff'
        });

        registerProperty({
            id: 'drawio-png-transparent',
            category: 'Export',
            subcategory: 'Draw.io PNG',
            defaultValue: false
        });
    }, [registerProperty]);

    useEffect(() => {
        if (propertiesLoaded) return;

        const storedMargin = getProperty('drawio-png-margin');
        const storedScale = getProperty('drawio-png-scale');
        const storedBackground = getProperty('drawio-png-background');
        const storedTransparent = getProperty('drawio-png-transparent');

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
                const portaledDropdown = document.querySelector('.drawio-png-dropdown');
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

    const handleSaveAsPng = async () => {
        if (disabled || isExporting) return;

        setIsExporting(true);

        try {
            const exportOptions: any = {
                format: 'png' as const,
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

            console.log('PNG Export options:', exportOptions);

            const data = await onExport(exportOptions);

            let base64Data = data;
            if (data.startsWith('data:')) {
                const parts = data.split(',');
                if (parts.length > 1) {
                    base64Data = parts[1];
                }
            }

            const byteCharacters = atob(base64Data);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const binaryData = new Uint8Array(byteNumbers);

            const newFileName = fileName.replace(/\.(drawio|dio|xml)$/i, '.png');
            const newFilePath = fileName.replace(/\.(drawio|dio|xml)$/i, '.png');

            const newFile: FileNode = {
                id: nanoid(),
                name: newFileName.split('/').pop() || newFileName,
                path: newFilePath.startsWith('/') ? newFilePath : `/${newFilePath}`,
                type: 'file',
                content: binaryData.buffer,
                lastModified: Date.now(),
                size: binaryData.byteLength,
                isBinary: true,
                mimeType: 'image/png',
                isDeleted: false
            };

            await fileStorageService.storeFile(newFile);

        } catch (error) {
            console.error('Error saving PNG:', error);
        } finally {
            setIsExporting(false);
        }
    };

    const handleDownloadAsPng = async () => {
        if (disabled || isExporting) return;

        setIsExporting(true);

        try {
            const exportOptions: any = {
                format: 'png' as const,
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

            console.log('PNG Export options:', exportOptions);

            const data = await onExport(exportOptions);

            let base64Data = data;
            if (data.startsWith('data:')) {
                const parts = data.split(',');
                if (parts.length > 1) {
                    base64Data = parts[1];
                }
            }

            const byteCharacters = atob(base64Data);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const binaryData = new Uint8Array(byteNumbers);
            const blob = new Blob([binaryData], { type: 'image/png' });

            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName.replace(/\.(drawio|dio|xml)$/i, '.png');
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

        } catch (error) {
            console.error('Error downloading PNG:', error);
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
                    onClick={handleSaveAsPng}
                    disabled={disabled || isExporting}
                    title={t('Save as PNG')}>
                    {isExporting ? <LoaderIcon /> : 'PNG'}
                </button>

                <button
                    className="control-button dropdown-toggle"
                    onClick={toggleDropdown}
                    disabled={disabled || isExporting}
                    title={t('PNG Export Options')}>
                    <ChevronDownIcon />
                </button>
            </div>

            <PositionedDropdown
                isOpen={isDropdownOpen}
                triggerElement={dropdownRef.current?.querySelector('.drawio-export-button-group') as HTMLElement}
                className="drawio-png-dropdown">
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
                                setProperty('drawio-png-margin', value);
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
                                setProperty('drawio-png-scale', value);
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
                                setProperty('drawio-png-transparent', e.target.checked);
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
                                    setProperty('drawio-png-background', e.target.value);
                                }}
                            />
                        </label>
                    </div>
                )}

                <div className="dropdown-option">
                    <button
                        className="dropdown-button"
                        onClick={handleDownloadAsPng}
                        disabled={disabled || isExporting}>
                        {t('Download PNG')}
                    </button>
                </div>
            </PositionedDropdown>
        </div>
    );
};

export default DrawioPngExportButton;