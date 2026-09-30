// src/components/project/ProjectExportModal.tsx
import type React from 'react';
import { useState } from 'react';

import { t } from '@/i18n';
import {
	type ExportOptions,
	accountExportService,
} from '../../services/AccountExportService';
import type { Project } from '../../types/projects';
import { formatDate } from '../../utils/dateUtils';
import {
	ExportIcon,
	FileIcon,
	FileTextIcon,
	ZipFileIcon,
} from '../common/Icons';
import Modal from '../common/Modal';

interface ProjectExportModalProps {
	isOpen: boolean;
	onClose: () => void;
	selectedProjects: Project[];
}

const ProjectExportModal: React.FC<ProjectExportModalProps> = ({
	isOpen,
	onClose,
	selectedProjects,
}) => {
	const [exportFormat, setExportFormat] = useState<'texlyre' | 'files-only'>(
		'texlyre',
	);
	const [includeDocuments, setIncludeDocuments] = useState(true);
	const [includeFiles, setIncludeFiles] = useState(true);
	const [includeTemporaryFiles, setIncludeTemporaryFiles] = useState(false);
	const [isExporting, setIsExporting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const handleExport = async () => {
		if (selectedProjects.length === 0) return;

		setIsExporting(true);
		setError(null);

		try {
			const options: ExportOptions = {
				includeAccount: false,
				includeDocuments: exportFormat === 'texlyre' ? includeDocuments : false,
				includeFiles,
				includeTemporaryFiles,
				format: exportFormat,
				projectIds: selectedProjects.map((p) => p.id),
			};

			await accountExportService.exportProjects(
				selectedProjects.map((p) => p.id),
				options,
			);

			onClose();
		} catch (error) {
			setError(error instanceof Error ? error.message : t('Export failed'));
		} finally {
			setIsExporting(false);
		}
	};

	const handleClose = () => {
		setError(null);
		setIsExporting(false);
		onClose();
	};

	return (
		<Modal
			isOpen={isOpen}
			onClose={handleClose}
			title={t('Export Projects')}
			icon={ZipFileIcon}
			size='medium'
		>
			<div className='ui-stack' data-gap='md'>
				{error && (
					<div className='ui-message' data-tone='error'>
						{error}
					</div>
				)}

				<div className='ui-message' data-tone='info'>
					<p>
						{t('Export {count} project in your preferred format.', {
							count: selectedProjects.length,
						})}
					</p>
				</div>

				<div className='ui-list' data-scroll='short'>
					{selectedProjects.map((project) => (
						<div
							key={project.id}
							className='ui-list-item'
							data-appearance='flat'
							data-padding='sm'
						>
							<strong>{project.name}</strong>
							<div className='ui-note'>
								{project.description || t('No description')}
							</div>
							<div className='ui-meta'>
								{t('Last Modified: {lastModified}', {
									lastModified: formatDate(project.updatedAt),
								})}
							</div>
						</div>
					))}
				</div>

				<section className='ui-stack' data-gap='sm'>
					<h3 className='ui-section-title'>{t('Export Format')}</h3>

					<div className='ui-stack' data-gap='sm'>
						<label
							className='ui-choice-card'
							data-direction='row'
							data-selected={exportFormat === 'texlyre' ? 'true' : undefined}
						>
							<input
								type='radio'
								name='exportFormat'
								value='texlyre'
								checked={exportFormat === 'texlyre'}
								onChange={() => setExportFormat('texlyre')}
							/>
							<FileTextIcon />
							<div className='ui-stack' data-gap='xs'>
								<strong>{t('TeXlyre Format')}</strong>
								<p className='ui-note'>
									{t(
										'Complete project export including documents, collaboration data, and files. Can be imported back into TeXlyre.',
									)}
								</p>
							</div>
						</label>

						<label
							className='ui-choice-card'
							data-direction='row'
							data-selected={exportFormat === 'files-only' ? 'true' : undefined}
						>
							<input
								type='radio'
								name='exportFormat'
								value='files-only'
								checked={exportFormat === 'files-only'}
								onChange={() => setExportFormat('files-only')}
							/>
							<FileIcon />
							<div className='ui-stack' data-gap='xs'>
								<strong>{t('Files Only')}</strong>
								<p className='ui-note'>
									{t(
										'Export only the files from your projects in a simple folder structure. Compatible with any application.',
									)}
								</p>
							</div>
						</label>
					</div>
				</section>

				<div className='ui-stack' data-gap='sm'>
					{exportFormat === 'texlyre' && (
						<>
							<label className='checkbox-control'>
								<input
									type='checkbox'
									checked={includeDocuments}
									onChange={(e) => setIncludeDocuments(e.target.checked)}
									disabled={isExporting}
								/>
								<span>{t('Include documents and collaboration data')}</span>
							</label>
							<label className='checkbox-control'>
								<input
									type='checkbox'
									checked={includeFiles}
									onChange={(e) => setIncludeFiles(e.target.checked)}
									disabled={isExporting}
								/>
								<span>{t('Include project files')}</span>
							</label>
						</>
					)}

					<label className='checkbox-control'>
						<input
							type='checkbox'
							checked={includeTemporaryFiles}
							onChange={(e) => setIncludeTemporaryFiles(e.target.checked)}
							disabled={isExporting}
						/>
						<span>{t('Include cache and temporary files')}</span>
					</label>
				</div>

				{exportFormat === 'files-only' && selectedProjects.length > 1 && (
					<div className='ui-message' data-tone='warning'>
						{t(
							'Files will be organized by project name in separate folders. Documents are not included in files-only export.',
						)}
					</div>
				)}
			</div>

			<div
				className='ui-actions'
				data-variant='modal'
				data-align='end'
				data-cross='stretch'
			>
				<button
					type='button'
					className='button secondary'
					onClick={handleClose}
					disabled={isExporting}
				>
					{t('Cancel')}
				</button>
				<button
					type='button'
					className='button primary'
					onClick={handleExport}
					disabled={isExporting || (!includeDocuments && !includeFiles)}
				>
					{isExporting ? (
						t('Exporting...')
					) : (
						<>
							<ExportIcon />
							{t('Export {count} Project', { count: selectedProjects.length })}
						</>
					)}
				</button>
			</div>
		</Modal>
	);
};

export default ProjectExportModal;
