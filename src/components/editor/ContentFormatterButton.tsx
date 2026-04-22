// src/components/editor/ContentFormatterButton.tsx
import { t } from '@/i18n';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';

import PositionedDropdown from '../common/PositionedDropdown';
import { NumberInput } from '../common/NumberInput';
import { useContentFormatter } from '../../hooks/useContentFormatter';
import { ChevronDownIcon, LoaderIcon, TextFormatterIcon } from '../common/Icons';

interface ContentFormatterButtonProps {
  className?: string;
  onFormat: (formattedContent: string) => void;
  getCurrentContent: () => string;
  contentType: 'latex' | 'typst' | string;
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
      const target = event.target as Node;

      if (dropdownRef.current && !dropdownRef.current.contains(target)) {
        const portaledDropdown = document.querySelector('.formatter-dropdown');
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

      {contentType === 'latex' &&
        <PositionedDropdown
          isOpen={isDropdownOpen}
          triggerElement={dropdownRef.current?.querySelector('.formatter-button-group') as HTMLElement}
          className="formatter-dropdown">
          <div className="dropdown-option">
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
            <div className="dropdown-option">
              <label>{t('Wrap length:')}

                <NumberInput
                  min={40}
                  max={120}
                  integer
                  value={latexOptions.wraplen}
                  onChange={(wraplen) => setLatexOptions({ ...latexOptions, wraplen })}
                />

              </label>
            </div>
          }

          <div className="dropdown-option">
            <label>{t('Tab size:')}

              <NumberInput
                min={1}
                max={31}
                integer
                value={latexOptions.tabsize}
                onChange={(tabsize) => setLatexOptions({ ...latexOptions, tabsize })}
              />

            </label>
          </div>

          <div className="dropdown-option">
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
        </PositionedDropdown>
      }

      {contentType === 'typst' &&
        <PositionedDropdown
          isOpen={isDropdownOpen}
          triggerElement={dropdownRef.current?.querySelector('.formatter-button-group') as HTMLElement}
          className="formatter-dropdown">
          <div className="dropdown-option">
            <label>{t('Line width:')}

              <NumberInput
                min={40}
                max={120}
                integer
                value={typstOptions.lineWidth}
                onChange={(lineWidth) => setTypstOptions({ ...typstOptions, lineWidth })}
              />

            </label>
          </div>

          <div className="dropdown-option">
            <label>{t('Indent width:')}

              <NumberInput
                min={1}
                max={8}
                integer
                value={typstOptions.indentWidth}
                onChange={(indentWidth) => setTypstOptions({ ...typstOptions, indentWidth })}
              />

            </label>
          </div>

          <div className="dropdown-option">
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

          <div className="dropdown-option">
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
        </PositionedDropdown>
      }
    </div>);

};

export default ContentFormatterButton;