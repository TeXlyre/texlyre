// src/contexts/LSPConfigContext.tsx
import type React from 'react';
import { createContext, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { LSPClientConfig } from '@codemirror/lsp-client';

import { useSettings } from '../hooks/useSettings';
import { genericLSPService } from '../services/GenericLSPService';

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
    const { getSetting, updateSetting } = useSettings();
    const [configs, setConfigs] = useState<LSPConfig[]>([]);
    const registeredConfigIdsRef = useRef<Set<string>>(new Set());
    const lastSerializedConfigsRef = useRef<Map<string, string>>(new Map());

    const settingValue = getSetting('generic-lsp-configs')?.value;

    const storedConfigs = useMemo(() => {
        if (typeof settingValue === 'string') {
            try {
                return JSON.parse(settingValue) as LSPConfig[];
            } catch {
                return [];
            }
        } else if (Array.isArray(settingValue)) {
            return settingValue as LSPConfig[];
        }

        return [];
    }, [settingValue]);

    useEffect(() => {
        console.log(`[LSPConfigContext] Loaded ${storedConfigs.length} LSP configurations`);
        setConfigs(storedConfigs);
    }, [storedConfigs]);

    useEffect(() => {
        const nextIds = new Set<string>();
        const nextSerialized = new Map<string, string>();

        storedConfigs.forEach(config => {
            nextIds.add(config.id);

            const serialized = JSON.stringify(config);
            nextSerialized.set(config.id, serialized);

            if (lastSerializedConfigsRef.current.get(config.id) === serialized) {
                return;
            }

            try {
                const clientConfig = JSON.parse(config.clientConfig) as LSPClientConfig;
                const registration = {
                    id: config.id,
                    name: config.name,
                    enabled: config.enabled,
                    fileExtensions: config.fileExtensions,
                    languageIdMap: config.languageIdMap,
                    transportConfig: config.transportConfig,
                    clientConfig,
                };

                if (registeredConfigIdsRef.current.has(config.id)) {
                    genericLSPService.updateConfig(config.id, registration);
                } else {
                    genericLSPService.registerConfig(registration);
                }
            } catch (error) {
                console.error(`[LSPConfigContext] Invalid LSP config for ${config.id}:`, error);
            }
        });

        registeredConfigIdsRef.current.forEach(id => {
            if (!nextIds.has(id)) {
                genericLSPService.unregisterConfig(id);
            }
        });

        registeredConfigIdsRef.current = nextIds;
        lastSerializedConfigsRef.current = nextSerialized;
    }, [storedConfigs]);

    const saveConfigs = useCallback((newConfigs: LSPConfig[]) => {
        setConfigs(newConfigs);
        updateSetting('generic-lsp-configs', newConfigs);
    }, [updateSetting]);

    const addConfig = useCallback((config: LSPConfig) => {
        const updated = [...configs, config];
        saveConfigs(updated);
    }, [configs, saveConfigs]);

    const updateConfig = useCallback((id: string, updates: Partial<LSPConfig>) => {
        const updated = configs.map(c => c.id === id ? { ...c, ...updates } : c);
        saveConfigs(updated);
    }, [configs, saveConfigs]);

    const removeConfig = useCallback((id: string) => {
        const updated = configs.filter(c => c.id !== id);
        saveConfigs(updated);
        genericLSPService.unregisterConfig(id);
    }, [configs, saveConfigs]);

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