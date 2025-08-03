// src/components/project/TemplateImportModal.tsx
import type React from "react";
import { useEffect, useState } from "react";

import { FolderIcon, ImportIcon } from "../common/Icons";
import Modal from "../common/Modal";

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
  onTemplateSelected,
}) => {
  const [categories, setCategories] = useState<TemplateCategory[]>([]);
  const [allTemplates, setAllTemplates] = useState<TemplateProject[]>([]);
  const [filteredTemplates, setFilteredTemplates] = useState<TemplateProject[]>([]);
  const [paginatedTemplates, setPaginatedTemplates] = useState<TemplateProject[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateProject | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadedImages, setLoadedImages] = useState<Set<string>>(new Set());

  const TEMPLATES_PER_PAGE = 12;
  const TEMPLATES_API_URL = "https://texlyre.github.io/texlyre-templates/api/templates.json";

  useEffect(() => {
    if (isOpen) {
      loadTemplates();
    }
  }, [isOpen]);

  useEffect(() => {
    filterAndPaginateTemplates();
  }, [allTemplates, selectedCategory, searchQuery, currentPage]);

  useEffect(() => {
    // Load preview images for currently visible templates
    paginatedTemplates.forEach(template => {
      if (template.previewImage && !loadedImages.has(template.id)) {
        loadImage(template.id, template.previewImage);
      }
    });
  }, [paginatedTemplates]);

  const loadTemplates = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch(TEMPLATES_API_URL);
      if (!response.ok) {
        throw new Error(`Failed to fetch templates: ${response.statusText}`);
      }

      const data = await response.json();
      setCategories(data.categories || []);

      const allTemplatesFlat = data.categories?.flatMap((cat: any) => cat.templates) || [];
      setAllTemplates(allTemplatesFlat);
    } catch (error) {
      console.error("Error loading templates:", error);
      setError(error instanceof Error ? error.message : "Failed to load templates");
    } finally {
      setIsLoading(false);
    }
  };

  const filterAndPaginateTemplates = () => {
    let filtered: TemplateProject[] = [];

    if (selectedCategory === "all") {
      filtered = allTemplates;
    } else {
      filtered = allTemplates.filter(template => template.category === selectedCategory);
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(template =>
        template.name.toLowerCase().includes(query) ||
        template.description.toLowerCase().includes(query) ||
        template.tags.some(tag => tag.toLowerCase().includes(query))
      );
    }

    setFilteredTemplates(filtered);
    setTotalPages(Math.ceil(filtered.length / TEMPLATES_PER_PAGE));

    const startIndex = (currentPage - 1) * TEMPLATES_PER_PAGE;
    const endIndex = startIndex + TEMPLATES_PER_PAGE;
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
      setLoadedImages(prev => new Set(prev).add(templateId));
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

  const handleClose = () => {
    setSearchQuery("");
    setSelectedCategory("all");
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
      let end = Math.min(totalPages, start + maxVisible - 1);

      if (end - start + 1 < maxVisible) {
        start = Math.max(1, end - maxVisible + 1);
      }

      for (let i = start; i <= end; i++) {
        pages.push(i);
      }
      return pages;
    };

    const startItem = (currentPage - 1) * TEMPLATES_PER_PAGE + 1;
    const endItem = Math.min(currentPage * TEMPLATES_PER_PAGE, filteredTemplates.length);

    return (
      <div className="template-pagination">
        <div className="pagination-info">
          Showing {startItem}-{endItem} of {filteredTemplates.length} templates
        </div>

        <div className="pagination-controls">
          <button
            className="pagination-button"
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={currentPage === 1 || isLoading}
          >
            Previous
          </button>

          {currentPage > 2 && (
            <>
              <button
                className="pagination-button"
                onClick={() => handlePageChange(1)}
                disabled={isLoading}
              >
                1
              </button>
              {currentPage > 3 && <span className="pagination-ellipsis">...</span>}
            </>
          )}

          {getVisiblePages().map(page => (
            <button
              key={page}
              className={`pagination-button ${page === currentPage ? 'active' : ''}`}
              onClick={() => handlePageChange(page)}
              disabled={isLoading}
            >
              {page}
            </button>
          ))}

          {currentPage < totalPages - 1 && (
            <>
              {currentPage < totalPages - 2 && <span className="pagination-ellipsis">...</span>}
              <button
                className="pagination-button"
                onClick={() => handlePageChange(totalPages)}
                disabled={isLoading}
              >
                {totalPages}
              </button>
            </>
          )}

          <button
            className="pagination-button"
            onClick={() => handlePageChange(currentPage + 1)}
            disabled={currentPage === totalPages || isLoading}
          >
            Next
          </button>
        </div>
      </div>
    );
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Import Template"
      icon={ImportIcon}
      size="large"
    >
      <div className="template-import-modal">
        {error && (
          <div className="error-message" style={{ marginBottom: "1rem" }}>
            {error}
          </div>
        )}

        <div className="template-search-controls">
          <div className="template-search-row">
            <input
              type="text"
              placeholder="Search templates..."
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="template-search-input"
              disabled={isLoading}
            />

            <select
              value={selectedCategory}
              onChange={(e) => handleCategoryChange(e.target.value)}
              className="template-category-select"
              disabled={isLoading}
            >
              <option value="all">All Categories</option>
              {categories.map(category => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {isLoading ? (
          <div className="template-loading">
            <div className="loading-spinner" />
            <p>Loading templates...</p>
          </div>
        ) : (
          <div className="template-list">
            {filteredTemplates.length === 0 ? (
              <div className="no-templates">
                <p>No templates found matching your criteria.</p>
              </div>
            ) : selectedTemplate ? (
              <div className="template-detail-view">
                <div className="template-detail-header">
                  <button
                    className="back-button"
                    onClick={() => setSelectedTemplate(null)}
                  >
                    ← Back to Templates
                  </button>
                  <h3>{selectedTemplate.name}</h3>
                </div>

                <div className="template-detail-content">
                  <div className="template-detail-preview">
                    {selectedTemplate.previewImage ? (
                      loadedImages.has(selectedTemplate.id) ? (
                        <img
                          src={selectedTemplate.previewImage}
                          alt={`${selectedTemplate.name} preview`}
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      ) : (
                        <div className="template-preview-loading">
                          <div className="loading-spinner" />
                          <span>Loading preview...</span>
                        </div>
                      )
                    ) : (
                      <div className="template-preview-placeholder">
                        <FolderIcon />
                        <span>No preview available</span>
                      </div>
                    )}
                  </div>

                  <div className="template-detail-info">
                    <div className="template-detail-meta">
                      <span className="template-category">{selectedTemplate.category}</span>
                      {selectedTemplate.version && (
                        <span className="template-version">v{selectedTemplate.version}</span>
                      )}
                    </div>

                    <p className="template-detail-description">{selectedTemplate.description}</p>

                    {selectedTemplate.tags.length > 0 && (
                      <div className="template-tags">
                        {selectedTemplate.tags.map(tag => (
                          <span key={tag} className="template-tag">{tag}</span>
                        ))}
                      </div>
                    )}

                    <div className="template-detail-footer">
                      {selectedTemplate.author && (
                        <span className="template-author">by {selectedTemplate.author}</span>
                      )}
                      <span className="template-updated">
                        Updated {new Date(selectedTemplate.lastUpdated).toLocaleDateString()}
                      </span>
                    </div>

                    <div className="template-actions">
                      <button
                        className="button secondary"
                        onClick={() => setSelectedTemplate(null)}
                      >
                        Cancel
                      </button>
                      <button
                        className="button primary"
                        onClick={handleTemplateConfirm}
                      >
                        <ImportIcon />
                        Use This Template
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div className="template-grid">
                  {paginatedTemplates.map(template => (
                    <div
                      key={template.id}
                      className="template-card"
                      onClick={() => handleTemplateSelect(template)}
                    >
                      {template.previewImage ? (
                        <div className="template-preview">
                          {loadedImages.has(template.id) ? (
                            <img
                              src={template.previewImage}
                              alt={`${template.name} preview`}
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display = 'none';
                              }}
                            />
                          ) : (
                            <div className="template-preview-loading">
                              <div className="loading-spinner" />
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="template-preview">
                          <div className="template-preview-placeholder">
                            <FolderIcon />
                          </div>
                        </div>
                      )}

                      <div className="template-content">
                        <div className="template-header">
                          <h3 className="template-name">{template.name}</h3>
                          <span className="template-category">{template.category}</span>
                        </div>

                        <p className="template-description">{template.description}</p>

                        {template.tags.length > 0 && (
                          <div className="template-tags">
                            {template.tags.slice(0, 3).map(tag => (
                              <span key={tag} className="template-tag">{tag}</span>
                            ))}
                            {template.tags.length > 3 && (
                              <span className="template-tag-more">+{template.tags.length - 3}</span>
                            )}
                          </div>
                        )}

                        <div className="template-meta">
                          {template.author && (
                            <span className="template-author">by {template.author}</span>
                          )}
                          <span className="template-updated">
                            Updated {new Date(template.lastUpdated).toLocaleDateString()}
                          </span>
                        </div>
                      </div>

                      <div className="template-action">
                        <FolderIcon />
                        View Details
                      </div>
                    </div>
                  ))}
                </div>

                {renderPaginationControls()}
              </>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
};

export default TemplateImportModal;
