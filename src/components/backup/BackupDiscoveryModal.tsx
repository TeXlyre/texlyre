// src/components/backup/BackupDiscoveryModal.tsx
import { t } from '@/i18n';
import type React from 'react';
import { useState } from 'react';

import {
	type ImportableProject,
	projectImportService,
} from '../../services/ProjectImportService';
import { formatDate } from '../../utils/dateUtils';
import { ImportIcon } from '../common/Icons';
import Modal from '../common/Modal';

interface BackupDiscoveryModalProps {
	isOpen: boolean;
	onClose: () => void;
	rootHandle: FileSystemDirectoryHandle;
	discoveredProjects: ImportableProject[];
	onProjectsImported: () => void;
}

const BackupDiscoveryModal: React.FC<BackupDiscoveryModalProps> = ({
	isOpen,
	onClose,
	rootHandle,
	discoveredProjects,
	onProjectsImported,
}) => {
	const [selectedProjects, setSelectedProjects] = useState<Set<string>>(
		new Set(),
	);
	const [isImporting, setIsImporting] = useState(false);
	const [error, setError] = useState<string | null>(null);

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
		if (selectedProjects.size === discoveredProjects.length) {
			setSelectedProjects(new Set());
		} else {
			setSelectedProjects(new Set(discoveredProjects.map((p) => p.id)));
		}
	};

	const handleImport = async () => {
		if (selectedProjects.size === 0) return;

		try {
			setIsImporting(true);
			setError(null);

			const result = await projectImportService.importFromBackup(
				rootHandle,
				Array.from(selectedProjects),
				{
					makeCollaborator: true,
					conflictResolution: 'create-new' as const,
				},
			);

			if (result.errors.length > 0) {
				setError(
					t('Import completed with errors: {errors}', {
						errors: result.errors.map((e) => e.error).join(', ')
					}),
				);
			}

			if (result.imported.length > 0) {
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
		setSelectedProjects(new Set());
		setError(null);
		setIsImporting(false);
		onClose();
	};

	return (
		<Modal
			isOpen={isOpen}
			onClose={handleClose}
			title={t('Projects Found in Backup')}
			size="medium"
		>
			<div className="backup-discovery-modal">
				{error && (
					<div className="error-message" style={{ marginBottom: '1rem' }}>
						{error}
					</div>
				)}

				<div className="discovery-info">
					<p>
						{t('We found {count} project in your backup that are not on TeXlyre. Would you like to import them?', { count: discoveredProjects.length })}
					</p>
				</div>

				<div className="selection-header">
					<button
						className="button secondary small"
						onClick={handleSelectAll}
						disabled={isImporting}
					>
						{selectedProjects.size === discoveredProjects.length
							? t('Deselect All')
							: t('Select All')}
					</button>
				</div>

				<div className="projects-list">
					{discoveredProjects.map((project) => (
						<div
							key={project.id}
							className={`project-item ${selectedProjects.has(project.id) ? 'selected' : ''}`}
							onClick={() => !isImporting && handleProjectToggle(project.id)}
						>
							<input
								type="checkbox"
								checked={selectedProjects.has(project.id)}
								onChange={() => handleProjectToggle(project.id)}
								disabled={isImporting}
							/>
							<div className="project-details">
								<div className="project-name">{project.name}</div>
								<div className="project-description">
									{project.description || t('No description')}
								</div>
								<div className="project-meta">
									<span>{t(`Last Modified: {lastModified}`, { lastModified: formatDate(project.lastModified) })}</span>
								</div>
							</div>
						</div>
					))}
				</div>

				<div className="import-note">
					<ImportIcon />
					<span>
						{t('Projects will be imported as collaborations, preserving original ownership.')}
					</span>
				</div>

				<div className="modal-actions">
					<button
						type="button"
						className="button secondary"
						onClick={handleClose}
						disabled={isImporting}
					>
						{t('Not Now')}
					</button>
					<button
						type="button"
						className="button primary"
						onClick={handleImport}
						disabled={selectedProjects.size === 0 || isImporting}
					>
						{isImporting
							? t('Importing...')
							: t('Import {count} Project', { count: selectedProjects.size })}
					</button>
				</div>
			</div>
		</Modal>
	);
};

export default BackupDiscoveryModal;
