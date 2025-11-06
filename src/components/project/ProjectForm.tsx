// src/components/projects/ProjectForm.tsx
import { t } from "@/i18n";
import type React from 'react';
import { useEffect, useState } from 'react';

import type { Project } from '../../types/projects.ts';

interface ProjectFormProps {
  project?: Project;
  onSubmit: (projectData: {
    name: string;
    description: string;
    type: 'latex' | 'typst';
    tags: string[];
    docUrl?: string;
    isFavorite: boolean;
  }) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
  simpleMode?: boolean; // Added for use in editor
  disableNameAndDescription?: boolean; // New prop to disable name and description editing
}

const ProjectForm: React.FC<ProjectFormProps> = ({
  project,
  onSubmit,
  onCancel,
  isSubmitting = false,
  simpleMode = false, // Default to full form
  disableNameAndDescription = false
}) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<'latex' | 'typst'>('latex');
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [docUrl, setDocUrl] = useState('');
  const [isFavorite, setIsFavorite] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize form with project data if editing
  useEffect(() => {
    if (project) {
      setName(project.name);
      setDescription(project.description || '');
      setType(project.type);
      setTags(project.tags || []);
      setDocUrl(project.docUrl || '');
      setIsFavorite(project.isFavorite);
    }
  }, [project]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      setError('Project name is required');
      return;
    }

    onSubmit({
      name: name.trim(),
      description: description.trim(),
      type,
      tags,
      docUrl: docUrl || undefined,
      isFavorite
    });
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

  return (
    <form className="project-form" onSubmit={handleSubmit}>
      {error && <div className="form-error">{error}</div>}

      <div className="form-group">
        <label htmlFor="project-name">{t('Project Name')}
          <span className="required">*</span>
        </label>
        {disableNameAndDescription ?
          <div className="disabled-field">
            <span>{name}</span>
            <div className="field-note">{t('Open the project to edit its name')}</div>
          </div> :

          <input
            type="text"
            id="project-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={isSubmitting || disableNameAndDescription}
            required />

        }
      </div>

      <div className="form-group">
        <label htmlFor="project-description">{t('Description')}</label>
        {disableNameAndDescription ?
          <div className="disabled-field">
            <span>{description || 'No description'}</span>
            <div className="field-note">{t('Open the project to edit its description')}

            </div>
          </div> :

          <textarea
            id="project-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={isSubmitting || disableNameAndDescription}
            rows={3} />

        }
      </div>

      <div className="form-group">
        <label htmlFor="project-type">{t('Typesetter Type')}</label>
        {disableNameAndDescription ?
          <div className="disabled-field">
            <span>{type === 'latex' ? 'LaTeX' : 'Typst'}</span>
            <div className="field-note">{t('Open the project to edit its typesetter type')}</div>
          </div> :

          <select
            id="project-type"
            value={type}
            onChange={(e) => setType(e.target.value as 'latex' | 'typst')}
            disabled={isSubmitting}>

            <option value="latex">{t('LaTeX')}</option>
            <option value="typst">{t('Typst')}</option>
          </select>
        }
      </div>

      {/* Only show these fields in full mode (not in simple mode) */}
      {!simpleMode &&
        <>
          <div className="form-group">
            <label htmlFor="project-tags">{t('Tags')}</label>
            <div className="tag-input-container">
              <input
                type="text"
                id="project-tags"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleTagKeyPress}
                disabled={isSubmitting}
                placeholder={t('Add tags (press Enter or comma to add)')} />

              <button
                type="button"
                className="button primary"
                onClick={handleAddTag}
                disabled={!tagInput.trim() || isSubmitting}>{t('Add')}


              </button>
            </div>

            {tags.length > 0 &&
              <div className="tags-container">
                {tags.map((tag, index) =>
                  <div key={index} className="tag">
                    <span>{tag}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(tag)}
                      disabled={isSubmitting}>

                      ×
                    </button>
                  </div>
                )}
              </div>
            }
          </div>

          {!project &&
            <div className="form-group checkbox-group">
              <label>
                <input
                  type="checkbox"
                  checked={isFavorite}
                  onChange={(e) => setIsFavorite(e.target.checked)}
                  disabled={isSubmitting} />

                <span>{t('Add to favorites')}</span>
              </label>
            </div>
          }
        </>
      }

      <div className="form-actions">
        <button
          type="button"
          className="button secondary"
          onClick={onCancel}
          disabled={isSubmitting}>{t('Cancel')}


        </button>
        <button
          type="submit"
          className="button primary"
          disabled={isSubmitting}>

          {isSubmitting ?
            project ?
              t('Updating...') :
              t('Creating...') :
            project ?
              t('Update Project') :
              t('Create Project')}
        </button>
      </div>
    </form>);

};

export default ProjectForm;