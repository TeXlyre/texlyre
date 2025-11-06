// extras/renderers/pdf/settings.ts
import { t } from "@/i18n";
import type { Setting } from '@/contexts/SettingsContext';

export const pdfRendererSettings: Setting[] = [
{
  id: 'pdf-renderer-enable',
  category: t("Renderers"),
  subcategory: t("PDF Output"),
  type: 'checkbox',
  label: t("Use Enhanced PDF Renderer (pdf.js)"),
  description: t("Use the enhanced PDF renderer instead of the browser default"),
  defaultValue: true
},
{
  id: 'pdf-renderer-initial-zoom',
  category: t("Renderers"),
  subcategory: t("PDF Output"),
  type: 'select',
  label: t("Initial zoom level"),
  description: t("Set the initial zoom level for PDF documents"),
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
  id: 'pdf-renderer-text-selection',
  category: t("Renderers"),
  subcategory: t("PDF Output"),
  type: 'checkbox',
  label: t("Enable text selection"),
  description: t("Allow text selection and copying from PDF documents"),
  defaultValue: true
},
{
  id: 'pdf-renderer-annotations',
  category: t("Renderers"),
  subcategory: t("PDF Output"),
  type: 'checkbox',
  label: t("Show annotations"),
  description: t("Display interactive forms and annotations in PDF documents"),
  defaultValue: true
}];