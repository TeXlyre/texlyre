// src/contexts/LSPConfigContext.tsx
import { t } from '@/i18n';
import type React from 'react';
import { createContext, useCallback, useEffect, useState, useRef, type ReactNode } from 'react';

import { useSettings } from '../hooks/useSettings';
import { genericLSPService } from '../services/GenericLSPService';
import type { LSPClientConfig } from '@codemirror/lsp-client';

interface LSPConfig {
    id: string;
    name: string;
    enabled: boolean;
    fileExtensions: string[];
    languageIdMap?: Record<string, string>;
    transportConfig: {
        type: 'websocket' | 'worker';
        url?: string;
        workerPath?: string;
        contentLength?: boolean;
    };
    clientConfig: string;
}

interface LSPConfigContextType {
    configs: LSPConfig[];
    addConfig: (config: LSPConfig) => void;
    updateConfig: (id: string, updates: Partial<LSPConfig>) => void;
    removeConfig: (id: string) => void;
    getConfigsForFile: (fileName: string) => LSPConfig[];
}

export const LSPConfigContext = createContext<LSPConfigContextType>({
    configs: [],
    addConfig: () => { },
    updateConfig: () => { },
    removeConfig: () => { },
    getConfigsForFile: () => [],
});

interface LSPConfigProviderProps {
    children: ReactNode;
}

export const LSPConfigProvider: React.FC<LSPConfigProviderProps> = ({ children }) => {
    const { batchGetSettings, updateSetting, registerSetting } = useSettings();
    const [configs, setConfigs] = useState<LSPConfig[]>([]);
    const hasRegisteredRef = useRef(false);

    useEffect(() => {
        if (hasRegisteredRef.current) return;
        hasRegisteredRef.current = true;

        const batchedSettings = batchGetSettings(['generic-lsp-configs']);
        const settingValue = batchedSettings['generic-lsp-configs'];

        let storedConfigs: LSPConfig[] = [];

        if (typeof settingValue === 'string') {
            try {
                storedConfigs = JSON.parse(settingValue);
            } catch {
                storedConfigs = [];
            }
        } else if (Array.isArray(settingValue)) {
            storedConfigs = settingValue;
        }

        console.log(`[LSPConfigContext] Loaded ${storedConfigs.length} LSP configurations`);

        registerSetting({
            id: 'generic-lsp-configs',
            category: t('LSP'),
            subcategory: t('Generic LSP'),
            type: 'codemirror',
            label: t('LSP Configurations'),
            description: t('Stored LSP server configurations (JSON array)'),
            defaultValue: '[]',
            liveUpdate: false,
        });

        setConfigs(storedConfigs);

        storedConfigs.forEach(config => {
            try {
                const clientConfig = JSON.parse(config.clientConfig) as LSPClientConfig;
                genericLSPService.registerConfig({
                    id: config.id,
                    name: config.name,
                    enabled: config.enabled,
                    fileExtensions: config.fileExtensions,
                    languageIdMap: config.languageIdMap,
                    transportConfig: config.transportConfig,
                    clientConfig,
                });
            } catch (error) {
                console.error(`[LSPConfigContext] Invalid LSP config for ${config.id}:`, error);
            }
        });
    }, [registerSetting, batchGetSettings]);

    const saveConfigs = useCallback((newConfigs: LSPConfig[]) => {
        updateSetting('generic-lsp-configs', newConfigs);
    }, [updateSetting]);

    const addConfig = useCallback((config: LSPConfig) => {
        setConfigs(prev => {
            const updated = [...prev, config];
            saveConfigs(updated);
            return updated;
        });

        try {
            const clientConfig = JSON.parse(config.clientConfig) as LSPClientConfig;
            genericLSPService.registerConfig({
                id: config.id,
                name: config.name,
                enabled: config.enabled,
                fileExtensions: config.fileExtensions,
                languageIdMap: config.languageIdMap,
                transportConfig: config.transportConfig,
                clientConfig,
            });
        } catch (error) {
            console.error('Invalid client config:', error);
        }
    }, [saveConfigs]);

    const updateConfig = useCallback((id: string, updates: Partial<LSPConfig>) => {
        setConfigs(prev => {
            const updated = prev.map(c => c.id === id ? { ...c, ...updates } : c);
            saveConfigs(updated);
            return updated;
        });

        try {
            const serverConfigUpdates: Record<string, any> = {};

            if (updates.name !== undefined) serverConfigUpdates.name = updates.name;
            if (updates.enabled !== undefined) serverConfigUpdates.enabled = updates.enabled;
            if (updates.fileExtensions !== undefined) serverConfigUpdates.fileExtensions = updates.fileExtensions;
            if (updates.transportConfig !== undefined) serverConfigUpdates.transportConfig = updates.transportConfig;

            if (updates.clientConfig !== undefined) {
                serverConfigUpdates.clientConfig = JSON.parse(updates.clientConfig) as LSPClientConfig;
            }

            genericLSPService.updateConfig(id, serverConfigUpdates);
        } catch (error) {
            console.error('Invalid client config:', error);
        }
    }, [saveConfigs]);

    const removeConfig = useCallback((id: string) => {
        setConfigs(prev => {
            const updated = prev.filter(c => c.id !== id);
            saveConfigs(updated);
            return updated;
        });
        genericLSPService.unregisterConfig(id);
    }, [saveConfigs]);

    const getConfigsForFile = useCallback((fileName: string): LSPConfig[] => {
        const ext = fileName.split('.').pop()?.toLowerCase();
        if (!ext) return [];

        return configs.filter(c => c.enabled && c.fileExtensions.includes(ext));
    }, [configs]);

    return (
        <LSPConfigContext.Provider value={{ configs, addConfig, updateConfig, removeConfig, getConfigsForFile }}>
            {children}
        </LSPConfigContext.Provider>
    );
};