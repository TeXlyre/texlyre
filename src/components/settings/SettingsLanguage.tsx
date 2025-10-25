// src/components/settings/SettingsLanguage.tsx
import type React from 'react';

import type { Setting } from '../../contexts/SettingsContext';
import { useLanguage } from '../../hooks/useLanguage';
import { useSettings } from '../../hooks/useSettings';

interface SettingsLanguageProps {
    setting: Setting;
}

const SettingsLanguage: React.FC<SettingsLanguageProps> = ({ setting }) => {
    const { currentLanguage, availableLanguages, changeLanguage } = useLanguage();
    const { updateSetting } = useSettings();

    const getCoverageColor = (coverage: number) => {
        if (coverage >= 90) return '#28a745';
        if (coverage >= 70) return '#ffc107';
        return '#dc3545';
    };

    return (
        <div className="settings-language">
            <div className="language-selector-wrapper">
                <label>{setting.label}</label>
                <select
                    value={setting.value as string || 'en'}
                    onChange={(e) => {
                        updateSetting(setting.id, e.target.value);
                        changeLanguage(e.target.value);
                    }}
                    className="language-select"
                >
                    {availableLanguages.map(lang => (
                        <option key={lang.code} value={lang.code}>
                            {lang.nativeName} ({lang.name})
                        </option>
                    ))}
                </select>
                {setting.description && (
                    <div className="setting-description">{setting.description}</div>
                )}
            </div>

            <div className="language-coverage">
                <h4>Translation Coverage</h4>
                <div className="coverage-list">
                    {availableLanguages.map(lang => (
                        <div key={lang.code} className="coverage-item">
                            <div className="coverage-header">
                                <span className="language-name">
                                    {lang.nativeName}
                                    {currentLanguage?.code === lang.code && (
                                        <span className="current-badge"> (Current)</span>
                                    )}
                                </span>
                                <span className="coverage-percentage" style={{ color: getCoverageColor(lang.coverage) }}>
                                    {lang.coverage}%
                                </span>
                            </div>
                            <div className="coverage-bar">
                                <div
                                    className="coverage-fill"
                                    style={{
                                        width: `${lang.coverage}%`,
                                        backgroundColor: getCoverageColor(lang.coverage)
                                    }}
                                />
                            </div>
                            <div className="coverage-details">
                                {lang.translatedKeys} / {lang.totalKeys} keys translated
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default SettingsLanguage;