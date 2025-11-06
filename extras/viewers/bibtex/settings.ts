import type { Setting } from '@/contexts/SettingsContext';

export const bibtexViewerSettings: Setting[] = [
	{
		id: 'bibtex-viewer-auto-tidy',
		category: 'Viewers',
		subcategory: 'BibTeX Editor',
		type: 'checkbox',
		label: 'Auto-tidy on open',
		description: 'Automatically tidy BibTeX files when they are opened',
		defaultValue: true,
	},
	{
		id: 'bibtex-viewer-tidy-options',
		category: 'Viewers',
		subcategory: 'BibTeX Editor',
		type: 'select',
		label: 'Tidy preset',
		description: 'Choose a preset for tidying BibTeX files',
		defaultValue: 'standard',
		options: [
			{ label: 'Minimal', value: 'minimal' },
			{ label: 'Standard', value: 'standard' },
			{ label: 'Strict', value: 'strict' },
		],
	},
];
