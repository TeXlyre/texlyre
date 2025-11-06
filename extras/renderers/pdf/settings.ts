// extras/renderers/pdf/settings.ts
import type { Setting } from '@/contexts/SettingsContext';

export const pdfRendererSettings: Setting[] = [
	{
		id: 'pdf-renderer-enable',
		category: 'Renderers',
		subcategory: 'PDF Output',
		type: 'checkbox',
		label: 'Use Enhanced PDF Renderer (pdf.js)',
		description: 'Use the enhanced PDF renderer instead of the browser default',
		defaultValue: true,
	},
	{
		id: 'pdf-renderer-initial-zoom',
		category: 'Renderers',
		subcategory: 'PDF Output',
		type: 'select',
		label: 'Initial zoom level',
		description: 'Set the initial zoom level for PDF documents',
		defaultValue: '100',
		options: [
			{ label: '25%', value: '25' },
			{ label: '50%', value: '50' },
			{ label: '75%', value: '75' },
			{ label: '100%', value: '100' },
			{ label: '125%', value: '125' },
			{ label: '150%', value: '150' },
			{ label: '200%', value: '200' },
			{ label: '300%', value: '300' },
			{ label: '400%', value: '400' },
			{ label: '500%', value: '500' },
		],
	},
	{
		id: 'pdf-renderer-text-selection',
		category: 'Renderers',
		subcategory: 'PDF Output',
		type: 'checkbox',
		label: 'Enable text selection',
		description: 'Allow text selection and copying from PDF documents',
		defaultValue: true,
	},
	{
		id: 'pdf-renderer-annotations',
		category: 'Renderers',
		subcategory: 'PDF Output',
		type: 'checkbox',
		label: 'Show annotations',
		description: 'Display interactive forms and annotations in PDF documents',
		defaultValue: true,
	},
];
