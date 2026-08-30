// extras/backup/forgejo/settings.ts
import { t } from '@/i18n';
import type { Setting } from '@/contexts/SettingsContext';

export const getForgejoBackupSettings = (): Setting[] => [
	{
		id: 'forgejo-backup-api-endpoint',
		category: t('Backup'),
		subcategory: t('Forgejo'),
		type: 'text',
		label: t('API endpoint'),
		description: t(
			'Forgejo API endpoint (for Codeberg or self-hosted instances)',
		),
		defaultValue: 'https://codeberg.org/api/v1',
	},
	{
		id: 'forgejo-backup-default-branch',
		category: t('Backup'),
		subcategory: t('Forgejo'),
		type: 'text',
		label: t('Default branch'),
		description: t('Default branch for new connections'),
		defaultValue: 'main',
	},
	{
		id: 'forgejo-backup-default-commit-message',
		category: t('Backup'),
		subcategory: t('Forgejo'),
		type: 'text',
		label: t('Default commit message'),
		description: t(
			'Template for commit messages. Use {date} for current date, {time} for current time',
		),
		defaultValue: '',
		forceLTR: false,
	},
	{
		id: 'forgejo-backup-ignore-patterns',
		category: t('Backup'),
		subcategory: t('Forgejo'),
		type: 'text',
		label: t('Ignore patterns'),
		description: t(
			'Comma-separated list of file patterns to exclude from backup (e.g., *.log,*.tmp)',
		),
		defaultValue: '*.log,*.tmp',
	},
	{
		id: 'forgejo-backup-max-file-size',
		category: t('Backup'),
		subcategory: t('Forgejo'),
		type: 'number',
		label: t('Max file size (MB)'),
		description: t('Skip files larger than this size'),
		defaultValue: 100,
	},
	{
		id: 'forgejo-backup-request-timeout',
		category: t('Backup'),
		subcategory: t('Forgejo'),
		type: 'number',
		label: t('Request timeout (seconds)'),
		description: t('API request timeout duration'),
		defaultValue: 30,
	},
	{
		id: 'forgejo-backup-max-retry-attempts',
		category: t('Backup'),
		subcategory: t('Forgejo'),
		type: 'number',
		label: t('Max retry attempts'),
		description: t('Maximum number of retry attempts for failed operations'),
		defaultValue: 3,
	},
	{
		id: 'forgejo-backup-import-after-push',
		category: t('Backup'),
		subcategory: t('Forgejo'),
		type: 'checkbox',
		label: t('Import after push'),
		description: t(
			'Automatically import from the repository after a successful push to reconcile local state with resolved conflicts',
		),
		defaultValue: true,
	},
	{
		id: 'forgejo-backup-activity-history-limit',
		category: t('Backup'),
		subcategory: t('Forgejo'),
		type: 'number',
		label: t('Activity history limit'),
		description: t('Maximum number of activities to keep in history'),
		defaultValue: 50,
	},
];
