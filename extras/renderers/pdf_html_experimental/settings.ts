// extras/renderers/pdf_html_experimental/settings.ts
import { t } from '@/i18n';
import type { Setting } from '@/contexts/SettingsContext';

export const getPdfHtmlRendererSettings = (): Setting[] => [
  {
    id: 'pdfhtml-renderer-enable',
    category: t("Renderers"),
    subcategory: t("PDF HTML Output"),
    type: 'checkbox',
    label: t("Use Enhanced PDF HTML Renderer (pdf.js)"),
    description: t("Use the enhanced PDF HTML renderer instead of the browser default"),

    defaultValue: false
  }];