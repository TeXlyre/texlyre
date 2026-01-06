// src/components/project/UrlImportModal.tsx
import { t } from '@/i18n';
import type React from 'react';
import { useState, useEffect, useRef } from 'react';
import { useSettings } from '../../hooks/useSettings';
import { usePageMetadata } from '../../hooks/useUrlMetadata';
import { GlobeIcon, ImportIcon, FolderIcon, SettingsIcon } from '../common/Icons';
import Modal from '../common/Modal';
import SettingsModal from '../settings/SettingsModal';
import TypesetterInfo from '../common/TypesetterInfo';

interface UrlImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUrlImport: (data: {
    name: string;
    description: string;
    type: 'latex' | 'typst';
    tags: string[];
    zipUrl: string;
  }) => void;
}

const UrlImportModal: React.FC<UrlImportModalProps> = ({
  isOpen,
  onClose,
  onUrlImport
}) => {
  const { registerSetting, getSetting } = useSettings();
  const settingsRegistered = useRef(false);
  const [showSettings, setShowSettings] = useState(false);

  const [url, setUrl] = useState('');
  const [hasAttemptedFetch, setHasAttemptedFetch] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<'latex' | 'typst'>('latex');
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [customZipUrl, setCustomZipUrl] = useState('');

  const [repositoryProxyUrl, setRepositoryProxyUrl] = useState('');

  const { metadata, loading, error } = usePageMetadata(
    hasAttemptedFetch ? url : null,
    repositoryProxyUrl
  );

  useEffect(() => {
    if (settingsRegistered.current) return;
    settingsRegistered.current = true;

    const initialProxyUrl = getSetting('repository-proxy-url')?.value as string ?? '';
    setRepositoryProxyUrl(initialProxyUrl);

    registerSetting({
      id: 'repository-proxy-url',
      category: t("Templates"),
      subcategory: t("URL Repository Import"),
      type: 'text',
      label: t("Repository proxy URL"),
      description: t("Proxy URL to prepend ONLY to repository ZIP downloads to circumvent CORS policy (optional)"),
      defaultValue: 'https://proxy.texlyre.org/?url=',
      onChange: (value) => {
        setRepositoryProxyUrl(value as string);
      }
    });
  }, [registerSetting, getSetting]);

  const handleUrlSubmit = () => {
    if (!url.trim()) return;
    setName('');
    setDescription('');
    setType('latex');
    setTags([]);
    setCustomZipUrl('');
    setHasAttemptedFetch(true);
  };

  const handleAddTag = () => {
    const trimmedTag = tagInput.trim();
    if (trimmedTag && !tags.includes(trimmedTag)) {
      setTags([...tags, trimmedTag]);
      setTagInput('');
    }
  };

  const handleTagKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      handleAddTag();
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter((tag) => tag !== tagToRemove));
  };

  const handleImport = () => {
    const finalZipUrl = customZipUrl || metadata?.zipUrl;
    if (!name.trim() || !finalZipUrl) return;

    onUrlImport({
      name: name.trim(),
      description: description.trim(),
      type,
      tags,
      zipUrl: finalZipUrl
    });

    handleClose();
  };

  const handleClose = () => {
    setUrl('');
    setHasAttemptedFetch(false);
    setName('');
    setDescription('');
    setType('latex');
    setTags([]);
    setTagInput('');
    setCustomZipUrl('');
    onClose();
  };

  useEffect(() => {
    if (metadata && hasAttemptedFetch) {
      if (metadata.title && !name) setName(metadata.title);
      if (metadata.description && !description) setDescription(metadata.description);
      if (metadata.type) setType(metadata.type);
      if (metadata.tags && metadata.tags.length > 0 && tags.length === 0) {
        setTags(metadata.tags);
      }
      if (metadata.zipUrl && !customZipUrl) setCustomZipUrl(metadata.zipUrl);
    }
  }, [metadata, hasAttemptedFetch]);

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={handleClose}
        title={t('Import from URL')}
        icon={GlobeIcon}
        size="large"
        headerActions={
          <button
            className="modal-close-button"
            onClick={() => setShowSettings(true)}
            title={t('Import Settings')}>

            <SettingsIcon />
          </button>
        }>

        <div className="url-import-modal">
          {!hasAttemptedFetch ?
            <div className="url-input-section">
              <div className="form-group">
                <label htmlFor="repository-url">{t('Repository or ZIP URL')}</label>
                <p className="field-description">{t('Enter a GitHub, GitLab, Codeberg, or Gitea repository URL, or a direct link to a ZIP file')}

                </p>
                <input
                  type="text"
                  id="repository-url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder={"https://github.com/user/repo " + t('or') + " https://example.com/project.zip"}
                  onKeyDown={(e) => e.key === 'Enter' && handleUrlSubmit()} />

              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="button secondary"
                  onClick={handleClose}>{t('Cancel')}


                </button>
                <button
                  type="button"
                  className="button primary"
                  onClick={handleUrlSubmit}
                  disabled={!url.trim()}>

                  <GlobeIcon />{t('Fetch Metadata')}

                </button>
              </div>
            </div> :

            <>
              {loading &&
                <div className="url-loading">
                  <div className="loading-spinner" />
                  <p>{t('Fetching repository metadata...')}</p>
                </div>
              }

              {error &&
                <div className="error-message">
                  <p>{error}</p>
                  <button
                    type="button"
                    className="button secondary smaller"
                    onClick={() => {
                      setHasAttemptedFetch(false);
                      setUrl('');
                    }}>{t('Try Different URL')}


                  </button>
                </div>
              }

              {metadata && !loading &&
                <div className="url-import-content">
                  <div className="url-import-form">
                    <div className="form-group">
                      <label htmlFor="project-name">{t('Project Name')}
                        <span className="required">*</span>
                      </label>
                      <input
                        type="text"
                        id="project-name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder={metadata.title || 'Enter project name'}
                        required />

                    </div>

                    <div className="form-group">
                      <label htmlFor="project-description">{t('Description')}</label>
                      <textarea
                        id="project-description"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder={metadata.description || 'Enter project description'}
                        rows={3} />

                    </div>

                    <div className="form-group">
                      <label htmlFor="project-type">{t('Typesetter Type')}</label>
                      <select
                        id="project-type"
                        value={type}
                        onChange={(e) => setType(e.target.value as 'latex' | 'typst')}>

                        <option value="latex">{t('LaTeX')}</option>
                        <option value="typst">{t('Typst')}</option>
                      </select>
                    </div>

                    <div className="form-group">
                      <label htmlFor="project-tags">{t('Tags')}</label>
                      <div className="tag-input-container">
                        <input
                          type="text"
                          id="project-tags"
                          value={tagInput}
                          onChange={(e) => setTagInput(e.target.value)}
                          onKeyDown={handleTagKeyPress}
                          placeholder={t('Add tags (press Enter or comma)')} />

                        <button
                          type="button"
                          className="button primary"
                          onClick={handleAddTag}
                          disabled={!tagInput.trim()}>{t('Add')}


                        </button>
                      </div>

                      {tags.length > 0 &&
                        <div className="tags-container">
                          {tags.map((tag, index) =>
                            <div key={index} className="tag">
                              <span>{tag}</span>
                              <button
                                type="button"
                                onClick={() => handleRemoveTag(tag)}>

                                ×
                              </button>
                            </div>
                          )}
                        </div>
                      }
                    </div>

                    <div className="form-group">
                      <label htmlFor="zip-url">{t('ZIP Download URL')}
                        <span className="required">*</span>
                      </label>
                      <input
                        type="text"
                        id="zip-url"
                        value={customZipUrl || metadata.zipUrl}
                        onChange={(e) => setCustomZipUrl(e.target.value)}
                        placeholder={t('ZIP file URL')}
                        required />

                    </div>
                  </div>

                  <div className="url-import-preview">
                    {metadata.image ?
                      <div className="preview-image-container">
                        <img
                          src={metadata.image}
                          alt={t('Repository preview')}
                          className="preview-image" />

                        <div className="preview-type-badge">
                          <TypesetterInfo type={type} />
                        </div>
                      </div> :

                      <div className="preview-placeholder">
                        <FolderIcon />
                        <span>{t('No preview available')}</span>
                      </div>
                    }

                    <div className="preview-details">
                      <div className="preview-detail-item">
                        <strong>{t('Source: ')}</strong>
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="preview-link">

                          {url}
                        </a>
                      </div>
                    </div>
                  </div>
                </div>
              }

              {metadata && !loading &&
                <div className="modal-actions">
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() => {
                      setHasAttemptedFetch(false);
                      setUrl('');
                    }}>{t('Back')}


                  </button>
                  <button
                    type="button"
                    className="button primary"
                    onClick={handleImport}
                    disabled={!name.trim() || !(customZipUrl || metadata.zipUrl)}>

                    <ImportIcon />{t('Import Project')}

                  </button>
                </div>
              }
            </>
          }
        </div>
      </Modal>

      <SettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        initialCategory={t("Templates")}
        initialSubcategory={t("URL Repository Import")} />

    </>);

};

export default UrlImportModal;