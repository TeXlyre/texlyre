// extras/viewers/milkdown/settings.ts
import { t } from '@/i18n';
import type { Setting } from '@/contexts/SettingsContext';

export const getMilkdownViewerSettings = (): Setting[] => [
	{
		id: 'milkdown-plugin-image-resolver',
		category: t('Viewers'),
		subcategory: t('Markdown Editor'),
		type: 'checkbox',
		label: t('Resolve local images'),
		description: t('Resolve and preview images referenced by relative paths'),
		defaultValue: true,
	},
	{
		id: 'milkdown-plugin-gfm',
		category: t('Viewers'),
		subcategory: t('Markdown Editor'),
		type: 'checkbox',
		label: t('GitHub Flavored Markdown'),
		description: t('Enable tables, strikethrough, task lists, and autolinks'),
		defaultValue: true,
	},
	{
		id: 'milkdown-plugin-table-block',
		category: t('Viewers'),
		subcategory: t('Markdown Editor'),
		type: 'checkbox',
		label: t('Table editing'),
		description: t('Enable the interactive table block editor'),
		defaultValue: true,
	},
	{
		id: 'milkdown-plugin-link-tooltip',
		category: t('Viewers'),
		subcategory: t('Markdown Editor'),
		type: 'checkbox',
		label: t('Link tooltip'),
		description: t('Show a tooltip for previewing and editing links'),
		defaultValue: true,
	},
	{
		id: 'milkdown-plugin-code-block',
		category: t('Viewers'),
		subcategory: t('Markdown Editor'),
		type: 'checkbox',
		label: t('Code blocks'),
		description: t('Enable code blocks'),
		defaultValue: true,
	},
	{
		id: 'milkdown-plugin-math-inline',
		category: t('Viewers'),
		subcategory: t('Markdown Editor'),
		type: 'checkbox',
		label: t('Inline math'),
		description: t('Render inline LaTeX math'),
		defaultValue: true,
	},
	{
		id: 'milkdown-text-direction',
		category: t('Viewers'),
		subcategory: t('Markdown Editor'),
		type: 'select',
		label: t('Editor text direction'),
		description: t('Control text direction within the editor'),
		defaultValue: 'auto',
		options: [
			{ label: t('Auto (follows app language)'), value: 'auto' },
			{ label: t('Left-to-Right (LTR)'), value: 'ltr' },
			{ label: t('Right-to-Left (RTL)'), value: 'rtl' },
		],
	},
];

export const getEnabledMilkdownPluginIds = (
	getSetting: (id: string) => Setting | undefined,
): Set<string> => {
	const enabled = new Set<string>();
	const ids = [
		'image-resolver',
		'gfm',
		'table-block',
		'link-tooltip',
		'code-block',
		'math-inline',
	];

	for (const id of ids) {
		if ((getSetting(`milkdown-plugin-${id}`)?.value as boolean) ?? true) {
			enabled.add(id);
		}
	}

	return enabled;
};
