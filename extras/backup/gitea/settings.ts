// extras/backup/gitea/settings.ts
import { t } from '@/i18n';
import type { Setting } from '@/contexts/SettingsContext';

export const getGiteaBackupSettings = (): Setting[] => [
	{
		id: 'gitea-backup-api-endpoint',
		category: t('Backup'),
		subcategory: t('Gitea'),
		type: 'text',
		label: t('API endpoint'),
		description: t('Gitea API endpoint (for self-hosted instances)'),
		defaultValue: 'https://gitea.com/api/v1',
	},
	{
		id: 'gitea-backup-default-branch',
		category: t('Backup'),
		subcategory: t('Gitea'),
		type: 'text',
		label: t('Default branch'),
		description: t('Default branch for new connections'),
		defaultValue: 'main',
	},
	{
		id: 'gitea-backup-default-commit-message',
		category: t('Backup'),
		subcategory: t('Gitea'),
		type: 'text',
		label: t('Default commit message'),
		description: t(
			'Template for commit messages. Use {date} for current date, {time} for current time',
		),
		defaultValue: '',
		forceLTR: false,
	},
	{
		id: 'gitea-backup-ignore-patterns',
		category: t('Backup'),
		subcategory: t('Gitea'),
		type: 'text',
		label: t('Ignore patterns'),
		description: t(
			'Comma-separated list of file patterns to exclude from backup (e.g., *.log,*.tmp)',
		),
		defaultValue: '*.log,*.tmp',
	},
	{
		id: 'gitea-backup-max-file-size',
		category: t('Backup'),
		subcategory: t('Gitea'),
		type: 'number',
		label: t('Max file size (MB)'),
		description: t('Skip files larger than this size'),
		defaultValue: 100,
	},
	{
		id: 'gitea-backup-request-timeout',
		category: t('Backup'),
		subcategory: t('Gitea'),
		type: 'number',
		label: t('Request timeout (seconds)'),
		description: t('API request timeout duration'),
		defaultValue: 30,
	},
	{
		id: 'gitea-backup-max-retry-attempts',
		category: t('Backup'),
		subcategory: t('Gitea'),
		type: 'number',
		label: t('Max retry attempts'),
		description: t('Maximum number of retry attempts for failed operations'),
		defaultValue: 3,
	},
	{
		id: 'gitea-backup-import-after-push',
		category: t('Backup'),
		subcategory: t('Gitea'),
		type: 'checkbox',
		label: t('Import after push'),
		description: t(
			'Automatically import from the repository after a successful push to reconcile local state with resolved conflicts',
		),
		defaultValue: true,
	},
	{
		id: 'gitea-backup-activity-history-limit',
		category: t('Backup'),
		subcategory: t('Gitea'),
		type: 'number',
		label: t('Activity history limit'),
		description: t('Maximum number of activities to keep in history'),
		defaultValue: 50,
	},
];
