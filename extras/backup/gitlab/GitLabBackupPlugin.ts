import type { BackupPlugin } from '@/plugins/PluginInterface';
import GitLabBackupModal from './GitLabBackupModal';
import { gitLabBackupService } from './GitLabBackupService';
import GitLabBackupStatusIndicator from './GitLabBackupStatusIndicator';
import { GitLabIcon } from './Icon';

const gitLabBackupPlugin: BackupPlugin = {
    id: 'gitlab-backup',
    name: 'GitLab',
    version: '1.0.0',
    type: 'backup',
    icon: GitLabIcon,

    canHandle: (backupType: string): boolean => {
        return backupType === 'gitlab';
    },

    renderStatusIndicator: GitLabBackupStatusIndicator,
    renderModal: GitLabBackupModal,
    getService: () => gitLabBackupService,
};

export default gitLabBackupPlugin;