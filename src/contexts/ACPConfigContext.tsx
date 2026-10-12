// src/contexts/ACPConfigContext.tsx
import {
	createContext,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	type ReactNode,
} from 'react';
import type React from 'react';

import { createNamedLogger } from '@/logging';
import { useSettings } from '../hooks/useSettings';
import { genericACPService } from '../services/GenericACPService';
import type { ACPServerConfig } from '../types/acp';
import {
	moveConfig,
	parseAcpConfigs,
	upsertConfig,
	withoutDisabled,
} from '../utils/toolConfigUtils';

const moduleLog = createNamedLogger('ACPConfigContext');

export const ACP_CONFIGS_SETTING = 'generic-acp-configs';
export const ACP_DISABLED_CONFIGS_SETTING = 'generic-acp-disabled-configs';

interface ACPConfigContextType {
	configs: ACPServerConfig[];
	disabledConfigs: ACPServerConfig[];
	addConfigs: (configs: ACPServerConfig[]) => void;
	addConfig: (config: ACPServerConfig) => void;
	updateConfig: (id: string, updates: Partial<ACPServerConfig>) => void;
	removeConfig: (id: string) => void;
	setConfigEnabled: (id: string, enabled: boolean) => void;
}

export const ACPConfigContext = createContext<ACPConfigContextType>({
	configs: [],
	disabledConfigs: [],
	addConfigs: () => {},
	addConfig: () => {},
	updateConfig: () => {},
	removeConfig: () => {},
	setConfigEnabled: () => {},
});

interface ACPConfigProviderProps {
	children: ReactNode;
}

export const ACPConfigProvider: React.FC<ACPConfigProviderProps> = ({
	children,
}) => {
	const { getSetting, updateSetting } = useSettings();
	const registeredConfigIdsRef = useRef<Set<string>>(new Set());
	const lastSerializedConfigsRef = useRef<Map<string, string>>(new Map());

	const settingValue = getSetting(ACP_CONFIGS_SETTING)?.value;
	const disabledSettingValue = getSetting(ACP_DISABLED_CONFIGS_SETTING)?.value;

	const disabledConfigs = useMemo(
		() => parseAcpConfigs(disabledSettingValue),
		[disabledSettingValue],
	);

	const storedConfigs = useMemo(
		() => withoutDisabled(parseAcpConfigs(settingValue), disabledConfigs),
		[settingValue, disabledConfigs],
	);

	const configs = storedConfigs;

	useEffect(() => {
		moduleLog.info(`Loaded ${storedConfigs.length} agent configurations`);
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

			if (registeredConfigIdsRef.current.has(config.id)) {
				genericACPService.updateConfig(config.id, config);
			} else {
				genericACPService.registerConfig(config);
			}
		});

		registeredConfigIdsRef.current.forEach((id) => {
			if (!nextIds.has(id)) {
				genericACPService.unregisterConfig(id);
			}
		});

		registeredConfigIdsRef.current = nextIds;
		lastSerializedConfigsRef.current = nextSerialized;
	}, [storedConfigs]);

	const saveConfigs = useCallback(
		(active: ACPServerConfig[], disabled: ACPServerConfig[]) => {
			updateSetting(ACP_CONFIGS_SETTING, active);
			updateSetting(ACP_DISABLED_CONFIGS_SETTING, disabled);
		},
		[updateSetting],
	);

	const addConfigs = useCallback(
		(incoming: ACPServerConfig[]) => {
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
		(config: ACPServerConfig) => addConfigs([config]),
		[addConfigs],
	);

	const updateConfig = useCallback(
		(id: string, updates: Partial<ACPServerConfig>) => {
			const apply = (list: ACPServerConfig[]) =>
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
			genericACPService.unregisterConfig(id);
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

	return (
		<ACPConfigContext.Provider
			value={{
				configs,
				disabledConfigs,
				addConfigs,
				addConfig,
				updateConfig,
				removeConfig,
				setConfigEnabled,
			}}
		>
			{children}
		</ACPConfigContext.Provider>
	);
};
