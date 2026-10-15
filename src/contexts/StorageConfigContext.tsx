// src/contexts/StorageConfigContext.tsx
import type React from 'react';
import {
	type ReactNode,
	createContext,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from 'react';

import { useSettings } from '../hooks/useSettings';
import { genericStorageService } from '../services/GenericStorageService';
import type { StorageConfigBlock } from '../types/storage';
import {
	moveConfig,
	parseStorageConfigs,
	upsertConfig,
	withoutDisabled,
} from '../utils/toolConfigUtils';

export const STORAGE_CONFIGS_SETTING = 'generic-storage-configs';
export const STORAGE_DISABLED_CONFIGS_SETTING =
	'generic-storage-disabled-configs';

interface StorageConfigContextType {
	configs: StorageConfigBlock[];
	disabledConfigs: StorageConfigBlock[];
	addConfigs: (configs: StorageConfigBlock[]) => void;
	addConfig: (config: StorageConfigBlock) => void;
	updateConfig: (id: string, updates: Partial<StorageConfigBlock>) => void;
	removeConfig: (id: string) => void;
	setConfigEnabled: (id: string, enabled: boolean) => void;
}

export const StorageConfigContext = createContext<StorageConfigContextType>({
	configs: [],
	disabledConfigs: [],
	addConfigs: () => {},
	addConfig: () => {},
	updateConfig: () => {},
	removeConfig: () => {},
	setConfigEnabled: () => {},
});

interface StorageConfigProviderProps {
	children: ReactNode;
}

export const StorageConfigProvider: React.FC<StorageConfigProviderProps> = ({
	children,
}) => {
	const { getSetting, updateSetting } = useSettings();
	const [configs, setConfigs] = useState<StorageConfigBlock[]>([]);
	const registeredIdsRef = useRef<Set<string>>(new Set());
	const lastSerializedRef = useRef<Map<string, string>>(new Map());

	const settingValue = getSetting(STORAGE_CONFIGS_SETTING)?.value;
	const disabledSettingValue = getSetting(
		STORAGE_DISABLED_CONFIGS_SETTING,
	)?.value;

	const disabledConfigs = useMemo(
		() => parseStorageConfigs(disabledSettingValue),
		[disabledSettingValue],
	);
	const storedConfigs = useMemo(
		() => withoutDisabled(parseStorageConfigs(settingValue), disabledConfigs),
		[settingValue, disabledConfigs],
	);

	useEffect(() => {
		setConfigs(storedConfigs);
	}, [storedConfigs]);

	useEffect(() => {
		const previousIds = registeredIdsRef.current;
		const previousSerialized = lastSerializedRef.current;
		const nextIds = new Set<string>();
		const nextSerialized = new Map<string, string>();

		storedConfigs.forEach((config) => {
			nextIds.add(config.id);
			const serialized = JSON.stringify(config);
			nextSerialized.set(config.id, serialized);
			if (previousSerialized.get(config.id) === serialized) return;

			if (previousIds.has(config.id)) {
				genericStorageService.updateConfig(config.id, config);
			} else {
				genericStorageService.registerConfig(config);
			}
		});

		previousIds.forEach((id) => {
			if (!nextIds.has(id)) genericStorageService.unregisterConfig(id);
		});

		registeredIdsRef.current = nextIds;
		lastSerializedRef.current = nextSerialized;
	}, [storedConfigs]);

	const saveConfigs = useCallback(
		(active: StorageConfigBlock[], disabled: StorageConfigBlock[]) => {
			updateSetting(STORAGE_CONFIGS_SETTING, active);
			updateSetting(STORAGE_DISABLED_CONFIGS_SETTING, disabled);
		},
		[updateSetting],
	);

	const addConfigs = useCallback(
		(incoming: StorageConfigBlock[]) => {
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
		(config: StorageConfigBlock) => addConfigs([config]),
		[addConfigs],
	);

	const updateConfig = useCallback(
		(id: string, updates: Partial<StorageConfigBlock>) => {
			const apply = (list: StorageConfigBlock[]) =>
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
			genericStorageService.unregisterConfig(id);
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
		<StorageConfigContext.Provider
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
		</StorageConfigContext.Provider>
	);
};
