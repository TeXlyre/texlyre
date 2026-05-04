// extras/renderers/canvas/settings.ts
import { t } from '@/i18n';
import type { Setting } from '@/contexts/SettingsContext';

export const getCanvasRendererSettings = (): Setting[] => [
  {
    id: 'canvas-renderer-enable',
    category: t('Renderers'),
    subcategory: t('Canvas Output'),
    type: 'checkbox',
    label: t('Use Canvas Renderer'),
    description: t('Use canvas renderer for live document rendering'),
    defaultValue: true
  },
  {
    id: 'canvas-renderer-initial-zoom',
    category: t('Renderers'),
    subcategory: t('Canvas Output'),
    type: 'select',
    label: t('Initial zoom level'),
    description: t('Set the initial zoom level for canvas documents'),
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
  },
  {
    id: 'canvas-renderer-text-selection',
    category: t('Renderers'),
    subcategory: t('Canvas Output'),
    type: 'checkbox',
    label: t('Enable text selection and SVG interaction'),
    description: t('Allow text selection in PDF output and interaction with embedded content in SVG output'),
    defaultValue: false
  },
  {
    id: 'canvas-renderer-annotations',
    category: t('Renderers'),
    subcategory: t('Canvas Output'),
    type: 'checkbox',
    label: t('Enable annotations and forms (PDF only)'),
    description: t('Allow interaction with PDF links, form fields, and annotations'),
    defaultValue: false
  }];
