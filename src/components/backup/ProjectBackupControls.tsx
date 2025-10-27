// src/components/backup/ProjectBackupControls.tsx
import { t } from "@/i18n";
import type React from 'react';
import { useState } from 'react';

import { useFileSystemBackup } from '../../hooks/useFileSystemBackup';
import { ExportIcon, ImportIcon } from '../common/Icons';

interface ProjectBackupControlsProps {
  projectId: string;
  className?: string;
}

const ProjectBackupControls: React.FC<ProjectBackupControlsProps> = ({
  projectId,
  className = ''
}) => {
  const { status, synchronize, exportToFileSystem, importChanges } =
  useFileSystemBackup();
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
        className="action-button"
        onClick={handleExport}
        disabled={isSyncing}
        title={t('Export project to file system (write to PC)')}>

				<ExportIcon />{t('Export')}

      </button>
			<button
        className="action-button"
        onClick={handleImport}
        disabled={isSyncing}
        title={t('Import changes from file system (read from PC)')}>

				<ImportIcon />{t('Import')}

      </button>
		</div>);

};

export default ProjectBackupControls;