// extras/bibliography/jabref/JabRefBibliographyPlugin.ts
import type { BibliographyPlugin, BibliographyPanelProps } from '@/plugins/PluginInterface';
import { JabRefIcon } from './Icon';
import { getJabrefLSPSettings } from './settings';
import { genericLSPService } from '@/services/GenericLSPService';
import { createJabRefLSP } from './JabRefLSP';

export const PLUGIN_NAME = 'JabRef';
export const PLUGIN_VERSION = '0.1.0';

const jabrefLSP = createJabRefLSP();

const jabrefBibliographyPlugin: BibliographyPlugin = {
	id: 'jabref-lsp',
	name: PLUGIN_NAME,
	version: PLUGIN_VERSION,
	type: 'bibliography' as const,
	icon: JabRefIcon,
	get settings() {
		return getJabrefLSPSettings();
	},

	updateServerUrl(url: string): void {
		jabrefLSP.updateServerUrl(this.id, url);
	},

	async getBibliographyEntries() {
		return jabrefLSP.getBibliographyEntries(this.id, () => this.getConnectionStatus());
	},

	getSupportedFileTypes(): string[] {
		return ['tex', 'latex', 'typ', 'bib', 'bibtex'];
	},

	isEnabled(): boolean {
		return true;
	},

	getConnectionStatus(): 'connected' | 'connecting' | 'disconnected' | 'error' {
		return genericLSPService.getConnectionStatus(this.id);
	},

	getStatusMessage(): string {
		const status = this.getConnectionStatus();
		switch (status) {
			case 'connected': return 'Connected to citation language server';
			case 'connecting': return 'Connecting to citation language server...';
			case 'error': return 'Failed to connect to citation language server';
			default: return '';
		}
	},

	renderPanel: (_props: BibliographyPanelProps) => {
		return null;
	},
};

jabrefLSP.ensureRegistered({
	id: jabrefBibliographyPlugin.id,
	name: jabrefBibliographyPlugin.name,
	getSupportedFileTypes: () => jabrefBibliographyPlugin.getSupportedFileTypes(),
});

export default jabrefBibliographyPlugin;