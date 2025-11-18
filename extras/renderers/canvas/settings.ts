import { t } from '@/i18n';
import type { Setting } from '@/contexts/SettingsContext';

export const getCanvasRendererSettings = (): Setting[] => [
  {
    id: 'canvas-renderer-enable',
    category: t("Renderers"),
    subcategory: t("Canvas Output"),
    type: 'checkbox',
    label: t("Use Canvas Renderer"),
    description: t("Use the canvas renderer for high-performance rendering of large documents"),
    defaultValue: true
  },
  {
    id: 'canvas-renderer-initial-zoom',
    category: t("Renderers"),
    subcategory: t("Canvas Output"),
    type: 'select',
    label: t("Initial zoom level"),
    description: t("Set the initial zoom level for canvas documents"),
    defaultValue: '100',
    options: [
      { label: t("25%"), value: '25' },
      { label: t("50%"), value: '50' },
      { label: t("75%"), value: '75' },
      { label: t("100%"), value: '100' },
      { label: t("125%"), value: '125' },
      { label: t("150%"), value: '150' },
      { label: t("200%"), value: '200' },
      { label: t("300%"), value: '300' },
      { label: t("400%"), value: '400' },
      { label: t("500%"), value: '500' }]

  }];