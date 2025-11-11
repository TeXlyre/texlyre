// extras/viewers/pdf/settings.ts
import { t } from '@/i18n';
import type { Setting } from '@/contexts/SettingsContext';

export const pdfViewerSettings: Setting[] = [
  {
    id: 'pdf-viewer-auto-scale',
    category: t("Viewers"),
    subcategory: t("PDF Viewer"),
    type: 'checkbox',
    label: t("Auto-scale documents"),
    description: t("Automatically scale PDF documents to fit the viewer"),
    defaultValue: true
  },
  {
    id: 'pdf-viewer-rendering-quality',
    category: t("Viewers"),
    subcategory: t("PDF Viewer"),
    type: 'select',
    label: t("Rendering quality"),
    description: t("Set the quality of PDF rendering"),
    defaultValue: 'high',
    options: [
      { label: t("Low"), value: 'low' },
      { label: t("Medium"), value: 'medium' },
      { label: t("High"), value: 'high' }]

  }];