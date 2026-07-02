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
		description: t(
			'Ask the embedded TikZ editor to emit autosave updates while editing',
		),
		defaultValue: true,
	},
	{
		id: 'tikz-viewer-auto-save-file',
		category: t('Viewers'),
		subcategory: t('TikZ Editor'),
		type: 'checkbox',
		label: t('Auto-save to file'),
		description: t('Automatically persist autosave updates to the file system'),
		defaultValue: true,
	},
];
