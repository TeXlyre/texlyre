// extras/backup/GitHubBackupPlugin.ts
import type { BackupPlugin } from '../../../src/plugins/PluginInterface';
import GitHubBackupModal from './GitHubBackupModal';
import { gitHubBackupService } from './GitHubBackupService';
import GitHubBackupStatusIndicator from './GitHubBackupStatusIndicator';
import { GitHubIcon } from './Icon';

const gitHubBackupPlugin: BackupPlugin = {
	id: 'github-backup',
	name: 'GitHub',
	version: '1.0.0',
	type: 'backup',
	icon: GitHubIcon,

	canHandle: (backupType: string): boolean => {
		return backupType === 'github';
	},

	renderStatusIndicator: GitHubBackupStatusIndicator,
	renderModal: GitHubBackupModal,
	getService: () => gitHubBackupService,
};

export default gitHubBackupPlugin;
