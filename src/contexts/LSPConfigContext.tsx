// src/contexts/LSPConfigContext.tsx
import type React from 'react';
import {
	createContext,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	type ReactNode,
} from 'react';
import type { LSPClientConfig } from '@codemirror/lsp-client';

import { createNamedLogger } from '@/logging';
import { useSettings } from '../hooks/useSettings';
import { genericLSPService } from '../services/GenericLSPService';
import type { LSPConfigBlock } from '../types/lsp';
import {
	moveConfig,
	parseLspConfigs,
	upsertConfig,
	withoutDisabled,
} from '../utils/toolConfigUtils';

const moduleLog = createNamedLogger('LSPConfigContext');

export const LSP_CONFIGS_SETTING = 'generic-lsp-configs';
export const LSP_DISABLED_CONFIGS_SETTING = 'generic-lsp-disabled-configs';

type LSPConfig = LSPConfigBlock;

interface LSPConfigContextType {
	configs: LSPConfig[];
	disabledConfigs: LSPConfig[];
	addConfigs: (configs: LSPConfig[]) => void;
	addConfig: (config: LSPConfig) => void;
	updateConfig: (id: string, updates: Partial<LSPConfig>) => void;
	removeConfig: (id: string) => void;
	setConfigEnabled: (id: string, enabled: boolean) => void;
	getConfigsForFile: (fileName: string) => LSPConfig[];
}

export const LSPConfigContext = createContext<LSPConfigContextType>({
	configs: [],
	disabledConfigs: [],
	addConfigs: () => {},
	addConfig: () => {},
	updateConfig: () => {},
	removeConfig: () => {},
	setConfigEnabled: () => {},
	getConfigsForFile: () => [],
});

interface LSPConfigProviderProps {
	children: ReactNode;
}

export const LSPConfigProvider: React.FC<LSPConfigProviderProps> = ({
	children,
}) => {
	const { getSetting, updateSetting } = useSettings();
	const [configs, setConfigs] = useState<LSPConfig[]>([]);
	const registeredConfigIdsRef = useRef<Set<string>>(new Set());
	const lastSerializedConfigsRef = useRef<Map<string, string>>(new Map());

	const settingValue = getSetting(LSP_CONFIGS_SETTING)?.value;
	const disabledSettingValue = getSetting(LSP_DISABLED_CONFIGS_SETTING)?.value;

	const disabledConfigs = useMemo(
		() => parseLspConfigs(disabledSettingValue),
		[disabledSettingValue],
	);

	const storedConfigs = useMemo(
		() => withoutDisabled(parseLspConfigs(settingValue), disabledConfigs),
		[settingValue, disabledConfigs],
	);

	useEffect(() => {
		moduleLog.info(`Loaded ${storedConfigs.length} LSP configurations`);
		setConfigs(storedConfigs);
	}, [storedConfigs]);

	useEffect(() => {
		const nextIds = new Set<string>();
		const nextSerialized = new Map<string, string>();

		storedConfigs.forEach((config) => {
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
				moduleLog.error(`Invalid LSP config for ${config.id}:`, error);
			}
		});

		registeredConfigIdsRef.current.forEach((id) => {
			if (!nextIds.has(id)) {
				genericLSPService.unregisterConfig(id);
			}
		});

		registeredConfigIdsRef.current = nextIds;
		lastSerializedConfigsRef.current = nextSerialized;
	}, [storedConfigs]);

	const saveConfigs = useCallback(
		(active: LSPConfig[], disabled: LSPConfig[]) => {
			updateSetting(LSP_CONFIGS_SETTING, active);
			updateSetting(LSP_DISABLED_CONFIGS_SETTING, disabled);
		},
		[updateSetting],
	);

	const addConfigs = useCallback(
		(incoming: LSPConfig[]) => {
			if (incoming.length === 0) return;

			const incomingIds = new Set(incoming.map((config) => config.id));

			saveConfigs(
				incoming.reduce((acc, config) => upsertConfig(acc, config), configs),
				disabledConfigs.filter((entry) => !incomingIds.has(entry.id)),
			);
		},
		[configs, disabledConfigs, saveConfigs],
	);

	const addConfig = useCallback(
		(config: LSPConfig) => addConfigs([config]),
		[addConfigs],
	);

	const updateConfig = useCallback(
		(id: string, updates: Partial<LSPConfig>) => {
			const apply = (list: LSPConfig[]) =>
				list.map((entry) =>
					entry.id === id ? { ...entry, ...updates } : entry,
				);

			saveConfigs(apply(configs), apply(disabledConfigs));
		},
		[configs, disabledConfigs, saveConfigs],
	);

	const removeConfig = useCallback(
		(id: string) => {
			saveConfigs(
				configs.filter((entry) => entry.id !== id),
				disabledConfigs.filter((entry) => entry.id !== id),
			);
			genericLSPService.unregisterConfig(id);
		},
		[configs, disabledConfigs, saveConfigs],
	);

	const setConfigEnabled = useCallback(
		(id: string, enabled: boolean) => {
			const source = enabled ? disabledConfigs : configs;
			const target = enabled ? configs : disabledConfigs;
			const moved = moveConfig(source, target, id);

			if (!moved) {
				updateConfig(id, { enabled });
				return;
			}

			const next = moved.to.map((entry) =>
				entry.id === id ? { ...entry, enabled } : entry,
			);

			saveConfigs(enabled ? next : moved.from, enabled ? moved.from : next);
		},
		[configs, disabledConfigs, saveConfigs, updateConfig],
	);

	const getConfigsForFile = useCallback(
		(fileName: string): LSPConfig[] => {
			const ext = fileName.split('.').pop()?.toLowerCase();
			if (!ext) return [];

			return configs.filter((c) => c.enabled && c.fileExtensions.includes(ext));
		},
		[configs],
	);

	return (
		<LSPConfigContext.Provider
			value={{
				configs,
				disabledConfigs,
				addConfigs,
				addConfig,
				updateConfig,
				removeConfig,
				setConfigEnabled,
				getConfigsForFile,
			}}
		>
			{children}
		</LSPConfigContext.Provider>
	);
};
