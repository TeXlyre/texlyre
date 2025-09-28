// extras/renderers/svg/settings.ts
import type { Setting } from "../../../src/contexts/SettingsContext";

export const svgRendererSettings: Setting[] = [
    {
        id: "svg-renderer-enable",
        category: "Renderers",
        subcategory: "SVG Output",
        type: "checkbox",
        label: "Use Enhanced SVG Renderer",
        description: "Use the enhanced SVG renderer for vector graphics",
        defaultValue: true,
    },
    {
        id: "svg-renderer-initial-zoom",
        category: "Renderers",
        subcategory: "SVG Output",
        type: "select",
        label: "Initial zoom level",
        description: "Set the initial zoom level for SVG documents",
        defaultValue: "100",
        options: [
            { label: "25%", value: "25" },
            { label: "50%", value: "50" },
            { label: "75%", value: "75" },
            { label: "100%", value: "100" },
            { label: "125%", value: "125" },
            { label: "150%", value: "150" },
            { label: "200%", value: "200" },
            { label: "300%", value: "300" },
            { label: "400%", value: "400" },
            { label: "500%", value: "500" },
        ],
    },
    {
        id: "svg-renderer-preserve-aspect-ratio",
        category: "Renderers",
        subcategory: "SVG Output",
        type: "checkbox",
        label: "Preserve aspect ratio",
        description: "Maintain aspect ratio when scaling SVG content",
        defaultValue: true,
    },
];