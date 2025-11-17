// extras/viewers/image/settings.ts
import { t } from '@/i18n';
import type { Setting } from '@/contexts/SettingsContext';

export const getImageViewerSettings = (): Setting[] => [
  {
    id: 'image-viewer-auto-center',
    category: t("Viewers"),
    subcategory: t("Image Viewer"),
    type: 'checkbox',
    label: t("Auto-center images"),
    description: t("Automatically center images when they are loaded"),
    defaultValue: true
  },
  {
    id: 'image-viewer-quality',
    category: t("Viewers"),
    subcategory: t("Image Viewer"),
    type: 'select',
    label: t("Image quality"),
    description: t("Set the quality of image rendering"),
    defaultValue: 'high',
    options: [
      { label: t("Low (Pixelated)"), value: 'low' },
      { label: t("Medium (Crisp Edges)"), value: 'medium' },
      { label: t("High (Auto)"), value: 'high' }]

  },
  {
    id: 'image-viewer-enable-panning',
    category: t("Viewers"),
    subcategory: t("Image Viewer"),
    type: 'checkbox',
    label: t("Enable panning"),
    description: t("Allow dragging images to pan around when zoomed"),
    defaultValue: true
  },
  {
    id: 'image-viewer-enable-filters',
    category: t("Viewers"),
    subcategory: t("Image Viewer"),
    type: 'checkbox',
    label: t("Enable filters"),
    description: t("Allow brightness and contrast adjustments"),
    defaultValue: true
  }];