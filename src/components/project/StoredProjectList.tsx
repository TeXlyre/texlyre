// src/components/project/StoredProjectList.tsx
import type React from 'react';
import { useState } from 'react';

import { t } from '@/i18n';
import type { StorageDashboardProject } from '../../types/storage';
import type { Project } from '../../types/projects';
import { formatDate, formatLastModified } from '../../utils/dateUtils';
import {
	ChevronDownIcon,
	ChevronRightIcon,
	FolderIcon,
	FolderImportIcon,
	TrashIcon,
	UnlinkIcon,
	SyncIcon,
} from '../common/Icons';

export const storageProjectKey = (project: StorageDashboardProject): string =>
	`${project.providerId}:${project.storageProjectId}`;

export interface StoredProjectListProps {
	projects: StorageDashboardProject[];
	localProjects: Project[];
	providerNames: Record<string, string>;
	ownedProviderIds: Set<string>;
	busyIds: Set<string>;
	selectionMode: boolean;
	selectedKeys: Set<string>;
	onSelect: (key: string, selected: boolean) => void;
	onRestore: (project: StorageDashboardProject) => void;
	onOpenLocal: (project: Project) => void;
	onReconnect: (project: StorageDashboardProject) => void;
	onDisconnect: (projects: StorageDashboardProject[]) => void;
	onRemoveRemote: (projects: StorageDashboardProject[]) => void;
}

const StoredProjectList: React.FC<StoredProjectListProps> = ({
	projects,
	localProjects,
	providerNames,
	ownedProviderIds,
	busyIds,
	selectionMode,
	selectedKeys,
	onSelect,
	onRestore,
	onOpenLocal,
	onReconnect,
	onDisconnect,
	onRemoveRemote,
}) => {
	const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
	const localById = new Map(
		localProjects.map((project) => [project.id, project]),
	);

	return (
		<div className='ui-list'>
			{projects.map((project) => {
				const key = storageProjectKey(project);
				const local = localById.get(project.localProjectId);
				const busy = busyIds.has(key);
				const expanded = expandedKeys.has(key);
				const disconnected = project.status === 'disconnected';
				const canDisconnect =
					!!local && !disconnected && project.status !== 'error';
				const canRemove =
					ownedProviderIds.has(project.providerId) &&
					project.canDeleteRemote === true &&
					project.status !== 'local-only' &&
					project.status !== 'error' &&
					project.status !== 'unavailable' &&
					project.status !== 'checking';
				return (
					<div key={key} className='project-panel-remote-item'>
						<div className='project-panel-external-row'>
							{selectionMode && (
								<input
									type='checkbox'
									checked={selectedKeys.has(key)}
									onChange={(event) => onSelect(key, event.target.checked)}
									aria-label={t('Select {name}', { name: project.name })}
									disabled={busy}
								/>
							)}
							<button
								type='button'
								className='ui-icon-button'
								data-variant='subtle'
								data-size='xs'
								onClick={() =>
									setExpandedKeys((current) => {
										const next = new Set(current);
										if (next.has(key)) next.delete(key);
										else next.add(key);
										return next;
									})
								}
								aria-expanded={expanded}
								title={
									expanded
										? t('Collapse project details')
										: t('Expand project details')
								}
								aria-label={
									expanded
										? t('Collapse project details')
										: t('Expand project details')
								}
							>
								{expanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
							</button>
							<div
								className='project-panel-project-copy ui-list-content'
								title={project.name}
							>
								<strong>{project.name}</strong>
								<span
									className='project-panel-item-meta'
									title={formatDate(project.updatedAt)}
								>
									{busy
										? t('Working...')
										: formatLastModified(project.updatedAt)}{' '}
									·{' '}
									{disconnected
										? t('Disconnected')
										: project.remoteOnly
											? t('Remote only')
											: t('Local and remote')}
								</span>
							</div>
							{!selectionMode && (
								<div className='ui-list-actions'>
									{local && (
										<button
											type='button'
											className='ui-icon-button'
											data-variant='subtle'
											title={t('Open local project')}
											aria-label={t('Open local project')}
											onClick={() => onOpenLocal(local)}
											disabled={busy}
										>
											<FolderIcon />
										</button>
									)}
									{!local && (
										<button
											type='button'
											className='ui-icon-button'
											data-variant='subtle'
											title={t('Restore & Open')}
											aria-label={t('Restore & Open')}
											onClick={() => onRestore(project)}
											disabled={busy}
										>
											<FolderImportIcon />
										</button>
									)}
									{local && disconnected && (
										<button
											type='button'
											className='ui-icon-button'
											data-variant='subtle'
											title={t('Reconnect to remote storage')}
											aria-label={t('Reconnect to remote storage')}
											onClick={() => onReconnect(project)}
											disabled={busy}
										>
											<SyncIcon />
										</button>
									)}
									{canDisconnect && (
										<button
											type='button'
											className='ui-icon-button'
											data-variant='subtle'
											title={t('Disconnect from remote storage')}
											aria-label={t('Disconnect from remote storage')}
											onClick={() => onDisconnect([project])}
											disabled={busy}
										>
											<UnlinkIcon />
										</button>
									)}
									{canRemove && (
										<button
											type='button'
											className='ui-icon-button'
											data-variant='subtle'
											title={t('Delete from remote storage')}
											aria-label={t('Delete from remote storage')}
											onClick={() => onRemoveRemote([project])}
											disabled={busy}
										>
											<TrashIcon />
										</button>
									)}
								</div>
							)}
						</div>
						{expanded && (
							<div className='project-panel-remote-details ui-note'>
								<div>{project.description || t('No description')}</div>
								<div>
									{t('Storage provider')}:{' '}
									{providerNames[project.providerId] || project.providerId}
								</div>
								<div>
									{t('Status')}:{' '}
									{disconnected
										? t('Disconnected')
										: project.remoteOnly
											? t('Remote only')
											: t('Local and remote')}
								</div>
								<div>
									{t('Type')}: {project.type}
								</div>
								{project.tags.length > 0 && (
									<div>
										{t('Tags')}: {project.tags.join(', ')}
									</div>
								)}
								<div>
									{t('Created')}: {formatDate(project.createdAt)}
								</div>
								<div>
									{t('Last Modified: {lastModified}', {
										lastModified: formatDate(project.updatedAt),
									})}
								</div>
								{project.lastSync && (
									<div>
										{t('Last storage sync: {date}', {
											date: formatDate(project.lastSync),
										})}
									</div>
								)}
							</div>
						)}
					</div>
				);
			})}
		</div>
	);
};

export default StoredProjectList;
