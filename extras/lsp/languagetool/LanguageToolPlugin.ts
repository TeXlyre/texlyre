// extras/lsp/languagetool/LanguageToolPlugin.ts
import type { LSPPlugin } from '@/plugins/PluginInterface';
import { getLanguageToolSettings } from './settings';

const isEnvEnabled = import.meta.env.VITE_ENABLE_LANGUAGE_TOOL === 'true';

function getStorageKey(): string {
    const userId = window.localStorage.getItem('texlyre-current-user');
    return userId ? `texlyre-user-${userId}-settings` : 'texlyre-settings';
}

function loadStoredSettings(): Record<string, unknown> {
    try {
        const settingsJson = window.localStorage.getItem(getStorageKey());
        if (!settingsJson) return {};
        const parsed = JSON.parse(settingsJson);
        const { _version, ...rest } = parsed as Record<string, unknown>;
        return rest;
    } catch {
        return {};
    }
}

function getSettingValue<T>(id: string, defaultValue: T): T {
    const stored = loadStoredSettings();
    const value = stored[id];
    return value === undefined ? defaultValue : (value as T);
}

const languageToolPlugin: LSPPlugin = {
    id: 'languagetool-lsp',
    name: 'LanguageTool',
    version: '1.0.0',
    type: 'lsp',

    get settings() {
        return getLanguageToolSettings();
    },

    isEnabled() {
        if (!isEnvEnabled) return false;
        return getSettingValue('languagetool-enabled', true);
    },

    getConnectionStatus() {
        return this.isEnabled() ? 'connected' : 'disconnected';
    },

    getStatusMessage() {
        if (!isEnvEnabled) {
            return 'Disabled by VITE_ENABLE_LANGUAGE_TOOL environment setting';
        }
        if (!this.isEnabled()) {
            return 'LanguageTool is disabled in user settings';
        }
        return 'LanguageTool is enabled';
    },

    getSupportedFileTypes(): string[] {
        return ['tex', 'latex', 'typ', 'typst', 'md', 'markdown', 'txt', 'bib', 'bibtex'];
    },

    getSupportedLanguages(): string[] {
        return ['plaintext', 'markdown', 'latex', 'typst', 'bibtex'];
    },

    getTransportConfig() {
        return {
            type: 'websocket',
            url: '',
        };
    },
};

export default languageToolPlugin;
