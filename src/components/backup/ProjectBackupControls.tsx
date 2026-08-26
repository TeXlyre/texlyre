// src/components/backup/ProjectBackupControls.tsx
import type React from 'react';
import { useState } from 'react';

import { t } from '@/i18n';
import { useDiskBackup } from '../../hooks/useDiskBackup';
import { ExportIcon, ImportIcon } from '../common/Icons';

interface ProjectBackupControlsProps {
	projectId: string;
	className?: string;
}

const ProjectBackupControls: React.FC<ProjectBackupControlsProps> = ({
	projectId,
	className = '',
}) => {
	const { status, synchronize, exportToFileSystem, importChanges } =
		useDiskBackup();
	const [isProjectSyncing, setIsProjectSyncing] = useState(false);

	const handleExport = async () => {
		setIsProjectSyncing(true);
		try {
			await exportToFileSystem(projectId);
		} finally {
			setIsProjectSyncing(false);
		}
	};

	const handleImport = async () => {
		setIsProjectSyncing(true);
		try {
			await importChanges(projectId);
		} finally {
			setIsProjectSyncing(false);
		}
	};

	if (!status.isConnected || !status.isEnabled) {
		return null;
	}

	const isSyncing = status.status === 'syncing' || isProjectSyncing;

	return (
		<div className={`project-backup-controls ${className}`}>
			<button
				className='action-button'
				onClick={handleExport}
				disabled={isSyncing}
				title={t('Export project to file system (write to PC)')}
			>
				<ExportIcon />
				<span className='backup-control-label'>{t('Export')}</span>
			</button>
			<button
				className='action-button'
				onClick={handleImport}
				disabled={isSyncing}
				title={t('Import changes from file system (read from PC)')}
			>
				<ImportIcon />
				<span className='backup-control-label'>{t('Import')}</span>
			</button>
		</div>
	);
};

export default ProjectBackupControls;
