// src/components/settings/LanguageToggleButton.tsx
import { t } from '@/i18n';
import type React from 'react';
import { useState, useRef, useEffect } from 'react';

import { useLanguage } from '../../hooks/useLanguage';
import { useSettings } from '../../hooks/useSettings';
import { LanguageIcon } from '../common/Icons';

interface LanguageToggleButtonProps {
    className?: string;
}

const LanguageToggleButton: React.FC<LanguageToggleButtonProps> = ({ className = '' }) => {
    const { currentLanguage, availableLanguages, changeLanguage } = useLanguage();
    const { updateSetting } = useSettings();
    const [isOpen, setIsOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [focusedIndex, setFocusedIndex] = useState(-1);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const optionRefs = useRef<(HTMLDivElement | null)[]>([]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
                setSearchQuery('');
                setFocusedIndex(-1);
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

    useEffect(() => {
        if (focusedIndex >= 0 && optionRefs.current[focusedIndex]) {
            optionRefs.current[focusedIndex]?.scrollIntoView({ block: 'nearest' });
        }
    }, [focusedIndex]);

    const filteredLanguages = availableLanguages.filter((lang) =>
        lang.nativeName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        lang.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        lang.code.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const handleSelect = (code: string) => {
        updateSetting('language', code);
        changeLanguage(code);
        setIsOpen(false);
        setSearchQuery('');
        setFocusedIndex(-1);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (!isOpen) return;

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                setFocusedIndex((prev) =>
                    prev < filteredLanguages.length - 1 ? prev + 1 : prev
                );
                break;
            case 'ArrowUp':
                e.preventDefault();
                setFocusedIndex((prev) => (prev > 0 ? prev - 1 : -1));
                if (focusedIndex === 0) {
                    searchInputRef.current?.focus();
                }
                break;
            case 'Enter':
                e.preventDefault();
                if (focusedIndex >= 0 && filteredLanguages[focusedIndex]) {
                    handleSelect(filteredLanguages[focusedIndex].code);
                }
                break;
            case 'Escape':
                setIsOpen(false);
                setSearchQuery('');
                setFocusedIndex(-1);
                break;
        }
    };

    if (!currentLanguage) return null;

    return (
        <div className="language-toggle-container" ref={dropdownRef} onKeyDown={handleKeyDown}>
            <button
                type="button"
                className={className}
                onClick={() => setIsOpen(!isOpen)}
                title={`${currentLanguage.nativeName} (${currentLanguage.name})`}>
                <LanguageIcon />
            </button>

            {isOpen && (
                <div className="language-dropdown-menu">
                    <div className="dropdown-search">
                        <input
                            ref={searchInputRef}
                            type="text"
                            placeholder={t("Search languages...")}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="dropdown-search-input"
                        />
                    </div>
                    <div className="dropdown-options">
                        {filteredLanguages.map((lang, index) => (
                            <div
                                key={lang.code}
                                ref={(el) => (optionRefs.current[index] = el)}
                                className={`dropdown-option ${currentLanguage.code === lang.code ? 'selected' : ''} ${focusedIndex === index ? 'focused' : ''}`}
                                onClick={() => handleSelect(lang.code)}
                                tabIndex={0}
                                role="option"
                                aria-selected={currentLanguage.code === lang.code}>
                                <div className="option-header">
                                    <span className="option-name">
                                        {lang.nativeName} ({lang.name})
                                    </span>
                                </div>
                            </div>
                        ))}
                        {filteredLanguages.length === 0 && (
                            <div className="no-options">{t("No languages found")}</div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default LanguageToggleButton;