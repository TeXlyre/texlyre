// extras/backup/forgejo/ForgejoBackupPlugin.ts
import type { BackupPlugin } from '@/plugins/PluginInterface';
import ForgejoBackupModal from './ForgejoBackupModal';
import { forgejoBackupService } from './ForgejoBackupService';
import ForgejoBackupStatusIndicator from './ForgejoBackupStatusIndicator';
import { ForgejoIcon } from './Icon';
import { getForgejoBackupSettings } from './settings';

const forgejoBackupPlugin: BackupPlugin = {
    id: 'forgejo-backup',
    name: 'Forgejo',
    version: '1.0.0',
    type: 'backup',
    icon: ForgejoIcon,
    get settings() {
        return getForgejoBackupSettings();
    },

    canHandle: (backupType: string): boolean => {
        return backupType === 'forgejo';
    },

    renderStatusIndicator: ForgejoBackupStatusIndicator,
    renderModal: ForgejoBackupModal,
    getService: () => forgejoBackupService,
};

export default forgejoBackupPlugin;