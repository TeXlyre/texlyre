// extras/renderers/pdf_html_experimental/settings.ts
import type { Setting } from '@/contexts/SettingsContext';

export const pdfHtmlRendererSettings: Setting[] = [
	{
		id: 'pdfhtml-renderer-enable',
		category: 'Renderers',
		subcategory: 'PDF HTML Output',
		type: 'checkbox',
		label: 'Use Enhanced PDF HTML Renderer (pdf.js)',
		description:
			'Use the enhanced PDF HTML renderer instead of the browser default',
		defaultValue: false,
	},
];
