// src/contexts/TypesetterConfigContext.tsx
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
import { typesetterRegistryService } from '../services/TypesetterRegistryService';
import {
	genericTypesetterService,
	type TypesetterServerConfig,
} from '../services/GenericTypesetterService';
import {
	moveConfig,
	parseTypesetterConfigs,
	upsertConfig,
	withoutDisabled,
} from '../utils/toolConfigUtils';

export const TYPESETTER_CONFIGS_SETTING = 'generic-typesetter-configs';
export const TYPESETTER_DISABLED_CONFIGS_SETTING =
	'generic-typesetter-disabled-configs';

interface TypesetterConfigContextType {
	configs: TypesetterServerConfig[];
	disabledConfigs: TypesetterServerConfig[];
	addConfigs: (configs: TypesetterServerConfig[]) => void;
	addConfig: (config: TypesetterServerConfig) => void;
	updateConfig: (id: string, updates: Partial<TypesetterServerConfig>) => void;
	removeConfig: (id: string) => void;
	setConfigEnabled: (id: string, enabled: boolean) => void;
}

export const TypesetterConfigContext =
	createContext<TypesetterConfigContextType>({
		configs: [],
		disabledConfigs: [],
		addConfigs: () => {},
		addConfig: () => {},
		updateConfig: () => {},
		removeConfig: () => {},
		setConfigEnabled: () => {},
	});

interface TypesetterConfigProviderProps {
	children: ReactNode;
}

export const TypesetterConfigProvider: React.FC<
	TypesetterConfigProviderProps
> = ({ children }) => {
	const { getSetting, updateSetting } = useSettings();
	const [configs, setConfigs] = useState<TypesetterServerConfig[]>([]);
	const registeredIdsRef = useRef<Set<string>>(new Set());
	const lastSerializedRef = useRef<Map<string, string>>(new Map());

	const settingValue = getSetting(TYPESETTER_CONFIGS_SETTING)?.value;
	const disabledSettingValue = getSetting(
		TYPESETTER_DISABLED_CONFIGS_SETTING,
	)?.value;

	const disabledConfigs = useMemo(
		() => parseTypesetterConfigs(disabledSettingValue),
		[disabledSettingValue],
	);

	const storedConfigs = useMemo(
		() =>
			withoutDisabled(parseTypesetterConfigs(settingValue), disabledConfigs),
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

			if (previousSerialized.get(config.id) === serialized) {
				return;
			}

			if (previousIds.has(config.id)) {
				genericTypesetterService.updateConfig(config.id, config);
			} else {
				genericTypesetterService.registerConfig(config);
			}

			if (config.enabled) {
				typesetterRegistryService.register({
					id: config.id,
					label: config.name,
					source: 'chelys',
					projectType: config.projectType,
					projectGroup: config.projectGroup,
					inputExtensions: config.inputExtensions,
					inputFiles: config.inputFiles,
					outputFormats: config.outputFormats,
					transport: config.transportConfig,
					capabilities: config.capabilities,
					ui: config.ui,
				});
			} else {
				typesetterRegistryService.unregister(config.id);
			}
		});

		previousIds.forEach((id) => {
			if (!nextIds.has(id)) {
				genericTypesetterService.unregisterConfig(id);
				typesetterRegistryService.unregister(id);
			}
		});

		registeredIdsRef.current = nextIds;
		lastSerializedRef.current = nextSerialized;
	}, [storedConfigs]);

	const saveConfigs = useCallback(
		(active: TypesetterServerConfig[], disabled: TypesetterServerConfig[]) => {
			updateSetting(TYPESETTER_CONFIGS_SETTING, active);
			updateSetting(TYPESETTER_DISABLED_CONFIGS_SETTING, disabled);
		},
		[updateSetting],
	);

	const addConfigs = useCallback(
		(incoming: TypesetterServerConfig[]) => {
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
		(config: TypesetterServerConfig) => addConfigs([config]),
		[addConfigs],
	);

	const updateConfig = useCallback(
		(id: string, updates: Partial<TypesetterServerConfig>) => {
			const apply = (list: TypesetterServerConfig[]) =>
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
		<TypesetterConfigContext.Provider
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
		</TypesetterConfigContext.Provider>
	);
};
