// src/components/backup/BackupModal.tsx
import type React from 'react';
import { useEffect, useState } from 'react';

import { t } from '@/i18n';
import { useAuth } from '../../hooks/useAuth';
import { notificationService } from '../../services/NotificationService';
import { formatDate } from '../../utils/dateUtils';
import {
	DisconnectIcon,
	ExportIcon,
	FileSystemIcon,
	FolderIcon,
	ImportIcon,
	SettingsIcon,
	TrashIcon,
} from '../common/Icons';
import Modal from '../common/Modal';
import SettingsModal from '../settings/SettingsModal';

interface BackupStatus {
	isConnected: boolean;
	isEnabled: boolean;
	lastSync: number | null;
	status: 'idle' | 'syncing' | 'error';
	error?: string;
}

interface BackupActivity {
	id: string;
	type:
		| 'backup_start'
		| 'backup_complete'
		| 'backup_error'
		| 'import_start'
		| 'import_complete'
		| 'import_error';
	message: string;
	timestamp: number;
	data?: any;
}

interface BackupModalProps {
	isOpen: boolean;
	onClose: () => void;
	status: BackupStatus;
	activities: BackupActivity[];
	onRequestAccess: () => Promise<boolean>;
	onSynchronize: (projectId?: string) => Promise<void>;
	onExportToFileSystem: (projectId?: string) => Promise<void>;
	onImportChanges: (projectId?: string) => Promise<void>;
	onDisconnect: () => Promise<void>;
	onClearActivity: (id: string) => void;
	onClearAllActivities: () => void;
	onChangeDirectory: () => Promise<boolean>;
	currentProjectId?: string | null;
	isInEditor?: boolean;
}

