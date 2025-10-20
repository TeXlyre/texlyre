// src/components/editor/ContentFormatterButton.tsx
import type React from 'react';
import { useEffect, useRef, useState } from 'react';

import { ChevronDownIcon, LoaderIcon, TextFormatterIcon } from '../common/Icons';
import { useContentFormatter } from '../../hooks/useContentFormatter';

interface ContentFormatterButtonProps {
    className?: string;
    onFormat: (formattedContent: string) => void;
    getCurrentContent: () => string;
    contentType: 'latex' | 'typst';
    disabled?: boolean;
}

const ContentFormatterButton: React.FC<ContentFormatterButtonProps> = ({
    className = '',
    onFormat,
    getCurrentContent,
    contentType,
    disabled = false
}) => {
    const {
        isFormatting,
        formatLatex,
        formatTypst,
        latexOptions,
        setLatexOptions,
        typstOptions,
        setTypstOptions
    } = useContentFormatter();
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsDropdownOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleFormat = async () => {
        if (disabled || isFormatting) return;

        const currentContent = getCurrentContent();
        if (!currentContent.trim()) return;

        const formatted = contentType === 'latex'
            ? await formatLatex(currentContent, latexOptions)
            : await formatTypst(currentContent, typstOptions);

        if (formatted) {
            onFormat(formatted);
        }
    };

    const toggleDropdown = (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsDropdownOpen(!isDropdownOpen);
    };

    return (
        <div className={`formatter-button-container ${className}`} ref={dropdownRef}>
            <div className="formatter-button-group">
                <button
                    className={`control-button format-button ${isFormatting ? 'formatting' : ''}`}
                    onClick={handleFormat}
                    disabled={disabled || isFormatting}
                    title="Format Content"
                >
                    {isFormatting ? <LoaderIcon /> : <TextFormatterIcon />}
                </button>

                <button
                    className="control-button dropdown-toggle"
                    onClick={toggleDropdown}
                    disabled={disabled || isFormatting}
                    title="Format Options"
                >
                    <ChevronDownIcon />
                </button>
            </div>

            {isDropdownOpen && contentType === 'latex' && (
                <div className="formatter-dropdown">
                    <div className="format-note warning-message">
                        <p>⚠️ Tex-Fmt is <b>experimental</b> and may not preserve all LaTeX constructs (e.g., <code>\verb</code> commands).</p>
                    </div>
                    <div className="format-option">
                        <label>
                            <input
                                type="checkbox"
                                checked={latexOptions.wrap}
                                onChange={(e) => setLatexOptions({
                                    ...latexOptions,
                                    wrap: e.target.checked
                                })}
                            />
                            Wrap lines
                        </label>
                    </div>

                    {latexOptions.wrap && (
                        <div className="format-option">
                            <label>
                                Wrap length:
                                <input
                                    type="number"
                                    min="40"
                                    max="120"
                                    value={latexOptions.wraplen}
                                    onChange={(e) => setLatexOptions({
                                        ...latexOptions,
                                        wraplen: parseInt(e.target.value, 10)
                                    })}
                                />
                            </label>
                        </div>
                    )}

                    <div className="format-option">
                        <label>
                            Tab size:
                            <input
                                type="number"
                                min="1"
                                max="8"
                                value={latexOptions.tabsize}
                                onChange={(e) => setLatexOptions({
                                    ...latexOptions,
                                    tabsize: parseInt(e.target.value, 10)
                                })}
                            />
                        </label>
                    </div>

                    <div className="format-option">
                        <label>
                            <input
                                type="checkbox"
                                checked={latexOptions.usetabs}
                                onChange={(e) => setLatexOptions({
                                    ...latexOptions,
                                    usetabs: e.target.checked
                                })}
                            />
                            Use tabs instead of spaces
                        </label>
                    </div>
                </div>
            )}

            {isDropdownOpen && contentType === 'typst' && (
                <div className="formatter-dropdown">
                    <div className="format-option">
                        <label>
                            Line width:
                            <input
                                type="number"
                                min="40"
                                max="120"
                                value={typstOptions.lineWidth}
                                onChange={(e) => setTypstOptions({
                                    ...typstOptions,
                                    lineWidth: parseInt(e.target.value, 10)
                                })}
                            />
                        </label>
                    </div>

                    <div className="format-option">
                        <label>
                            Indent width:
                            <input
                                type="number"
                                min="1"
                                max="8"
                                value={typstOptions.indentWidth}
                                onChange={(e) => setTypstOptions({
                                    ...typstOptions,
                                    indentWidth: parseInt(e.target.value, 10)
                                })}
                            />
                        </label>
                    </div>

                    <div className="format-option">
                        <label>
                            <input
                                type="checkbox"
                                checked={typstOptions.reorderImportItems}
                                onChange={(e) => setTypstOptions({
                                    ...typstOptions,
                                    reorderImportItems: e.target.checked
                                })}
                            />
                            Reorder import items alphabetically
                        </label>
                    </div>

                    <div className="format-option">
                        <label>
                            <input
                                type="checkbox"
                                checked={typstOptions.wrapText}
                                onChange={(e) => setTypstOptions({
                                    ...typstOptions,
                                    wrapText: e.target.checked
                                })}
                            />
                            Wrap text in markup
                        </label>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ContentFormatterButton;