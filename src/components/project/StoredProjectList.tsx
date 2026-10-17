// src/components/project/StoredProjectList.tsx
import type React from 'react';

import { t } from '@/i18n';
import type { StorageDashboardProject } from '../../types/storage';
import { formatDate, formatLastModified } from '../../utils/dateUtils';
import { DownloadIcon } from '../common/Icons';

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
		<section className='ui-panel' data-role='stored-projects'>
			<div className='ui-panel-header'>
				<h3 className='ui-panel-title' data-size='body'>
					{t('Stored projects')}
				</h3>
				<span className='ui-meta'>
					{t(
						'Available from remote storage; contents download only when restored.',
					)}
				</span>
			</div>
			<div className='ui-list' data-gap='xs' data-padding='sm'>
				{projects.map((project) => {
					const busy = busyIds.has(project.storageProjectId);
					return (
						<div
							key={`${project.providerId}:${project.storageProjectId}`}
							className='ui-list-item'
							data-align='center'
							data-justify='between'
							data-gap='sm'
						>
							<div className='ui-list-content' data-grow='true'>
								<strong>{project.name}</strong>
								{project.description && <span>{project.description}</span>}
								<span className='ui-meta' title={formatDate(project.updatedAt)}>
									{t('Updated {date}', {
										date: formatLastModified(project.updatedAt),
									})}
								</span>
							</div>
							<span className='ui-badge' data-variant='label'>
								{busy ? t('Restoring') : t('Stored')}
							</span>
							<button
								type='button'
								className='button primary'
								disabled={busy}
								onClick={() => onRestore(project)}
							>
								<DownloadIcon />
								{busy ? t('Restoring...') : t('Restore & Open')}
							</button>
						</div>
					);
				})}
			</div>
		</section>
	);
};

export default StoredProjectList;
