// extras/viewers/image/settings.ts
import type { Setting } from "../../../src/contexts/SettingsContext";

export const imageViewerSettings: Setting[] = [
	{
		id: "image-viewer-auto-center",
		category: "Viewers",
		subcategory: "Image Viewer",
		type: "checkbox",
		label: "Auto-center images",
		description: "Automatically center images when they are loaded",
		defaultValue: true,
	},
	{
		id: "image-viewer-quality",
		category: "Viewers",
		subcategory: "Image Viewer",
		type: "select",
		label: "Image quality",
		description: "Set the quality of image rendering",
		defaultValue: "high",
		options: [
			{ label: "Low (Pixelated)", value: "low" },
			{ label: "Medium (Crisp Edges)", value: "medium" },
			{ label: "High (Auto)", value: "high" },
		],
	},
	{
		id: "image-viewer-enable-panning",
		category: "Viewers",
		subcategory: "Image Viewer",
		type: "checkbox",
		label: "Enable panning",
		description: "Allow dragging images to pan around when zoomed",
		defaultValue: true,
	},
	{
		id: "image-viewer-enable-filters",
		category: "Viewers",
		subcategory: "Image Viewer",
		type: "checkbox",
		label: "Enable filters",
		description: "Allow brightness and contrast adjustments",
		defaultValue: true,
	},
];
