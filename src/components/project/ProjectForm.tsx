// src/components/projects/ProjectForm.tsx
import { t } from '@/i18n';
import type React from 'react';
import { useEffect, useState } from 'react';

import type { Project } from '../../types/projects.ts';
import { TagInput } from '../common/TagInput';

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
  simpleMode?: boolean;
  disableNameAndDescription?: boolean;
}

const ProjectForm: React.FC<ProjectFormProps> = ({
  project,
  onSubmit,
  onCancel,
  isSubmitting = false,
  simpleMode = false,
  disableNameAndDescription = false
}) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<'latex' | 'typst'>('latex');
  const [tags, setTags] = useState<string[]>([]);
  const [docUrl, setDocUrl] = useState('');
  const [isFavorite, setIsFavorite] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      setError(t('Project name is required'));
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
            <div className="field-note">{t('Open the project to edit its description')}</div>
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

      {!simpleMode &&
        <>
          <div className="form-group">
            <label htmlFor="project-tags">{t('Tags')}</label>
            <TagInput
              values={tags}
              onChange={setTags}
              placeholder={t('Add tags (press Enter or comma to add)')}
              disabled={isSubmitting}
            />
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
            project ? t('Updating...') : t('Creating...') :
            project ? t('Update Project') : t('Create Project')}
        </button>
      </div>
    </form>
  );
};

export default ProjectForm;