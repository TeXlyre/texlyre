// extras/backup/gitea/GiteaBackupPlugin.ts
import type { BackupPlugin } from '@/plugins/PluginInterface';
import GiteaBackupModal from './GiteaBackupModal';
import { giteaBackupService } from './GiteaBackupService';
import GiteaBackupStatusIndicator from './GiteaBackupStatusIndicator';
import { GiteaIcon } from './Icon';
import { getGiteaBackupSettings } from './settings';

const giteaBackupPlugin: BackupPlugin = {
    id: 'gitea-backup',
    name: 'Gitea',
    version: '1.0.0',
    type: 'backup',
    icon: GiteaIcon,
    get settings() {
        return getGiteaBackupSettings();
    },

    canHandle: (backupType: string): boolean => {
        return backupType === 'gitea';
    },

    renderStatusIndicator: GiteaBackupStatusIndicator,
    renderModal: GiteaBackupModal,
    getService: () => giteaBackupService,
};

export default giteaBackupPlugin;