const BackupModal: React.FC<BackupModalProps> = ({
	isOpen,
	onClose,
	status,
	activities = [],
	onRequestAccess,
	onSynchronize,
	onExportToFileSystem,
	onImportChanges,
	onDisconnect,
	onClearActivity,
	onClearAllActivities,
	onChangeDirectory,
	currentProjectId,
	isInEditor = false,
}) => {
	const [showSettings, setShowSettings] = useState(false);
	const [syncScope, setSyncScope] = useState<'current' | 'all'>('current');
	const [isOperating, setIsOperating] = useState(false);
	const { getProjectById } = useAuth();
	const [currentProjectName, setCurrentProjectName] = useState<string>('');

	useEffect(() => {
		const loadProjectName = async () => {
			if (currentProjectId) {
				try {
					const project = await getProjectById(currentProjectId);
					setCurrentProjectName(project?.name || 'Current project only');
				} catch (_error) {
					setCurrentProjectName('Current project only');
				}
			}
		};

		if (isInEditor && currentProjectId) {
			loadProjectName();
		}
	}, [currentProjectId, getProjectById, isInEditor]);

	const getStatusText = () => {
		if (!status.isConnected) return t('No backup folder');
		if (status.status === 'error') return t('Backup error');
		if (status.status === 'syncing') return t('Syncing...');
		if (status.lastSync) {
			return t('Last Sync: {date}', { date: formatDate(status.lastSync) });
		}
		return t('Ready to sync');
	};

	const getActivityIcon = (type: string) => {
		switch (type) {
			case 'backup_error':
			case 'import_error':
				return '❌';
			case 'backup_complete':
			case 'import_complete':
				return '✓';
			case 'backup_start':
				return '📤';
			case 'import_start':
				return '📥';
			default:
				return 'ℹ️';
		}
	};

	const getActivityTone = (type: string) => {
		switch (type) {
			case 'backup_error':
			case 'import_error':
				return 'error' as const;
			case 'backup_complete':
			case 'import_complete':
				return 'success' as const;
			case 'backup_start':
			case 'import_start':
				return 'info' as const;
			default:
				return 'info' as const;
		}
	};

	const handleExport = async () => {
		if (isOperating) return;

		setIsOperating(true);
		const projectId =
			isInEditor && syncScope === 'current' ? currentProjectId : undefined;
		const operationId = `backup-export-${Date.now()}`;

		try {
			const loadingMessage = projectId
				? t('Exporting {projectName}...', { projectName: currentProjectName })
				: t('Exporting all projects...');
			notificationService.showLoading(loadingMessage, operationId);

			await onExportToFileSystem(projectId || undefined);

			const successMessage = projectId
				? t('{projectName} exported successfully', {
						projectName: currentProjectName,
					})
				: t('All projects exported successfully');
			notificationService.showSuccess(successMessage, { operationId });
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : t('Unknown error');
			notificationService.showError(
				t('Backup export failed: {error}', { error: errorMessage }),
				{ operationId },
			);
		} finally {
			setIsOperating(false);
		}
	};

	const handleImport = async () => {
		if (isOperating) return;

		setIsOperating(true);
		const projectId =
			isInEditor && syncScope === 'current' ? currentProjectId : undefined;
		const operationId = `backup-import-${Date.now()}`;

		try {
			const loadingMessage = projectId
				? t('Importing changes for {projectName}...', {
						projectName: currentProjectName,
					})
				: t('Importing all changes...');
			notificationService.showLoading(loadingMessage, operationId);

			await onImportChanges(projectId || undefined);

			const successMessage = projectId
				? t('Changes imported for {projectName}', {
						projectName: currentProjectName,
					})
				: t('All changes imported successfully');
			notificationService.showSuccess(successMessage, { operationId });
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : t('Unknown error');
			notificationService.showError(
				t('Backup import failed: {error}', { error: errorMessage }),
				{ operationId },
			);
		} finally {
			setIsOperating(false);
		}
	};

	const handleRequestAccess = async () => {
		if (isOperating) return;

		setIsOperating(true);
		const operationId = `backup-connect-${Date.now()}`;

		try {
			notificationService.showLoading(
				t('Connecting to backup folder...'),
				operationId,
			);
			await onRequestAccess();
			notificationService.showSuccess(
				t('Backup folder connected successfully'),
				{
					operationId,
				},
			);
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : t('Unknown error');
			notificationService.showError(
				t('Failed to connect backup folder: {error}', { error: errorMessage }),
				{ operationId },
			);
		} finally {
			setIsOperating(false);
		}
	};

	const handleChangeDirectory = async () => {
		if (isOperating) return;

		setIsOperating(true);
		const operationId = `backup-change-dir-${Date.now()}`;

		try {
			notificationService.showLoading(
				t('Changing backup directory...'),
				operationId,
			);
			await onChangeDirectory();
			notificationService.showSuccess(
				t('Backup directory changed successfully'),
				{
					operationId,
				},
			);
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : t('Unknown error');
			notificationService.showError(
				t('Failed to change backup directory: {error}', {
					error: errorMessage,
				}),
				{ operationId },
			);
		} finally {
			setIsOperating(false);
		}
	};

	const handleDisconnect = async () => {
		if (isOperating) return;

		setIsOperating(true);
		const operationId = `backup-disconnect-${Date.now()}`;

		try {
			notificationService.showLoading(
				t('Disconnecting backup...'),
				operationId,
			);
			await onDisconnect();
			notificationService.showSuccess(t('Backup disconnected successfully'), {
				operationId,
			});
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : t('Unknown error');
			notificationService.showError(
				t('Failed to disconnect backup: {error}', { error: errorMessage }),
				{ operationId },
			);
		} finally {
			setIsOperating(false);
		}
	};

	return (
		<>
			<Modal
				isOpen={isOpen}
				onClose={onClose}
				title={t('File System Backup')}
				icon={FileSystemIcon}
				size='medium'
				headerActions={
					<button
						type='button'
						className='ui-icon-button'
						data-role='modal-close'
						data-variant='subtle'
						onClick={() => setShowSettings(true)}
						title={t('File System Settings')}
					>
						<SettingsIcon />
					</button>
				}
			>
				<div className='ui-stack' data-gap='lg'>
					<section
						className='ui-card ui-stack'
						data-gap='md'
						data-padding='md'
						data-surface='secondary'
					>
						<div className='ui-stack' data-gap='md'>
							<div className='ui-stack' data-gap='sm'>
								{!status.isConnected ? (
									<button
										type='button'
										className='button primary'
										onClick={handleRequestAccess}
										disabled={isOperating}
									>
										<FolderIcon />
										{isOperating ? t('Connecting...') : t('Connect Folder')}
									</button>
								) : (
									<>
										{isInEditor && (
											<div
												className='ui-card ui-stack'
												data-gap='sm'
												data-padding='sm'
											>
												<div className='ui-field-label'>
													{t('Backup Scope:')}
												</div>
												<div className='ui-actions' data-wrap='true'>
													<label className='checkbox-control'>
														<input
															type='radio'
															name='syncScope'
															value='current'
															checked={syncScope === 'current'}
															onChange={(e) =>
																setSyncScope(
																	e.target.value as 'current' | 'all',
																)
															}
															disabled={isOperating}
														/>

														<span>
															{t('Current project (')}
															{currentProjectName})
														</span>
													</label>
													<label className='checkbox-control'>
														<input
															type='radio'
															name='syncScope'
															value='all'
															checked={syncScope === 'all'}
															onChange={(e) =>
																setSyncScope(
																	e.target.value as 'current' | 'all',
																)
															}
															disabled={isOperating}
														/>

														<span>{t('All projects')}</span>
													</label>
												</div>
											</div>
										)}
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
												<button
													type='button'
													className='button secondary'
													onClick={handleExport}
													disabled={status.status === 'syncing' || isOperating}
												>
													<ExportIcon />
													{t('Export To PC')}
												</button>
												<button
													type='button'
													className='button secondary'
													onClick={handleImport}
													disabled={status.status === 'syncing' || isOperating}
												>
													<ImportIcon />
													{t('Import From PC')}
												</button>
											</div>
											<div
												className='ui-toolbar-actions'
												data-role='secondary'
												data-gap='xs'
											>
												<button
													type='button'
													className='button secondary icon-only'
													onClick={handleChangeDirectory}
													disabled={isOperating}
													title={t('Change backup folder')}
												>
													<FolderIcon />
												</button>
												<button
													type='button'
													className='button secondary icon-only'
													onClick={handleDisconnect}
													disabled={isOperating}
													title={t('Disconnect')}
												>
													<DisconnectIcon />
												</button>
											</div>
										</div>
									</>
								)}
							</div>
						</div>

						<div className='ui-list' data-gap='sm'>
							<div className='ui-meta' data-layout='row'>
								<strong>{t('File System Backup:')}</strong>{' '}
								{status.isConnected ? t('Connected') : t('Disconnected')}
							</div>
							{status.isConnected && (
								<div className='ui-meta' data-layout='row'>
									<strong>{t('Status: ')}</strong> {getStatusText()}
								</div>
							)}
							{status.error && (
								<div className='ui-message' data-tone='error'>
									{status.error}
								</div>
							)}
						</div>
					</section>

					{activities.length > 0 && (
						<div className='ui-list' data-gap='md'>
							<div className='ui-toolbar' data-justify='between' data-gap='sm'>
								<h3 className='ui-panel-title'>{t('Recent Activity')}</h3>
								<button
									type='button'
									className='button secondary'
									onClick={onClearAllActivities}
									title={t('Clear all activities')}
									disabled={isOperating}
								>
									<TrashIcon />
									{t('Clear All')}
								</button>
							</div>

							<div className='ui-list' data-gap='sm' data-scroll='medium'>
								{activities
									.slice(-10)
									.reverse()
									.map((activity) => (
										<div
											key={activity.id}
											className='ui-message ui-stack'
											data-tone={getActivityTone(activity.type)}
											data-density='compact'
											data-gap='xs'
										>
											<div className='ui-list-content'>
												<div className='ui-actions'>
													<span className='ui-icon'>
														{getActivityIcon(activity.type)}
													</span>
													<span className='ui-list-content' data-grow='true'>
														{activity.message}
													</span>
													<button
														type='button'
														aria-label={t('Dismiss activity')}
														className='ui-icon-button'
														data-variant='subtle'
														data-size='xs'
														onClick={() => onClearActivity(activity.id)}
														title={t('Dismiss activity')}
														disabled={isOperating}
													>
														<span aria-hidden='true'>×</span>
													</button>
												</div>
												<div className='ui-meta'>
													{formatDate(activity.timestamp)}
												</div>
											</div>
										</div>
									))}
							</div>
						</div>
					)}

					<div className='ui-message' data-tone='info'>
						<h3>{t('How File System Backup Works')}</h3>
						<div>
							<p>
								{t(
									'File system backup creates a copy of your local TeXlyre data on your PC that you can sync with cloud storage:',
								)}
							</p>
							<ul>
								<li>
									<strong>{t('Export: ')}</strong>&nbsp;
									{t('Forces all local data to be written to the file system')}
								</li>
								<li>
									<strong>{t('Import: ')}</strong>&nbsp;
									{t(
										'Loads changes from the file system into your local workspace',
									)}
								</li>
								<li>
									{t(
										'Sync the backup folder with cloud services like Dropbox, Google Drive, or OneDrive for cross-device access',
									)}
								</li>
								<li>
									{t(
										'All project data is organized in a structured folder hierarchy with documents and files',
									)}
								</li>
							</ul>
						</div>
					</div>
				</div>
			</Modal>

			<SettingsModal
				isOpen={showSettings}
				onClose={() => setShowSettings(false)}
				initialCategory={t('Backup')}
				initialSubcategory={t('File System')}
			/>
		</>
	);
};

export default BackupModal;
