// extras/bibliography/openalex/OpenAlexBibliographyPlugin.ts
import type { BibliographyPlugin, BibliographyPanelProps } from '@/plugins/PluginInterface';
import type { BibEntry } from '@/types/bibliography';
import { OpenAlexIcon } from './Icon';
import { getOpenAlexSettings } from './settings';
import { openAlexService } from './OpenAlexService';
import type { OpenAlexFilters } from './OpenAlexAPIService';
import OpenAlexPanel from './OpenAlexPanel';

export const PLUGIN_NAME = 'OpenAlex';
export const PLUGIN_VERSION = '1.0.0';

let activeFilters: OpenAlexFilters = {};

const openAlexBibliographyPlugin: BibliographyPlugin = {
    id: 'openalex-bibliography',
    name: PLUGIN_NAME,
    version: PLUGIN_VERSION,
    type: 'bibliography' as const,
    searchMode: 'on-demand',
    icon: OpenAlexIcon,

    get settings() {
        return getOpenAlexSettings();
    },

    async getBibliographyEntries(query?: string, localEntries?: BibEntry[]) {
        return openAlexService.getBibliographyEntries(query, localEntries, activeFilters);
    },

    getSupportedFileTypes(): string[] {
        return ['tex', 'latex', 'typ', 'typst', 'bib', 'bibtex'];
    },

    isEnabled(): boolean {
        return true;
    },

    getConnectionStatus(): 'connected' | 'connecting' | 'disconnected' | 'error' {
        return openAlexService.getConnectionStatus();
    },

    getStatusMessage(): string {
        const status = this.getConnectionStatus();
        switch (status) {
            case 'connected': return 'Connected to OpenAlex';
            case 'connecting': return 'Connecting to OpenAlex...';
            case 'error': return 'Failed to connect to OpenAlex';
            default: return '';
        }
    },

    renderPanel: (props: BibliographyPanelProps) => {
        const handleFiltersChange = (filters: OpenAlexFilters) => {
            activeFilters = filters;
        };
        return OpenAlexPanel({ ...props, onFiltersChange: handleFiltersChange });
    },
};

export { openAlexService };
export default openAlexBibliographyPlugin;
