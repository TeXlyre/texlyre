// extras/bibliography/zotero/ZoteroBibliographyPlugin.ts
import type { BibliographyPlugin } from '@/plugins/PluginInterface';
import { ZoteroIcon } from './Icon';
import { getZoteroSettings } from './settings';
import { zoteroService } from './ZoteroService';
import ZoteroPanel from './ZoteroPanel';

export const PLUGIN_NAME = 'Zotero';
export const PLUGIN_VERSION = '1.0.0';

const zoteroBibliographyPlugin: BibliographyPlugin = {
    id: 'zotero-bibliography',
    name: PLUGIN_NAME,
    version: PLUGIN_VERSION,
    type: 'bibliography' as const,
    icon: ZoteroIcon,

    get settings() {
        return getZoteroSettings();
    },

    async getBibliographyEntries() {
        const urlHash = window.location.hash.substring(1);
        const fragments = urlHash.split('/');
        const yjsFragment = fragments.find(f => f.startsWith('yjs='));
        const projectId = yjsFragment ? yjsFragment.slice(4) : undefined;

        return zoteroService.getBibliographyEntries(projectId);
    },

    getSupportedFileTypes(): string[] {
        return ['tex', 'latex', 'typ', 'typst', 'bib', 'bibtex'];
    },

    isEnabled(): boolean {
        return true;
    },

    getConnectionStatus(): 'connected' | 'connecting' | 'disconnected' | 'error' {
        return zoteroService.getConnectionStatus();
    },

    getStatusMessage(): string {
        const status = this.getConnectionStatus();
        switch (status) {
            case 'connected': return 'Connected to Zotero';
            case 'connecting': return 'Connecting to Zotero...';
            case 'error': return 'Failed to connect to Zotero';
            default: return '';
        }
    },

    renderPanel: ZoteroPanel,
};

export { zoteroService };
export default zoteroBibliographyPlugin;