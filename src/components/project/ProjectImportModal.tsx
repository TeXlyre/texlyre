// src/components/project/ProjectImportModal.tsx
import { t } from '@/i18n';
import type React from 'react';
import { useRef, useState } from 'react';

import {
  type ImportOptions,
  type ImportableProject,
  projectImportService
} from
  '../../services/ProjectImportService';
import { formatDate } from '../../utils/dateUtils';
import { GlobeIcon, ShareIcon, ImportIcon, TemplatesIcon, ZipFileIcon } from '../common/Icons';
import Modal from '../common/Modal';
import TemplateImportModal from './TemplateImportModal';
import UrlImportModal from './UrlImportModal';
import YjsLinkImportModal from './YjsLinkImportModal';

interface TemplateProject {
  id: string;
  name: string;
  description: string;
  type: "latex" | "typst";
  category: string;
  tags: string[];
  downloadUrl: string;
  previewImage?: string;
  author?: string;
  version?: string;
  lastUpdated: string;
}

interface ProjectImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProjectsImported: () => void;
}

const ProjectImportModal: React.FC<ProjectImportModalProps> = ({
  isOpen,
  onClose,
  onProjectsImported
}) => {
  const [importSource, setImportSource] = useState<'template' | 'zip' | null>(
    null
  );
  const [availableProjects, setAvailableProjects] = useState<
    ImportableProject[]>(
      []);
  const [selectedProjects, setSelectedProjects] = useState<Set<string>>(
    new Set()
  );
  const [isScanning, setIsScanning] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [conflictResolution, setConflictResolution] = useState<
    'skip' | 'overwrite' | 'create-new'>(
      'create-new');
  const [makeCollaborator, setMakeCollaborator] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedZipFile, setSelectedZipFile] = useState<File | null>(null);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [showUrlModal, setShowUrlModal] = useState(false);
  const [showYjsLinkModal, setShowYjsLinkModal] = useState(false);

  const handleTemplateImport = () => {
    setShowTemplateModal(true);
  };

  const handleUrlImport = () => {
    setShowUrlModal(true);
  };

  const handleYjsLinkImport = () => {
    setShowYjsLinkModal(true);
  };

  const handleYjsLinkSelect = (yjsUrl: string) => {
    window.location.hash = yjsUrl;
    window.location.reload();
  };
  const handleUrlImportSelect = async (data: {
    name: string;
    description: string;
    type: 'latex' | 'typst';
    tags: string[];
    zipUrl: string;
  }) => {
    try {
      setIsImporting(true);
      setError(null);

      const templateUrl = `${window.location.origin}${window.location.pathname}#newProjectName:${encodeURIComponent(data.name)}&newProjectDescription:${encodeURIComponent(data.description)}&newProjectType:${encodeURIComponent(data.type)}&newProjectTags:${encodeURIComponent(data.tags.join(','))}&files:${encodeURIComponent(data.zipUrl)}`;

      window.location.href = templateUrl;
      window.location.reload();
    } catch (error) {
      setError(
        error instanceof Error ? error.message : t('Failed to import from URL')
      );
    } finally {
      setIsImporting(false);
    }
  };

  const handleTemplateSelect = async (template: TemplateProject) => {
    try {
      setIsImporting(true);
      setError(null);

      const templateUrl = `${window.location.origin}${window.location.pathname}#newProjectName:${encodeURIComponent(template.name)}&newProjectDescription:${encodeURIComponent(template.description)}&newProjectType:${encodeURIComponent(template.type)}&newProjectTags:${encodeURIComponent(template.tags.join(','))}&files:${encodeURIComponent(template.downloadUrl)}`;

      window.location.href = templateUrl;
      window.location.reload();

    } catch (error) {
      setError(
        error instanceof Error ? error.message : t('Failed to import template')
      );
    } finally {
      setIsImporting(false);
    }
  };

  const handleZipFileSelect = async (
    event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setIsScanning(true);
      setError(null);

      setSelectedZipFile(file);

      const projects = await projectImportService.scanZipFile(file);
      setAvailableProjects(projects);
      setImportSource('zip');
      setSelectedProjects(new Set());
    } catch (error) {
      setError(
        error instanceof Error ? error.message : t('Error scanning zip file')
      );
    } finally {
      setIsScanning(false);
    }
  };

  const handleProjectToggle = (projectId: string) => {
    const newSelected = new Set(selectedProjects);
    if (newSelected.has(projectId)) {
      newSelected.delete(projectId);
    } else {
      newSelected.add(projectId);
    }
    setSelectedProjects(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedProjects.size === availableProjects.length) {
      setSelectedProjects(new Set());
    } else {
      setSelectedProjects(new Set(availableProjects.map((p) => p.id)));
    }
  };

  const handleImport = async () => {
    if (selectedProjects.size === 0) return;

    try {
      setIsImporting(true);
      setError(null);

      const options: ImportOptions = {
        makeCollaborator,
        conflictResolution
      };

      let result;
      if (importSource === 'zip') {
        if (!selectedZipFile) {
          throw new Error(t('No ZIP file available for import'));
        }
        result = await projectImportService.importFromZip(
          selectedZipFile,
          Array.from(selectedProjects),
          options
        );
      } else {
        throw new Error(t('Invalid import source'));
      }

      if (result.errors.length > 0) {
        setError(
          `Import completed with errors: ${result.errors.map((e) => e.error).join(', ')}`
        );
      }

      if (result.imported.length > 0) {
        document.dispatchEvent(new CustomEvent('projects-imported'));
        onProjectsImported();
        onClose();
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : t('Import failed'));
    } finally {
      setIsImporting(false);
    }
  };

  const handleClose = () => {
    setImportSource(null);
    setAvailableProjects([]);
    setSelectedProjects(new Set());
    setSelectedZipFile(null);
    setError(null);
    setIsScanning(false);
    setIsImporting(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    onClose();
  };

  const getOwnershipText = (project: ImportableProject) => {
    if (project.originalOwnerId === 'current-user-id') {
      return 'Owned by you';
    }
    return makeCollaborator ?
      'Will be imported as collaborator' :
      'Will be imported as owner';
  };

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={handleClose}
        title={t('Import Projects')}
        icon={ImportIcon}
        size="large">

        <div className="project-import-modal">
          {error &&
            <div className="error-message" style={{ marginBottom: '1rem' }}>
              {error}
            </div>
          }

          {!importSource &&
            <div className="import-source-selection">
              <h3>{t('Choose Import Source')}</h3>

              <div className="import-options">
                <label
                  className="import-option-button"
                  onClick={handleTemplateImport}
                  style={{
                    pointerEvents: isScanning || isImporting ? 'none' : 'auto',
                    opacity: isScanning || isImporting ? 0.5 : 1
                  }}>
                  <TemplatesIcon />
                  <div>
                    <strong>{t('From Template Gallery')}</strong>
                    <p>{t('Browse and import project templates from the community')}</p>
                  </div>
                </label>

                <label
                  className="import-option-button"
                  onClick={handleYjsLinkImport}
                  style={{
                    pointerEvents: isScanning || isImporting ? 'none' : 'auto',
                    opacity: isScanning || isImporting ? 0.5 : 1
                  }}>
                  <ShareIcon />
                  <div>
                    <strong>{t('From TeXlyre Link')}</strong>
                    <p>{t('Open a shared project using its TeXlyre link')}</p>
                  </div>
                </label>

                <label
                  className="import-option-button"
                  onClick={handleUrlImport}
                  style={{
                    pointerEvents: isScanning || isImporting ? 'none' : 'auto',
                    opacity: isScanning || isImporting ? 0.5 : 1
                  }}>
                  <GlobeIcon />
                  <div>
                    <strong>{t('From URL')}</strong>
                    <p>{t('Import from URL: GitHub, GitLab, Codeberg repositories or ZIP link')}</p>
                  </div>
                </label>

                <label className="import-option-button">
                  <ZipFileIcon />
                  <div>
                    <strong>{t('From ZIP File')}</strong>
                    <p>{t('Import projects from a TeXlyre export file: Supports LaTeX and Typst')}</p>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".zip"
                    onChange={handleZipFileSelect}
                    style={{ display: 'none' }}
                    disabled={isScanning || isImporting} />
                </label>
              </div>

              {isScanning &&
                <div className="scanning-indicator">
                  <div className="loading-spinner" />
                  <p>{t('Scanning for projects...')}</p>
                </div>
              }
            </div>
          }

          {importSource && availableProjects.length > 0 &&
            <div className="project-selection">
              <div className="selection-header">
                <h3>{t('Available Projects (')}{availableProjects.length})</h3>
                <button
                  className="button secondary"
                  onClick={handleSelectAll}
                  disabled={isImporting}>

                  {selectedProjects.size === availableProjects.length
                    ? t('Deselect All')
                    : t('Select All')}
                </button>
              </div>

              <div className="import-options-panel">
                <div className="option-group">
                  <label>{t('Conflict resolution strategy:')}</label>
                  <select
                    value={conflictResolution}
                    onChange={(e) =>
                      setConflictResolution(
                        e.target.value as 'skip' | 'overwrite' | 'create-new'
                      )
                    }
                    disabled={isImporting}>

                    <option value="skip">{t('Skip existing projects')}</option>
                    <option value="overwrite">{t('Merge and overwrite existing projects')}

                    </option>
                    <option value="create-new">{t('Create new projects (create new URLs on conflict)')}

                    </option>
                  </select>
                </div>

                <div className="option-group">
                  <label>
                    <input
                      type="checkbox"
                      checked={makeCollaborator}
                      onChange={(e) => setMakeCollaborator(e.target.checked)}
                      disabled={isImporting} />{t('Import as collaborator (preserve original ownership)')}


                  </label>
                </div>
              </div>

              <div className="projects-compact-list">
                {availableProjects.map((project) =>
                  <div
                    key={project.id}
                    className={`project-item ${selectedProjects.has(project.id) ? 'selected' : ''}`}
                    onClick={() =>
                      !isImporting && handleProjectToggle(project.id)
                    }>

                    <input
                      type="checkbox"
                      checked={selectedProjects.has(project.id)}
                      onChange={() => handleProjectToggle(project.id)}
                      disabled={isImporting} />

                    <div className="project-details">
                      <div className="project-name">{project.name}</div>
                      <div className="project-description">
                        {project.description || t('No description')}
                      </div>
                      <div className="project-meta">
                        <span>{t(`Last Modified: {lastModified}`, { lastModified: formatDate(project.lastModified) })}
                        </span>
                        <span>{getOwnershipText(project)}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="button secondary"
                  onClick={handleClose}
                  disabled={isImporting}>{t('Cancel')}


                </button>
                <button
                  type="button"
                  className="button primary"
                  onClick={handleImport}
                  disabled={selectedProjects.size === 0 || isImporting}>

                  {isImporting ?
                    'Importing...' :
                    `Import ${selectedProjects.size} Project${selectedProjects.size === 1 ? '' : 's'}`}
                </button>
              </div>
            </div>
          }

          {importSource && availableProjects.length === 0 && !isScanning &&
            <div className="no-projects">
              <p>{t('No importable projects found in the selected ZIP file.')}

              </p>
              <button
                className="button secondary"
                onClick={() => setImportSource(null)}>{t('Choose Different Source')}


              </button>
            </div>
          }
        </div>
      </Modal>

      <TemplateImportModal
        isOpen={showTemplateModal}
        onClose={() => setShowTemplateModal(false)}
        onTemplateSelected={handleTemplateSelect} />


      <UrlImportModal
        isOpen={showUrlModal}
        onClose={() => setShowUrlModal(false)}
        onUrlImport={handleUrlImportSelect} />

      <YjsLinkImportModal
        isOpen={showYjsLinkModal}
        onClose={() => setShowYjsLinkModal(false)}
        onYjsLinkOpen={handleYjsLinkSelect} />

    </>);

};

export default ProjectImportModal;