// src/components/project/StoredProjectList.tsx
import type React from 'react';

import { t } from '@/i18n';
import type { StorageDashboardProject } from '../../types/storage';
import { formatDate, formatLastModified } from '../../utils/dateUtils';
import { FolderImportIcon } from '../common/Icons';

interface StoredProjectListProps {
	projects: StorageDashboardProject[];
	busyIds?: Set<string>;
	onRestore: (project: StorageDashboardProject) => void;
}

const StoredProjectList: React.FC<StoredProjectListProps> = ({
	projects,
	busyIds = new Set(),
	onRestore,
}) => {
	if (projects.length === 0) return null;

	return (
		<div className='ui-list'>
			{projects.map((project) => {
				const busy = busyIds.has(project.storageProjectId);
				return (
					<div
						key={`${project.providerId}:${project.storageProjectId}`}
						className='project-panel-external-row'
						title={project.description}
					>
						<div className='project-panel-project-copy ui-list-content'>
							<strong>{project.name}</strong>
							<span
								className='project-panel-item-meta'
								title={formatDate(project.updatedAt)}
							>
								{busy
									? t('Restoring...')
									: formatLastModified(project.updatedAt)}
							</span>
						</div>
						<div className='ui-list-actions'>
							<button
								type='button'
								className='ui-icon-button'
								data-variant='subtle'
								disabled={busy}
								onClick={() => onRestore(project)}
								title={busy ? t('Restoring...') : t('Restore & Open')}
								aria-label={busy ? t('Restoring...') : t('Restore & Open')}
							>
								<FolderImportIcon />
							</button>
						</div>
					</div>
				);
			})}
		</div>
	);
};

export default StoredProjectList;
