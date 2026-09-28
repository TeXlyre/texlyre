// src/components/project/ProjectDeleteModal.tsx
import type React from 'react';
import { useState } from 'react';

import { t } from '@/i18n';
import type { Project } from '../../types/projects';
import { formatDate } from '../../utils/dateUtils';
import Modal from '../common/Modal';

interface ProjectDeleteModalProps {
	isOpen: boolean;
	onClose: () => void;
	selectedProjects: Project[];
	onDeleteProjects: (projectIds: string[]) => Promise<void>;
}

const ProjectDeleteModal: React.FC<ProjectDeleteModalProps> = ({
	isOpen,
	onClose,
	selectedProjects,
	onDeleteProjects,
}) => {
	const [isDeleting, setIsDeleting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const handleDelete = async () => {
		if (selectedProjects.length === 0 || isDeleting) return;

		setIsDeleting(true);
		setError(null);

		try {
			const projectIds = selectedProjects.map((p) => p.id);
			await onDeleteProjects(projectIds);
			handleClose();
		} catch (error) {
			setError(error instanceof Error ? error.message : t('Delete failed'));
		} finally {
			setIsDeleting(false);
		}
	};

	const handleClose = () => {
		if (isDeleting) return;
		setError(null);
		setIsDeleting(false);
		onClose();
	};

	if (!isOpen) return null;

	return (
		<Modal
			isOpen={isOpen}
			onClose={handleClose}
			title={t('Delete Projects')}
			size='medium'
		>
			<div className='ui-stack' data-gap='md'>
				{error && (
					<div className='ui-message' data-tone='error'>
						{error}
					</div>
				)}

				<div className='ui-message' data-tone='warning'>
					<p>
						{t('Are you sure you want to delete {count} project?', {
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
							<div className='ui-note'>
								{t('Last Modified: {lastModified}', {
									lastModified: formatDate(project.updatedAt),
								})}
							</div>
						</div>
					))}
				</div>

				<div className='ui-message' data-tone='warning'>
					{t(
						'All documents, files, and collaboration data for these projects will be permanently deleted.',
					)}
				</div>
				<div className='ui-message' data-tone='warning'>
					{t('This action cannot be undone.')}
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
						disabled={isDeleting}
					>
						{t('Cancel')}
					</button>
					<button
						type='button'
						className='button danger'
						onClick={handleDelete}
						disabled={isDeleting}
					>
						{isDeleting
							? t('Deleting...')
							: t('Delete {count} Project', { count: selectedProjects.length })}
					</button>
				</div>
			</div>
		</Modal>
	);
};

export default ProjectDeleteModal;
