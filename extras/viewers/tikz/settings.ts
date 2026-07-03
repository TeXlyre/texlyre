// extras/viewers/tikz/settings.ts
import { t } from '@/i18n';
import type { Setting } from '@/contexts/SettingsContext';

export const getTikzViewerSettings = (): Setting[] => [
	{
		id: 'tikz-viewer-auto-save-editor',
		category: t('Viewers'),
		subcategory: t('TikZ Editor'),
		type: 'checkbox',
		label: t('Auto-save in editor'),
		description: t('Automatically save changes in the TikZ editor'),
		defaultValue: true,
	},
	{
		id: 'tikz-viewer-auto-save-file',
		category: t('Viewers'),
		subcategory: t('TikZ Editor'),
		type: 'checkbox',
		label: t('Auto-save to file'),
		description: t('Automatically save changes to the file system'),
		defaultValue: true,
	},
	{
		id: 'tikz-viewer-theme',
		category: t('Viewers'),
		subcategory: t('TikZ Editor'),
		type: 'select',
		label: t('Theme'),
		description: t('Theme for the TikZ editor'),
		defaultValue: 'auto-app',
		options: [
			{ label: t('Auto (follows app theme)'), value: 'auto-app' },
			{ label: t('Light'), value: 'light' },
			{ label: t('Dark'), value: 'dark' },
		],
	},
];
