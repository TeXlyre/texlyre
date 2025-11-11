// src/components/project/TemplateImportModal.tsx
import { t } from '@/i18n';
import type React from 'react';
import { useEffect, useState, useRef } from 'react';

import { useSettings } from '../../hooks/useSettings';
import { FolderIcon, ImportIcon, TemplatesIcon, SettingsIcon } from '../common/Icons';
import Modal from '../common/Modal';
import SettingsModal from '../settings/SettingsModal';
import TypesetterInfo from '../common/TypesetterInfo';

interface TemplateProject {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  downloadUrl: string;
  previewImage?: string;
  author?: string;
  version?: string;
  lastUpdated: string;
  type?: 'latex' | 'typst';
}

interface TemplateCategory {
  id: string;
  name: string;
  description: string;
  templates: TemplateProject[];
}

interface TemplateImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTemplateSelected: (template: TemplateProject) => void;
}

const TemplateImportModal: React.FC<TemplateImportModalProps> = ({
  isOpen,
  onClose,
  onTemplateSelected
}) => {
  const { registerSetting, getSetting } = useSettings();
  const settingsRegistered = useRef(false);
  const [showSettings, setShowSettings] = useState(false);

  const [categories, setCategories] = useState<TemplateCategory[]>([]);
  const [allTemplates, setAllTemplates] = useState<TemplateProject[]>([]);
  const [filteredTemplates, setFilteredTemplates] = useState<TemplateProject[]>([]);
  const [paginatedTemplates, setPaginatedTemplates] = useState<TemplateProject[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateProject | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadedImages, setLoadedImages] = useState<Set<string>>(new Set());

  const [templatesApiUrl, setTemplatesApiUrl] = useState('https://texlyre.github.io/texlyre-templates/api/templates.json');
  const [templatesPerPage, setTemplatesPerPage] = useState(12);

  useEffect(() => {
    if (settingsRegistered.current) return;
    settingsRegistered.current = true;

    const initialUrl = getSetting('templates-api-url')?.value as string ??
      'https://texlyre.github.io/texlyre-templates/api/templates.json';
    const initialPerPage = getSetting('templates-per-page')?.value as number ?? 12;

    setTemplatesApiUrl(initialUrl);
    setTemplatesPerPage(initialPerPage);

    registerSetting({
      id: 'templates-api-url',
      category: t("Templates"),
      subcategory: t("Template Gallery"),
      type: 'text',
      label: t("Template gallery API URL"),
      description: t("URL endpoint for fetching project templates"),
      defaultValue: initialUrl,
      onChange: (value) => {
        setTemplatesApiUrl(value as string);
      }
    });

    registerSetting({
      id: 'templates-per-page',
      category: t("Templates"),
      subcategory: t("Template Gallery"),
      type: 'number',
      label: t("Templates per page"),
      description: t("Number of templates to display per page"),
      defaultValue: 12,
      min: 6,
      max: 48,
      onChange: (value) => {
        setTemplatesPerPage(value as number);
      }
    });
  }, [registerSetting, getSetting]);

  useEffect(() => {
    if (isOpen) {
      loadTemplates();
    }
  }, [isOpen]);

  useEffect(() => {
    filterAndPaginateTemplates();
  }, [allTemplates, selectedCategory, selectedType, searchQuery, currentPage, templatesPerPage]);

  useEffect(() => {
    paginatedTemplates.forEach((template) => {
      if (template.previewImage && !loadedImages.has(template.id)) {
        loadImage(template.id, template.previewImage);
      }
    });
  }, [paginatedTemplates]);

  const loadTemplates = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch(templatesApiUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch templates: ${response.statusText}`);
      }

      const data = await response.json();
      setCategories(data.categories || []);

      const allTemplatesFlat = data.categories?.flatMap((cat: any) =>
        cat.templates.map((template: any) => ({
          ...template,
          type: template.type || 'latex'
        }))
      ) || [];
      setAllTemplates(allTemplatesFlat);
    } catch (error) {
      console.error('Error loading templates:', error);
      setError(error instanceof Error ? error.message : 'Failed to load templates');
    } finally {
      setIsLoading(false);
    }
  };

  const filterAndPaginateTemplates = () => {
    let filtered: TemplateProject[] = [];

    if (selectedCategory === 'all') {
      filtered = allTemplates;
    } else {
      filtered = allTemplates.filter((template) => template.category === selectedCategory);
    }

    if (selectedType !== 'all') {
      filtered = filtered.filter((template) => (template.type || 'latex') === selectedType);
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((template) =>
        template.name.toLowerCase().includes(query) ||
        template.description.toLowerCase().includes(query) ||
        template.tags.some((tag) => tag.toLowerCase().includes(query))
      );
    }

    setFilteredTemplates(filtered);
    setTotalPages(Math.ceil(filtered.length / templatesPerPage));

    const startIndex = (currentPage - 1) * templatesPerPage;
    const endIndex = startIndex + templatesPerPage;
    setPaginatedTemplates(filtered.slice(startIndex, endIndex));
  };

  const handleTemplateSelect = (template: TemplateProject) => {
    setSelectedTemplate(template);
    if (template.previewImage) {
      loadImage(template.id, template.previewImage);
    }
  };

  const loadImage = (templateId: string, imageUrl: string) => {
    if (loadedImages.has(templateId)) return;

    const img = new Image();
    img.onload = () => {
      setLoadedImages((prev) => new Set(prev).add(templateId));
    };
    img.onerror = () => {
      console.warn(`Failed to load image for template ${templateId}`);
    };
    img.src = imageUrl;
  };

  const handleTemplateConfirm = () => {
    if (selectedTemplate) {
      onTemplateSelected(selectedTemplate);
    }
  };

  const handlePageChange = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setCurrentPage(1);
  };

  const handleCategoryChange = (value: string) => {
    setSelectedCategory(value);
    setCurrentPage(1);
  };

  const handleTypeChange = (value: string) => {
    setSelectedType(value);
    setCurrentPage(1);
  };

  const handleClose = () => {
    setSearchQuery('');
    setSelectedCategory('all');
    setSelectedType('all');
    setSelectedTemplate(null);
    setCurrentPage(1);
    setAllTemplates([]);
    setFilteredTemplates([]);
    setPaginatedTemplates([]);
    setLoadedImages(new Set());
    setError(null);
    onClose();
  };

  const renderPaginationControls = () => {
    if (totalPages <= 1) return null;

    const getVisiblePages = () => {
      const pages = [];
      const maxVisible = 5;
      let start = Math.max(1, currentPage - Math.floor(maxVisible / 2));
      const end = Math.min(totalPages, start + maxVisible - 1);

      if (end - start + 1 < maxVisible) {
        start = Math.max(1, end - maxVisible + 1);
      }

      for (let i = start; i <= end; i++) {
        pages.push(i);
      }
      return pages;
    };

    const startItem = (currentPage - 1) * templatesPerPage + 1;
    const endItem = Math.min(currentPage * templatesPerPage, filteredTemplates.length);

    return (
      <div className="template-pagination">
        <div className="pagination-info">
          {t('Showing {startItem}-{endItem} of {count} template', {
            startItem,
            endItem,
            count: filteredTemplates.length
          })}
        </div>

        <div className="pagination-controls">
          <button
            className="pagination-button"
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={currentPage === 1 || isLoading}>{t('Previous')}


          </button>

          {currentPage > 2 &&
            <>
              <button
                className="pagination-button"
                onClick={() => handlePageChange(1)}
                disabled={isLoading}>

                1
              </button>
              {currentPage > 3 && <span className="pagination-ellipsis">{t('...')}</span>}
            </>
          }

          {getVisiblePages().map((page) =>
            <button
              key={page}
              className={`pagination-button ${page === currentPage ? 'active' : ''}`}
              onClick={() => handlePageChange(page)}
              disabled={isLoading}>

              {page}
            </button>
          )}

          {currentPage < totalPages - 1 &&
            <>
              {currentPage < totalPages - 2 && <span className="pagination-ellipsis">{t('...')}</span>}
              <button
                className="pagination-button"
                onClick={() => handlePageChange(totalPages)}
                disabled={isLoading}>

                {totalPages}
              </button>
            </>
          }

          <button
            className="pagination-button"
            onClick={() => handlePageChange(currentPage + 1)}
            disabled={currentPage === totalPages || isLoading}>{t('Next')}


          </button>
        </div>
      </div>);

  };

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={handleClose}
        title={t('Import Template')}
        icon={TemplatesIcon}
        size="large"
        headerActions={
          <button
            className="modal-close-button"
            onClick={() => setShowSettings(true)}
            title={t('File System Settings')}>

            <SettingsIcon />
          </button>
        }>

        <div className="template-import-modal">
          {error &&
            <div className="error-message" style={{ marginBottom: '1rem' }}>
              {error}
            </div>
          }

          <div className="template-search-controls">
            <div className="template-search-row">
              <input
                type="text"
                placeholder={t('Search templates...')}
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="template-search-input"
                disabled={isLoading} />


              <select
                value={selectedCategory}
                onChange={(e) => handleCategoryChange(e.target.value)}
                className="template-category-select"
                disabled={isLoading}>

                <option value="all">{t('All Categories')}</option>
                {categories.map((category) =>
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                )}
              </select>

              <select
                value={selectedType}
                onChange={(e) => handleTypeChange(e.target.value)}
                className="template-type-select"
                disabled={isLoading}>

                <option value="all">{t('All Types')}</option>
                <option value="latex">{t('LaTeX')}</option>
                <option value="typst">{t('Typst')}</option>
              </select>
            </div>
          </div>

          {isLoading ?
            <div className="template-loading">
              <div className="loading-spinner" />
              <p>{t('Loading templates...')}</p>
            </div> :

            <div className="template-list">
              {filteredTemplates.length === 0 ?
                <div className="no-templates">
                  <p>{t('No templates found matching your criteria.')}</p>
                </div> :
                selectedTemplate ?
                  <div className="template-detail-view">
                    <div className="template-detail-header">
                      <button
                        className="back-button"
                        onClick={() => setSelectedTemplate(null)}>{t('\u2190 Back to Templates')}


                      </button>
                      <h3>{selectedTemplate.name}</h3>
                    </div>

                    <div className="template-detail-content">
                      <div className="template-detail-preview">
                        {selectedTemplate.previewImage ?
                          loadedImages.has(selectedTemplate.id) ?
                            <div style={{ position: 'relative' }}>
                              <img
                                src={selectedTemplate.previewImage}
                                alt={`${selectedTemplate.name} preview`}
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display = 'none';
                                }} />

                              <div className="template-type-info">
                                <TypesetterInfo type={selectedTemplate.type || 'latex'} />
                              </div>
                            </div> :

                            <div className="template-preview-loading">
                              <div className="loading-spinner" />
                              <span>{t('Loading preview...')}</span>
                            </div> :


                          <div className="template-preview-placeholder">
                            <FolderIcon />
                            <span>{t('No preview available')}</span>
                          </div>
                        }
                      </div>

                      <div className="template-detail-info">
                        <div className="template-detail-meta">
                          <span className="template-category">{selectedTemplate.category}</span>
                          {selectedTemplate.version &&
                            <span className="template-version">v{selectedTemplate.version}</span>
                          }
                        </div>

                        <p className="template-detail-description">{selectedTemplate.description}</p>

                        {selectedTemplate.tags.length > 0 &&
                          <div className="template-tags">
                            {selectedTemplate.tags.map((tag) =>
                              <span key={tag} className="template-tag">{tag}</span>
                            )}
                          </div>
                        }

                        <div className="template-detail-footer">
                          {selectedTemplate.author &&
                            <span className="template-author">{t('by')}{selectedTemplate.author}</span>
                          }
                          <span className="template-updated">{t('Updated')}
                            {new Date(selectedTemplate.lastUpdated).toLocaleDateString()}
                          </span>
                        </div>

                        <div className="template-actions">
                          <button
                            className="button secondary"
                            onClick={() => setSelectedTemplate(null)}>{t('Cancel')}


                          </button>
                          <button
                            className="button primary"
                            onClick={handleTemplateConfirm}>

                            <ImportIcon />{t('Import Template')}

                          </button>
                        </div>
                      </div>
                    </div>
                  </div> :

                  <>
                    <div className="template-grid">
                      {paginatedTemplates.map((template) =>
                        <div
                          key={template.id}
                          className="template-card"
                          onClick={() => handleTemplateSelect(template)}>

                          {template.previewImage ?
                            <div className="template-preview">
                              {loadedImages.has(template.id) ?
                                <>
                                  <img
                                    src={template.previewImage}
                                    alt={`${template.name} preview`}
                                    onError={(e) => {
                                      (e.target as HTMLImageElement).style.display = 'none';
                                    }} />

                                  <div className="template-type-info">
                                    <TypesetterInfo type={template.type || 'latex'} />
                                  </div>
                                </> :

                                <div className="template-preview-loading">
                                  <div className="loading-spinner" />
                                </div>
                              }
                            </div> :

                            <div className="template-preview">
                              <div className="template-preview-placeholder">
                                <FolderIcon />
                              </div>
                              <div className="template-type-info">
                                <TypesetterInfo type={template.type || 'latex'} />
                              </div>
                            </div>
                          }

                          <div className="template-content">
                            <div className="template-header">
                              <h3 className="template-name">{template.name}</h3>
                              <span className="template-category">{template.category}</span>
                            </div>

                            <p className="template-description">{template.description}</p>

                            {template.tags.length > 0 &&
                              <div className="template-tags">
                                {template.tags.slice(0, 3).map((tag) =>
                                  <span key={tag} className="template-tag">{tag}</span>
                                )}
                                {template.tags.length > 3 &&
                                  <span className="template-tag-more">+{template.tags.length - 3}</span>
                                }
                              </div>
                            }

                            <div className="template-meta">
                              {template.author &&
                                <span className="template-author">{t('by')}{template.author}</span>
                              }
                              <span className="template-updated">{t('Updated')}
                                {new Date(template.lastUpdated).toLocaleDateString()}
                              </span>
                            </div>
                          </div>

                          <div className="template-action">
                            <FolderIcon />{t('View Details')}

                          </div>
                        </div>
                      )}
                    </div>

                    {renderPaginationControls()}
                  </>
              }
            </div>
          }
        </div>
      </Modal>

      <SettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        initialCategory="Templates"
        initialSubcategory="Template Gallery" />

    </>);

};

export default TemplateImportModal;