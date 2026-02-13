// extras/lsp/jabref/JabRefLSPPlugin.ts
import type { LSPPlugin, LSPPanelProps } from '@/plugins/PluginInterface';
import { JabRefIcon } from './Icon';
import { getJabrefLSPSettings } from './settings';
import { genericLSPService } from '@/services/GenericLSPService';
import { createJabRefLSP } from './JabRefLSP';

export const PLUGIN_NAME = 'JabRef LSP';
export const PLUGIN_VERSION = '0.1.0';

const jabrefLSP = createJabRefLSP();

const jabrefLSPPlugin: LSPPlugin = {
	id: 'jabref-lsp',
	name: PLUGIN_NAME,
	version: PLUGIN_VERSION,
	type: 'lsp' as const,
	icon: JabRefIcon,
	get settings() {
		return getJabrefLSPSettings();
	},

	updateServerUrl(url: string): void {
		jabrefLSP.updateServerUrl(this.id, url);
	},

	getTransportConfig() {
		return jabrefLSP.getTransportConfig();
	},

	async getBibliographyEntries() {
		return jabrefLSP.getBibliographyEntries(this.id, () => this.getConnectionStatus());
	},

	getSupportedFileTypes(): string[] {
		return ['tex', 'latex', 'typ', 'bib', 'bibtex'];
	},

	getSupportedLanguages(): string[] {
		return ['latex', 'typst', 'bibtex'];
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

	renderPanel: (props: LSPPanelProps) => {
		return null;
	},
};

// TODO (fabawi): This will trigger whether JabRef is enabled or not. Not good
jabrefLSP.ensureRegistered({
	id: jabrefLSPPlugin.id,
	name: jabrefLSPPlugin.name,
	getSupportedFileTypes: () => jabrefLSPPlugin.getSupportedFileTypes(),
});

export default jabrefLSPPlugin;
