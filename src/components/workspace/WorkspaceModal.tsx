// src/components/workspace/WorkspaceModal.tsx
import type React from 'react';
import { useCallback, useEffect, useState } from 'react';

import { t } from '@/i18n';
import { fileHandlerService } from '../../services/FileHandlerService';
import { fileStoreService } from '../../services/FileStoreService';
import { gitFileSystemService } from '../../services/GitFileSystemService';
import {
	type WorkspaceActivity,
	workspaceActivityService,
} from '../../services/WorkspaceActivityService';
import {
	type WorkspaceStatus,
	workspaceService,
} from '../../services/WorkspaceService';
import { formatDate } from '../../utils/dateUtils';
import { DisconnectIcon, FolderIcon, FolderOpenIcon } from '../common/Icons';
import Modal from '../common/Modal';

interface WorkspaceModalProps {
	isOpen: boolean;
	onClose: () => void;
	status: WorkspaceStatus;
}

const getActivityIcon = (type: string): string => {
	if (type === 'permission-lost' || type === 'conflict') return '❌';
	if (type === 'annotations-dropped') return '⚠';
	return '✓';
};

const getActivityTone = (type: string) => {
	if (type === 'permission-lost' || type === 'conflict')
		return 'error' as const;
	if (type === 'annotations-dropped') return 'warning' as const;
	return 'success' as const;
};

const WorkspaceModal: React.FC<WorkspaceModalProps> = ({
	isOpen,
	onClose,
	status,
}) => {
	const [activity, setActivity] = useState<WorkspaceActivity[]>([]);
	const [error, setError] = useState<string | null>(null);
	const [isBusy, setIsBusy] = useState(false);
	const [cleanAnnotations, setCleanAnnotations] = useState(true);

	const loadActivity = useCallback(async () => {
		if (!status.projectId) return;
		setActivity(await workspaceActivityService.list(status.projectId));
	}, [status.projectId]);

	/* biome-ignore lint/correctness/useExhaustiveDependencies(isOpen): Opening the modal intentionally refreshes workspace settings that may have changed externally. */
	useEffect(() => {
		if (!status.projectId) return;
		setCleanAnnotations(
			fileHandlerService.getWorkspaceCleanAnnotations(status.projectId),
		);
	}, [isOpen, status.projectId]);

	useEffect(() => {
		if (!isOpen) return;
		void loadActivity();
		return workspaceActivityService.addListener(() => {
			void loadActivity();
		});
	}, [isOpen, loadActivity]);

	const run = async (action: () => Promise<unknown>) => {
		setError(null);
		setIsBusy(true);
		try {
			await action();
		} catch (actionError) {
			if ((actionError as Error)?.name === 'AbortError') return;
			setError(
				actionError instanceof Error
					? actionError.message
					: t('Folder action failed'),
			);
		} finally {
			setIsBusy(false);
		}
	};

	const changeCleanAnnotations = (clean: boolean) =>
		run(async () => {
			if (!status.projectId) return;
			fileHandlerService.setWorkspaceCleanAnnotations(status.projectId, clean);
			setCleanAnnotations(clean);

			const fileSystem = gitFileSystemService.get(status.projectId);
			const gitSettings = fileSystem.getSettings();
			if (gitSettings.storeGitOnDisk) {
				fileSystem.setGitCleanAnnotations(clean);
			}

			if (
				workspaceService.getStatus().projectId === status.projectId &&
				fileHandlerService.hasWorkspace() &&
				fileStoreService.getCurrentProjectId() === status.projectId
			) {
				const files = await fileStoreService.getAllFiles(false, false, true);
				await fileHandlerService.mirrorFiles(files);
			}

			if (gitSettings.storeGitOnDisk) {
				await fileSystem.syncGitToDisk();
			}
		});

	return (
		<Modal
			isOpen={isOpen}
			onClose={onClose}
			title={t('Folder Sync')}
			icon={FolderOpenIcon}
			size='medium'
		>
			<div className='ui-stack' data-gap='lg'>
				<section
					className='ui-card ui-stack'
					data-gap='md'
					data-padding='md'
					data-surface='secondary'
				>
					<div className='ui-stack' data-gap='sm'>
						<div
							className='ui-toolbar'
							data-width='full'
							data-justify='between'
							data-gap='md'
						>
							<div
								className='ui-toolbar-actions'
								data-role='primary'
								data-gap='sm'
							>
								{status.needsPermission ? (
									<button
										type='button'
										className='button primary'
										disabled={isBusy}
										onClick={() => run(() => workspaceService.reconnect())}
									>
										<FolderOpenIcon />
										{t('Grant Access')}
									</button>
								) : null}
							</div>
							<div
								className='ui-toolbar-actions'
								data-role='secondary'
								data-gap='xs'
							>
								<button
									type='button'
									className='button secondary icon-only'
									disabled={isBusy}
									onClick={() => run(() => workspaceService.changeFolder())}
									title={t('Change Folder')}
								>
									<FolderIcon />
								</button>
								<button
									type='button'
									className='button secondary icon-only'
									disabled={isBusy || !status.projectId}
									onClick={() => run(() => workspaceService.disconnect())}
									title={t('Disconnect')}
								>
									<DisconnectIcon />
								</button>
							</div>
						</div>
					</div>

					<label className='checkbox-control'>
						<input
							type='checkbox'
							checked={cleanAnnotations}
							disabled={isBusy || !status.projectId}
							onChange={(event) =>
								void changeCleanAnnotations(event.target.checked)
							}
						/>
						<span>{t('Clean annotations')}</span>
					</label>
					<p className='ui-note'>
						{t(
							'Remove TeXlyre annotation markers from mirrored folder files. Turn this off to mirror the exact annotated text.',
						)}
					</p>

					<div className='ui-list' data-gap='sm'>
						<div className='ui-panel-title'>
							<strong>{status.directoryName ?? t('No folder linked')}</strong>
						</div>
						<div className='ui-meta' data-layout='row'>
							<span>
								{status.needsPermission
									? t(
											'This project mirrors a folder, but access has not been granted in this session.',
										)
									: t(
											'{count} files are mirrored between this project and the folder.',
											{ count: status.fileCount },
										)}
							</span>
						</div>
						{status.lastSyncedAt ? (
							<div className='ui-meta'>
								{t('Last synced {date}', {
									date: formatDate(status.lastSyncedAt),
								})}
							</div>
						) : null}
						{error ? (
							<div className='ui-message' data-tone='error'>
								{error}
							</div>
						) : null}
					</div>
				</section>

				<div className='ui-list' data-gap='md'>
					<div className='ui-toolbar' data-justify='between' data-gap='sm'>
						<h3 className='ui-panel-title'>{t('Recent Activity')}</h3>
					</div>
					{activity.length === 0 ? (
						<p className='ui-note'>{t('No activity recorded yet')}</p>
					) : (
						<div className='ui-list' data-gap='sm' data-scroll='medium'>
							{activity
								.slice(-10)
								.reverse()
								.map((entry) => (
									<div
										key={entry.id}
										className='ui-message ui-stack'
										data-tone={getActivityTone(entry.type)}
										data-density='compact'
										data-gap='xs'
									>
										<div className='ui-actions'>
											<span className='ui-icon'>
												{getActivityIcon(entry.type)}
											</span>
											<span className='ui-list-content' data-grow='true'>
												{entry.message}
											</span>
										</div>
										<div className='ui-meta'>{formatDate(entry.timestamp)}</div>
									</div>
								))}
						</div>
					)}
				</div>
			</div>
		</Modal>
	);
};

export default WorkspaceModal;
