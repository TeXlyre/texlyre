// src/components/project/ShareTargetModal.tsx
import { t } from '@/i18n';
import type React from 'react';
import { useEffect, useState } from 'react';

import { useAuth } from '../../hooks/useAuth';
import { fileStorageService } from '../../services/FileStorageService';
import { projectImportService } from '../../services/ProjectImportService';
import type { PendingShareFile } from '../../services/ShareTargetService';
import type { Project } from '../../types/projects';
import { getMimeType, isBinaryFile } from '../../utils/fileUtils';
import { batchExtractZip } from '../../utils/zipUtils';
import { ImportIcon, NewProjectIcon } from '../common/Icons';
import Modal from '../common/Modal';

interface ShareTargetModalProps {
    isOpen: boolean;
    onClose: () => void;
    files: PendingShareFile[];
    onOpenProject: (docUrl: string, projectId: string) => void;
}

const ShareTargetModal: React.FC<ShareTargetModalProps> = ({
    isOpen,
    onClose,
    files,
    onOpenProject,
}) => {
    const { createProject, getProjects } = useAuth();
    const [mode, setMode] = useState<'choose' | 'existing' | 'new'>('choose');
    const [projects, setProjects] = useState<Project[]>([]);
    const [selectedProjectId, setSelectedProjectId] = useState<string>('');
    const [newProjectName, setNewProjectName] = useState('');
    const [newProjectType, setNewProjectType] = useState<'latex' | 'typst'>('latex');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [isTexlyreStructuredZip, setIsTexlyreStructuredZip] = useState(false);

    const isZip = files.length === 1 && files[0].name.toLowerCase().endsWith('.zip');

    const checkIsTexlyreZip = async (file: PendingShareFile): Promise<boolean> => {
        try {
            const zipFile = new File([file.buffer], file.name, { type: file.type });
            const scanned = await projectImportService.scanZipFile(zipFile);
            return scanned.length > 0;
        } catch {
            return false;
        }
    };

    useEffect(() => {
        if (isOpen) {
            setMode(isZip ? 'new' : 'choose');
            setError(null);
            setSearch('');
            const firstName = files[0]?.name ?? 'Shared Project';
            setNewProjectName(firstName.replace(/\.[^/.]+$/, ''));

            if (isZip && files.length === 1) {
                checkIsTexlyreZip(files[0]).then(setIsTexlyreStructuredZip);
            } else {
                setIsTexlyreStructuredZip(false);
            }
        }
    }, [isOpen]);

    useEffect(() => {
        if (mode === 'existing') {
            getProjects().then(setProjects).catch(() => setProjects([]));
        }
    }, [mode, getProjects]);

    const storeFilesInProject = async (docUrl: string): Promise<void> => {
        await fileStorageService.initialize(docUrl);
        for (const f of files) {
            if (f.name.toLowerCase().endsWith('.zip')) {
                const zipFile = new File([f.buffer], f.name, { type: f.type || 'application/zip' });
                const { files: extracted, directories } = await batchExtractZip(zipFile, '/');
                await fileStorageService.batchStoreFiles([...directories, ...extracted], { showConflictDialog: false });
            } else {
                const mimeType = getMimeType(f.name) || f.type || 'application/octet-stream';
                const binary = isBinaryFile(f.name);
                await fileStorageService.storeFile({
                    id: crypto.randomUUID(),
                    name: f.name,
                    path: `/${f.name}`,
                    type: 'file',
                    content: f.buffer,
                    lastModified: Date.now(),
                    size: f.buffer.byteLength,
                    mimeType,
                    isBinary: binary,
                }, { showConflictDialog: false });
            }
        }
    };

    const handleAddToExisting = async (): Promise<void> => {
        if (!selectedProjectId) return;
        setIsSubmitting(true);
        setError(null);
        try {
            const project = projects.find((p) => p.id === selectedProjectId);
            if (!project?.docUrl) throw new Error(t('Project not found'));
            await storeFilesInProject(project.docUrl);
            onOpenProject(project.docUrl, project.id);
            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : t('Failed to add files'));
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleCreateNew = async (): Promise<void> => {
        if (!isTexlyreStructuredZip && !newProjectName.trim()) return;
        setIsSubmitting(true);
        setError(null);
        try {
            if (isZip && files.length === 1 && isTexlyreStructuredZip) {
                const zipFile = new File([files[0].buffer], files[0].name, { type: files[0].type });
                const scanned = await projectImportService.scanZipFile(zipFile);
                if (scanned.length > 0) {
                    const result = await projectImportService.importFromZip(
                        zipFile,
                        scanned.map((p) => p.id),
                        { conflictResolution: 'create-new', makeCollaborator: false },
                    );
                    if (result.imported.length > 0) {
                        const importedProjectId = result.imported[0];
                        const importedProject = await getProjects().then((all) =>
                            all.find((p) => p.id === importedProjectId) ?? null
                        );
                        if (importedProject) {
                            document.dispatchEvent(new CustomEvent('projects-imported'));
                            onOpenProject(importedProject.docUrl, importedProject.id);
                            onClose();
                            return;
                        }
                    }
                }
            }

            const project = await createProject({
                name: newProjectName.trim(),
                description: '',
                type: newProjectType,
                tags: [],
                isFavorite: false,
            });
            await storeFilesInProject(project.docUrl);
            onOpenProject(project.docUrl, project.id);
            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : t('Failed to create project'));
        } finally {
            setIsSubmitting(false);
        }
    };

    const filteredProjects = projects.filter((p) =>
        p.name.toLowerCase().includes(search.toLowerCase())
    );

    const renderChoose = () => (
        <div className="share-target-choose">
            <div className="share-target-file-list">
                {files.map((f, i) => (
                    <div key={i} className="export-project-item">
                        <strong>{f.name}</strong>
                        <div className="export-project-details">
                            {(f.buffer.byteLength / 1024).toFixed(1)} KB
                        </div>
                    </div>
                ))}
            </div>
            <div className="import-options" style={{ marginTop: '1rem' }}>
                <label className="import-option-button" onClick={() => setMode('existing')}>
                    <ImportIcon />
                    <div>
                        <strong>{t('Add to existing project')}</strong>
                        <p>{t('Choose a project to add these files to')}</p>
                    </div>
                </label>
                <label className="import-option-button" onClick={() => setMode('new')}>
                    <NewProjectIcon />
                    <div>
                        <strong>{t('Create new project')}</strong>
                        <p>{t('Create a new project containing these files')}</p>
                    </div>
                </label>
            </div>
        </div>
    );

    const renderExisting = () => (
        <div className="share-target-existing">
            <div className="share-target-file-list">
                {files.map((f, i) => (
                    <div key={i} className="export-project-item">
                        <strong>{f.name}</strong>
                    </div>
                ))}
            </div>
            <input
                type="text"
                className="search-input"
                placeholder={t('Search projects...')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ margin: '0.75rem 0' }}
            />
            <div className="projects-compact-list">
                {filteredProjects.map((p) => (
                    <div
                        key={p.id}
                        className={`project-item ${selectedProjectId === p.id ? 'selected' : ''}`}
                        onClick={() => setSelectedProjectId(p.id)}
                    >
                        <input
                            type="radio"
                            checked={selectedProjectId === p.id}
                            onChange={() => setSelectedProjectId(p.id)}
                        />
                        <div className="project-details">
                            <div className="project-name">{p.name}</div>
                            {p.description && (
                                <div className="project-description">{p.description}</div>
                            )}
                        </div>
                    </div>
                ))}
                {filteredProjects.length === 0 && (
                    <p style={{ padding: '0.5rem' }}>{t('No projects found')}</p>
                )}
            </div>
            <div className="modal-actions">
                <button className="button secondary" onClick={() => setMode('choose')} disabled={isSubmitting}>
                    {t('Back')}
                </button>
                <button
                    className="button primary"
                    onClick={handleAddToExisting}
                    disabled={!selectedProjectId || isSubmitting}
                >
                    {isSubmitting ? t('Adding...') : t('Add Files')}
                </button>
            </div>
        </div>
    );

    const renderNew = () => (
        <div className="share-target-new">
            <div className="share-target-file-list">
                {files.map((f, i) => (
                    <div key={i} className="export-project-item">
                        <strong>{f.name}</strong>
                    </div>
                ))}
            </div>
            {isTexlyreStructuredZip ? (
                <div className="info-message" style={{ marginTop: '0.75rem' }}>
                    <p>{t('TeXlyre project archive detected. Projects will be imported using their original names.')}</p>
                </div>
            ) : (
                <>
                    <div className="form-group" style={{ marginTop: '0.75rem' }}>
                        <label htmlFor="share-project-name">
                            {t('Project Name')}<span className="required">*</span>
                        </label>
                        <input
                            type="text"
                            id="share-project-name"
                            value={newProjectName}
                            onChange={(e) => setNewProjectName(e.target.value)}
                            disabled={isSubmitting}
                        />
                    </div>
                    <div className="form-group">
                        <label htmlFor="share-project-type">{t('Typesetter Type')}</label>
                        <select
                            id="share-project-type"
                            value={newProjectType}
                            onChange={(e) => setNewProjectType(e.target.value as 'latex' | 'typst')}
                            disabled={isSubmitting}
                        >
                            <option value="latex">{t('LaTeX')}</option>
                            <option value="typst">{t('Typst')}</option>
                        </select>
                    </div>
                </>
            )}
            <div className="modal-actions">
                {!isZip && (
                    <button className="button secondary" onClick={() => setMode('choose')} disabled={isSubmitting}>
                        {t('Back')}
                    </button>
                )}
                <button
                    className="button primary"
                    onClick={handleCreateNew}
                    disabled={(!isTexlyreStructuredZip && !newProjectName.trim()) || isSubmitting}
                >
                    {isSubmitting ? t('Creating...') : t('Create Project')}
                </button>
            </div>
        </div>
    );

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={t('Open Shared Files')}
            icon={ImportIcon}
            size="medium"
        >
            <div className="share-target-modal">
                {error && <div className="error-message" style={{ marginBottom: '1rem' }}>{error}</div>}
                {mode === 'choose' && renderChoose()}
                {mode === 'existing' && renderExisting()}
                {mode === 'new' && renderNew()}
            </div>
        </Modal>
    );
};

export default ShareTargetModal;