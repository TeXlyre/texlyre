// extras/viewers/pdf/settings.ts
import type { Setting } from '@/contexts/SettingsContext';

export const pdfViewerSettings: Setting[] = [
	{
		id: 'pdf-viewer-auto-scale',
		category: 'Viewers',
		subcategory: 'PDF Viewer',
		type: 'checkbox',
		label: 'Auto-scale documents',
		description: 'Automatically scale PDF documents to fit the viewer',
		defaultValue: true,
	},
	{
		id: 'pdf-viewer-rendering-quality',
		category: 'Viewers',
		subcategory: 'PDF Viewer',
		type: 'select',
		label: 'Rendering quality',
		description: 'Set the quality of PDF rendering',
		defaultValue: 'high',
		options: [
			{ label: 'Low', value: 'low' },
			{ label: 'Medium', value: 'medium' },
			{ label: 'High', value: 'high' },
		],
	},
];
