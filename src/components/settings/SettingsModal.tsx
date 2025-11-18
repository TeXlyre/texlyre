// src/components/settings/SettingsModal.tsx
import { t } from '@/i18n';
import type React from 'react';
import { useEffect, useState } from 'react';

import { useSettings } from '../../hooks/useSettings';
import { SettingsIcon } from '../common/Icons';
import Modal from '../common/Modal';
import SettingControl from './SettingControl';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialCategory?: string;
  initialSubcategory?: string;
}

const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  initialCategory,
  initialSubcategory
}) => {
  const { getCategories, getSettingsByCategory, searchSettings, hasUnsavedChanges, needsRefresh } =
    useSettings();
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredData, setFilteredData] = useState<{
    categories: { category: string; subcategories: string[]; }[];
    allSettings: any[];
  }>({ categories: [], allSettings: [] });

  const [activeCategory, setActiveCategory] = useState('');
  const [activeSubcategory, setActiveSubcategory] = useState<
    string | undefined>(
  );

  const hasInitialValues = Boolean(initialCategory);

  useEffect(() => {
    if (hasInitialValues && !searchQuery) {
      const allCategories = getCategories();
      setFilteredData({ categories: allCategories, allSettings: [] });

      if (
        initialCategory &&
        allCategories.some((c) => c.category === initialCategory)) {
        setActiveCategory(initialCategory);
        const targetCategory = allCategories.find(
          (c) => c.category === initialCategory
        );
        if (targetCategory) {
          if (
            initialSubcategory &&
            targetCategory.subcategories.includes(initialSubcategory)) {
            setActiveSubcategory(initialSubcategory);
          } else {
            setActiveSubcategory(targetCategory.subcategories[0]);
          }
        }
      }
    } else {
      const result = searchSettings(searchQuery);
      setFilteredData(result);

      if (result.categories.length > 0) {
        if (!result.categories.some((c) => c.category === activeCategory)) {
          setActiveCategory(result.categories[0].category);
          setActiveSubcategory(result.categories[0].subcategories[0]);
        } else if (activeSubcategory) {
          const currentCategory = result.categories.find(
            (c) => c.category === activeCategory
          );
          if (
            currentCategory &&
            !currentCategory.subcategories.includes(activeSubcategory)) {
            setActiveSubcategory(currentCategory.subcategories[0]);
          }
        }
      }
    }
  }, [
    searchQuery,
    initialCategory,
    initialSubcategory,
    activeCategory,
    activeSubcategory,
    hasInitialValues,
    getCategories,
    searchSettings]
  );

  const highlightText = (text: string, query: string) => {
    if (!query.trim()) return text;

    const regex = new RegExp(
      `(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`,
      'gi'
    );
    const parts = text.split(regex);

    return parts.map((part, index) =>
      regex.test(part) ?
        <mark key={index} className="search-highlight">
          {part}
        </mark> :

        part

    );
  };

  const renderTitle = () => {
    if (!searchQuery) {
      return `${activeCategory}${activeSubcategory ? ` - ${activeSubcategory}` : ''}`;
    }

    return (
      <>
        {highlightText(activeCategory, searchQuery)}
        {activeSubcategory &&
          <>
            {' - '}
            {highlightText(activeSubcategory, searchQuery)}
          </>
        }
      </>);

  };

  const settings = getSettingsByCategory(activeCategory, activeSubcategory);

  if (filteredData.categories.length === 0 && !searchQuery) {
    return (
      <Modal isOpen={isOpen} onClose={onClose} title={t('Settings')} size="large">
        <div className="settings-empty-state">
          <p>{t('No settings are currently available.')}</p>
        </div>
      </Modal>);

  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('Settings')}
      icon={SettingsIcon}
      size="large">

      <div className="settings-container">
        <div className="settings-sidebar">
          {!hasInitialValues &&
            <div className="settings-search">
              <input
                type="text"
                placeholder={t('Search settings...')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="search-input" />

              {searchQuery &&
                <button
                  className="clear-search-button"
                  onClick={() => setSearchQuery('')}>

                  ×
                </button>
              }
            </div>
          }

          {filteredData.categories.map(({ category, subcategories }) =>
            <div key={category} className="settings-category">
              <div
                className={`category-item ${activeCategory === category ? 'active' : ''}`}
                onClick={() => {
                  setActiveCategory(category);
                  setActiveSubcategory(subcategories[0]);
                }}>

                {highlightText(category, searchQuery)}
              </div>
              {activeCategory === category && subcategories.length > 0 &&
                <div className="subcategories">
                  {subcategories.map((subcategory) =>
                    <div
                      key={subcategory}
                      className={`subcategory-item ${activeSubcategory === subcategory ? 'active' : ''}`}
                      onClick={() => setActiveSubcategory(subcategory)}>

                      {highlightText(subcategory, searchQuery)}
                    </div>
                  )}
                </div>
              }
            </div>
          )}

          {filteredData.categories.length === 0 && searchQuery &&
            <div className="no-results">{t('No settings found matching "')}
              {searchQuery}"
            </div>
          }
        </div>

        <div className="settings-content">
          <h3>{renderTitle()}</h3>
          <div className="settings-group">
            {settings.map((setting) =>
              <div key={setting.id} className="setting-with-highlight">
                <SettingControl
                  setting={{
                    ...setting,
                    label: searchQuery ?
                      highlightText(setting.label, searchQuery) as string :
                      setting.label,
                    description: (setting.description && searchQuery ?
                      highlightText(
                        setting.description,
                        searchQuery
                      ) as string :
                      setting.description) as string
                  }} />

              </div>
            )}
            {settings.length === 0 &&
              <div className="no-settings">{t('No settings available in this category.')}

              </div>
            }
          </div>
        </div>
        {hasUnsavedChanges &&
          <div className="save-indicator">{t('Settings Saved')}

          </div>
        }
        {needsRefresh &&
          <div className="refresh-indicator">{t('Page refresh required')}

          </div>
        }
      </div>
    </Modal>);

};

export default SettingsModal;