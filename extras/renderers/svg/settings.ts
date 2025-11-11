// extras/renderers/svg/settings.ts
import { t } from '@/i18n';
import type { Setting } from '@/contexts/SettingsContext';

export const svgRendererSettings: Setting[] = [
  {
    id: 'svg-renderer-enable',
    category: t("Renderers"),
    subcategory: t("SVG Output"),
    type: 'checkbox',
    label: t("Use Enhanced SVG Renderer"),
    description: t("Use the enhanced SVG renderer for vector graphics"),
    defaultValue: true
  },
  {
    id: 'svg-renderer-initial-zoom',
    category: t("Renderers"),
    subcategory: t("SVG Output"),
    type: 'select',
    label: t("Initial zoom level"),
    description: t("Set the initial zoom level for SVG documents"),
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

  },
  {
    id: 'svg-renderer-preserve-aspect-ratio',
    category: t("Renderers"),
    subcategory: t("SVG Output"),
    type: 'checkbox',
    label: t("Preserve aspect ratio"),
    description: t("Maintain aspect ratio when scaling SVG content"),
    defaultValue: true
  }];