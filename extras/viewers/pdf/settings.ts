// extras/viewers/pdf/settings.ts
import { t } from '@/i18n';
import type { Setting } from '@/contexts/SettingsContext';

export const getPdfViewerSettings = (): Setting[] => [
  {
    id: 'pdf-viewer-auto-scale',
    category: t('Viewers'),
    subcategory: t('PDF Viewer'),
    type: 'checkbox',
    label: t('Auto-scale documents'),
    description: t('Automatically scale PDF documents to fit the viewer'),
    defaultValue: true
  },
  {
    id: 'pdf-viewer-rendering-quality',
    category: t('Viewers'),
    subcategory: t('PDF Viewer'),
    type: 'select',
    label: t('Rendering quality'),
    description: t('Set the quality of PDF rendering'),
    defaultValue: 'high',
    options: [
      { label: t('Low'), value: 'low' },
      { label: t('Medium'), value: 'medium' },
      { label: t('High'), value: 'high' }]

  },
  {
    id: 'pdf-viewer-initial-zoom',
    category: t('Viewers'),
    subcategory: t('PDF Viewer'),
    type: 'select',
    label: t('Initial zoom level'),
    description: t('Set the initial zoom level for PDF documents'),
    defaultValue: '100',
    options: [
      { label: t('25%'), value: '25' },
      { label: t('50%'), value: '50' },
      { label: t('75%'), value: '75' },
      { label: t('100%'), value: '100' },
      { label: t('125%'), value: '125' },
      { label: t('150%'), value: '150' },
      { label: t('200%'), value: '200' },
      { label: t('300%'), value: '300' },
      { label: t('400%'), value: '400' },
      { label: t('500%'), value: '500' }]

  }
];