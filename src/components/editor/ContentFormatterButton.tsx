// src/components/editor/ContentFormatterButton.tsx
import { t } from "@/i18n";
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

  useEffect(() => {
    const handleRequestFormat = async (event: Event) => {
      const customEvent = event as CustomEvent;
      const { content, contentType: requestedType } = customEvent.detail;

      if (requestedType === contentType && content) {
        const formatted = contentType === 'latex' ?
          await formatLatex(content, latexOptions) :
          await formatTypst(content, typstOptions);

        if (formatted) {
          onFormat(formatted);
        }
      }
    };

    document.addEventListener('request-format', handleRequestFormat);

    return () => {
      document.removeEventListener('request-format', handleRequestFormat);
    };
  }, [contentType, formatLatex, formatTypst, latexOptions, typstOptions, onFormat]);

  const handleFormat = async () => {
    if (disabled || isFormatting) return;

    const currentContent = getCurrentContent();
    if (!currentContent.trim()) return;

    const formatted = contentType === 'latex' ?
      await formatLatex(currentContent, latexOptions) :
      await formatTypst(currentContent, typstOptions);

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
          title={t('Format Content (Ctrl+Shift+I)')}>

          {isFormatting ? <LoaderIcon /> : <TextFormatterIcon />}
        </button>

        <button
          className="control-button dropdown-toggle"
          onClick={toggleDropdown}
          disabled={disabled || isFormatting}
          title={t('Format Options')}>

          <ChevronDownIcon />
        </button>
      </div>

      {isDropdownOpen && contentType === 'latex' &&
        <div className="formatter-dropdown">
          <div className="format-option">
            <label>
              <input
                type="checkbox"
                checked={latexOptions.wrap}
                onChange={(e) => setLatexOptions({
                  ...latexOptions,
                  wrap: e.target.checked
                })} />{t('Wrap lines')}


            </label>
          </div>

          {latexOptions.wrap &&
            <div className="format-option">
              <label>{t('Wrap length:')}

                <input
                  type="number"
                  min="40"
                  max="120"
                  value={latexOptions.wraplen}
                  onChange={(e) => setLatexOptions({
                    ...latexOptions,
                    wraplen: parseInt(e.target.value, 10)
                  })} />

              </label>
            </div>
          }

          <div className="format-option">
            <label>{t('Tab size:')}

              <input
                type="number"
                min="1"
                max="8"
                value={latexOptions.tabsize}
                onChange={(e) => setLatexOptions({
                  ...latexOptions,
                  tabsize: parseInt(e.target.value, 10)
                })} />

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
                })} />{t('Use tabs instead of spaces')}


            </label>
          </div>
        </div>
      }

      {isDropdownOpen && contentType === 'typst' &&
        <div className="formatter-dropdown">
          <div className="format-option">
            <label>{t('Line width:')}

              <input
                type="number"
                min="40"
                max="120"
                value={typstOptions.lineWidth}
                onChange={(e) => setTypstOptions({
                  ...typstOptions,
                  lineWidth: parseInt(e.target.value, 10)
                })} />

            </label>
          </div>

          <div className="format-option">
            <label>{t('Indent width:')}

              <input
                type="number"
                min="1"
                max="8"
                value={typstOptions.indentWidth}
                onChange={(e) => setTypstOptions({
                  ...typstOptions,
                  indentWidth: parseInt(e.target.value, 10)
                })} />

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
                })} />{t('Reorder import items alphabetically')}


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
                })} />{t('Wrap text in markup')}


            </label>
          </div>
        </div>
      }
    </div>);

};

export default ContentFormatterButton;