import { t } from '@/i18n';
import type { Setting } from '@/contexts/SettingsContext';

export const bibtexViewerSettings: Setting[] = [
  {
    id: 'bibtex-viewer-auto-tidy',
    category: t("Viewers"),
    subcategory: t("BibTeX Editor"),
    type: 'checkbox',
    label: t("Auto-tidy on open"),
    description: t("Automatically tidy BibTeX files when they are opened"),
    defaultValue: true
  },
  {
    id: 'bibtex-viewer-tidy-options',
    category: t("Viewers"),
    subcategory: t("BibTeX Editor"),
    type: 'select',
    label: t("Tidy preset"),
    description: t("Choose a preset for tidying BibTeX files"),
    defaultValue: 'standard',
    options: [
      { label: t("Minimal"), value: 'minimal' },
      { label: t("Standard"), value: 'standard' },
      { label: t("Strict"), value: 'strict' }]

  }];