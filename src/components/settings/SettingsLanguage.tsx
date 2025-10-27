// src/components/settings/SettingsLanguage.tsx
import { t } from "@/i18n";
import type React from 'react';
import { useState, useRef, useEffect } from 'react';

import type { Setting } from '../../contexts/SettingsContext';
import { useLanguage } from '../../hooks/useLanguage';
import { useSettings } from '../../hooks/useSettings';
import { ChevronUpIcon, ChevronDownIcon } from '../common/Icons';

interface SettingsLanguageProps {
  setting: Setting;
}

const SettingsLanguage: React.FC<SettingsLanguageProps> = ({ setting }) => {
  const { currentLanguage, availableLanguages, changeLanguage } = useLanguage();
  const { updateSetting } = useSettings();
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchQuery('');
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen]);

  const getCoverageColor = (coverage: number) => {
    if (coverage >= 90) return '#28a745';
    if (coverage >= 70) return '#ffc107';
    return '#dc3545';
  };

  const filteredLanguages = availableLanguages.filter((lang) =>
  lang.nativeName.toLowerCase().includes(searchQuery.toLowerCase()) ||
  lang.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
  lang.code.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSelect = (code: string) => {
    updateSetting(setting.id, code);
    changeLanguage(code);
    setIsOpen(false);
    setSearchQuery('');
  };

  if (!currentLanguage) return null;

  return (
    <div className="settings-language">
            <div className="language-selector-wrapper">
                <label>{setting.label}</label>
                <div className="searchable-language-dropdown" ref={dropdownRef}>
                    <div
            className="dropdown-trigger"
            onClick={() => setIsOpen(!isOpen)}>

                        <div className="selected-language">
                            <span className="language-text">
                                {currentLanguage.nativeName} ({currentLanguage.name})
                            </span>
                            <div className="coverage-inline">
                                <div className="coverage-bar-small">
                                    <div
                    className="coverage-fill-small"
                    style={{
                      width: `${currentLanguage.coverage}%`,
                      backgroundColor: getCoverageColor(currentLanguage.coverage)
                    }} />

                                </div>
                                <span
                  className="coverage-percentage-small"
                  style={{ color: getCoverageColor(currentLanguage.coverage) }}>

                                    {currentLanguage.coverage}%
                                </span>
                            </div>
                        </div>
                        <span className="dropdown-arrow">{isOpen ? <ChevronUpIcon /> : <ChevronDownIcon />}</span>
                    </div>

                    {isOpen &&
          <div className="dropdown-menu">
                            <div className="dropdown-search">
                                <input
                ref={searchInputRef}
                type="text"
                placeholder={t('Search languages...')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="dropdown-search-input" />

                            </div>
                            <div className="dropdown-options">
                                {filteredLanguages.map((lang) =>
              <div
                key={lang.code}
                className={`dropdown-option ${currentLanguage.code === lang.code ? 'selected' : ''}`}
                onClick={() => handleSelect(lang.code)}>

                                        <div className="option-header">
                                            <span className="option-name">
                                                {lang.nativeName} ({lang.name})
                                            </span>
                                            <span
                    className="option-coverage"
                    style={{ color: getCoverageColor(lang.coverage) }}>

                                                {lang.coverage}%
                                            </span>
                                        </div>
                                        <div className="coverage-bar-option">
                                            <div
                    className="coverage-fill-option"
                    style={{
                      width: `${lang.coverage}%`,
                      backgroundColor: getCoverageColor(lang.coverage)
                    }} />

                                        </div>
                                        <div className="option-details">
                                            {lang.translatedKeys} / {lang.totalKeys}{t('keys')}
                </div>
                                    </div>
              )}
                                {filteredLanguages.length === 0 &&
              <div className="no-options">{t('No languages found')}</div>
              }
                            </div>
                        </div>
          }
                </div>
                {setting.description &&
        <div className="setting-description">{setting.description}</div>
        }
            </div>
        </div>);

};

export default SettingsLanguage;