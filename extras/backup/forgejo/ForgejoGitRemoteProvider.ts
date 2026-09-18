import { createGiteaCompatibleGitRemoteProvider } from '../gitea/GiteaGitRemoteProvider';
import { forgejoAPIService } from './ForgejoAPIService';

export const forgejoGitRemoteProvider = createGiteaCompatibleGitRemoteProvider({
	id: 'forgejo',
	apiName: 'Forgejo',
	displayName: 'Forgejo / Codeberg',
	defaultEndpoint: 'https://codeberg.org/api/v1',
	apiService: forgejoAPIService,
	historyPluginId: 'texlyre-forgejo-history',
	historyTokenSecretKey: 'forgejo-history-token',
	backupPluginId: 'texlyre-forgejo-backup',
	backupTokenSecretKey: 'forgejo-token',
	endpointSettingId: 'forgejo-backup-api-endpoint',
	timeoutSettingId: 'forgejo-backup-request-timeout',
});
