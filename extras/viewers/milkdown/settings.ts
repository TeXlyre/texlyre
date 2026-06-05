// extras/viewers/milkdown/settings.ts
import { t } from '@/i18n';
import type { Setting } from '@/contexts/SettingsContext';

export const getMilkdownViewerSettings = (): Setting[] => [
	{
		id: 'milkdown-viewer-default-view',
		category: t('Viewers'),
		subcategory: t('Markdown Editor'),
		type: 'select',
		label: t('Default view'),
		description: t('Which view to show when a Markdown file is opened'),
		defaultValue: 'visual',
		options: [
			{ label: t('Visual'), value: 'visual' },
			{ label: t('Text'), value: 'text' },
		],
	},
];
