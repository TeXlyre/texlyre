import type { Setting } from '../../../src/contexts/SettingsContext';

export const canvasRendererSettings: Setting[] = [
    {
        id: 'canvas-renderer-enable',
        category: 'Renderers',
        subcategory: 'Canvas Output',
        type: 'checkbox',
        label: 'Use Canvas Renderer',
        description: 'Use the canvas renderer for high-performance rendering of large documents',
        defaultValue: true,
    },
    {
        id: 'canvas-renderer-initial-zoom',
        category: 'Renderers',
        subcategory: 'Canvas Output',
        type: 'select',
        label: 'Initial zoom level',
        description: 'Set the initial zoom level for canvas documents',
        defaultValue: '100',
        options: [
            { label: '25%', value: '25' },
            { label: '50%', value: '50' },
            { label: '75%', value: '75' },
            { label: '100%', value: '100' },
            { label: '125%', value: '125' },
            { label: '150%', value: '150' },
            { label: '200%', value: '200' },
            { label: '300%', value: '300' },
            { label: '400%', value: '400' },
            { label: '500%', value: '500' },
        ],
    },
];