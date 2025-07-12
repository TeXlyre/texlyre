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
  const [filteredTemplates, setFilteredTemplates] = useState<TemplateProject[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const TEMPLATES_API_URL = "https://texlyre.github.io/texlyre-templates/api/templates.json";

  useEffect(() => {
    if (isOpen) {
      loadTemplates();
    }
  }, [isOpen]);

  useEffect(() => {
    filterTemplates();
  }, [categories, selectedCategory, searchQuery]);

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
    } catch (error) {
      console.error("Error loading templates:", error);
      setError(error instanceof Error ? error.message : "Failed to load templates");
    } finally {
      setIsLoading(false);
    }
  };

  const filterTemplates = () => {
    let allTemplates: TemplateProject[] = [];

    if (selectedCategory === "all") {
      allTemplates = categories.flatMap(cat => cat.templates);
    } else {
      const category = categories.find(cat => cat.id === selectedCategory);
      allTemplates = category?.templates || [];
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      allTemplates = allTemplates.filter(template =>
        template.name.toLowerCase().includes(query) ||
        template.description.toLowerCase().includes(query) ||
        template.tags.some(tag => tag.toLowerCase().includes(query))
      );
    }

    setFilteredTemplates(allTemplates);
  };

  const handleTemplateSelect = (template: TemplateProject) => {
    onTemplateSelected(template);
    onClose();
  };

  const handleClose = () => {
    setSearchQuery("");
    setSelectedCategory("all");
    setError(null);
    onClose();
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
              onChange={(e) => setSearchQuery(e.target.value)}
              className="template-search-input"
              disabled={isLoading}
            />

            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
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
            ) : (
              <div className="template-grid">
                {filteredTemplates.map(template => (
                  <div
                    key={template.id}
                    className="template-card"
                    onClick={() => handleTemplateSelect(template)}
                  >
                    {template.previewImage && (
                      <div className="template-preview">
                        <img
                          src={template.previewImage}
                          alt={`${template.name} preview`}
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
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
                      Use Template
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
};

export default TemplateImportModal;