// src/contexts/TypesetterConfigContext.tsx
import type React from 'react';
import {
	type ReactNode,
	createContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from 'react';

import { useSettings } from '../hooks/useSettings';
import { compilerRegistryService } from '../services/CompilerRegistryService';
import {
	genericTypesetterService,
	type TypesetterServerConfig,
} from '../services/GenericTypesetterService';
import type {
	CompilerInputFile,
	CompilerOutputFormat,
	CompilerTransportConfig,
	CompilerUIField,
	CompilerUIInfoSection,
	CompilerUIRenderer,
	CompilerUISchema,
	CompilerUISection,
	TranslatableText,
} from '../types/compilation';

interface TypesetterConfigContextType {
	configs: TypesetterServerConfig[];
}

export const TypesetterConfigContext =
	createContext<TypesetterConfigContextType>({
		configs: [],
	});

interface TypesetterConfigProviderProps {
	children: ReactNode;
}

interface StoredTypesetterConfig {
	id?: unknown;
	configId?: unknown;
	name?: unknown;
	enabled?: unknown;
	incrementalSync?: unknown;
	projectType?: unknown;
	projectGroup?: unknown;
	inputExtensions?: unknown;
	inputFiles?: unknown;
	outputFormats?: unknown;
	transportConfig?: unknown;
	transportType?: unknown;
	transportUrl?: unknown;
	capabilities?: unknown;
	hasOutline?: unknown;
	formatter?: unknown;
	ui?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function normalizeStringArray(value: unknown): string[] {
	if (!Array.isArray(value)) {
		return [];
	}

	return value.filter((item): item is string => typeof item === 'string');
}

function normalizeOutputFormats(value: unknown): CompilerOutputFormat[] {
	if (!Array.isArray(value)) {
		return [];
	}

	return value.flatMap((item) => {
		if (!isRecord(item)) {
			return [];
		}

		const { id, mimeType, rendererPluginId, outputType } = item;

		if (typeof id !== 'string' || typeof mimeType !== 'string') {
			return [];
		}

		return [
			{
				id,
				mimeType,
				...(typeof rendererPluginId === 'string' ? { rendererPluginId } : {}),
				...(typeof outputType === 'string' ? { outputType } : {}),
			},
		];
	});
}

function normalizeTranslatableText(value: unknown): TranslatableText | null {
	if (typeof value === 'string') {
		return value;
	}

	if (isRecord(value) && typeof value.key === 'string') {
		const params: Record<string, string> = {};
		if (isRecord(value.params)) {
			for (const [paramKey, paramValue] of Object.entries(value.params)) {
				if (typeof paramValue === 'string') {
					params[paramKey] = paramValue;
				}
			}
		}

		return Object.keys(params).length > 0
			? { key: value.key, params }
			: { key: value.key };
	}

	return null;
}

function normalizeInputFiles(value: unknown): CompilerInputFile[] {
	if (!Array.isArray(value)) {
		return [];
	}

	return value.flatMap((item) => {
		if (!isRecord(item) || typeof item.extension !== 'string') {
			return [];
		}

		const label = normalizeTranslatableText(item.label);

		return [
			{
				extension: item.extension,
				...(label !== null ? { label } : {}),
				...(typeof item.mimeType === 'string'
					? { mimeType: item.mimeType }
					: {}),
			},
		];
	});
}

function normalizeUIField(value: unknown): CompilerUIField | null {
	if (!isRecord(value)) {
		return null;
	}

	const { key, kind } = value;
	const label = normalizeTranslatableText(value.label);

	if (typeof key !== 'string' || label === null) {
		return null;
	}

	if (
		kind !== 'select' &&
		kind !== 'boolean' &&
		kind !== 'text' &&
		kind !== 'number'
	) {
		return null;
	}

	const options = Array.isArray(value.options)
		? value.options.flatMap((option) => {
				if (!isRecord(option) || typeof option.value !== 'string') {
					return [];
				}
				const optionLabel = normalizeTranslatableText(option.label);
				if (optionLabel === null) {
					return [];
				}
				return [{ label: optionLabel, value: option.value }];
			})
		: undefined;

	const help = normalizeTranslatableText(value.help);
	const sendAs = value.sendAs === 'format' ? 'format' : 'option';

	return {
		key,
		label,
		kind,
		sendAs,
		...(typeof value.defaultValue === 'string' ||
		typeof value.defaultValue === 'number' ||
		typeof value.defaultValue === 'boolean'
			? { defaultValue: value.defaultValue }
			: {}),
		...(options ? { options } : {}),
		...(help !== null ? { help } : {}),
	};
}

function normalizeUISection(value: unknown): CompilerUISection | null {
	if (!isRecord(value) || !Array.isArray(value.fields)) {
		return null;
	}

	const fields = value.fields
		.map(normalizeUIField)
		.filter((field): field is CompilerUIField => field !== null);

	if (fields.length === 0) {
		return null;
	}

	const label = normalizeTranslatableText(value.label);

	return {
		fields,
		...(label !== null ? { label } : {}),
	};
}

function normalizeInfoSection(value: unknown): CompilerUIInfoSection | null {
	if (!isRecord(value) || !Array.isArray(value.rows)) {
		return null;
	}

	const title = normalizeTranslatableText(value.title);
	if (title === null) {
		return null;
	}

	const rows = value.rows.flatMap((row) => {
		if (!isRecord(row)) return [];
		const label = normalizeTranslatableText(row.label);
		const rowValue = normalizeTranslatableText(row.value);
		if (label === null || rowValue === null) return [];
		return [{ label, value: rowValue }];
	});

	if (rows.length === 0) {
		return null;
	}

	return { title, rows };
}

function normalizeRenderers(value: unknown): CompilerUIRenderer[] | null {
	if (!Array.isArray(value)) {
		return null;
	}

	const renderers = value.flatMap((item) => {
		if (!isRecord(item) || typeof item.format !== 'string') return [];
		const label = normalizeTranslatableText(item.label);
		if (label === null) return [];
		return [{ format: item.format, label }];
	});

	return renderers.length > 0 ? renderers : null;
}

function normalizeUISchema(value: unknown): CompilerUISchema | undefined {
	if (!isRecord(value)) {
		return undefined;
	}

	const compile = normalizeUISection(value.compile);
	const exportSection = normalizeUISection(value.export);
	const info = normalizeInfoSection(value.info);
	const renderers = normalizeRenderers(value.renderers);

	if (!compile && !exportSection && !info && !renderers) {
		return undefined;
	}

	return {
		...(compile ? { compile } : {}),
		...(exportSection ? { export: exportSection } : {}),
		...(info ? { info } : {}),
		...(renderers ? { renderers } : {}),
	};
}

function normalizeTransportConfig(
	config: StoredTypesetterConfig,
): CompilerTransportConfig | null {
	if (isRecord(config.transportConfig)) {
		const { type, url, signaling, roomId } = config.transportConfig;

		if (type !== 'websocket' && type !== 'webrtc') {
			return null;
		}

		return {
			type,
			...(typeof url === 'string' ? { url } : {}),
			...(Array.isArray(signaling)
				? {
						signaling: signaling.filter(
							(item): item is string => typeof item === 'string',
						),
					}
				: {}),
			...(typeof roomId === 'string' ? { roomId } : {}),
		};
	}

	const type = config.transportType === 'webrtc' ? 'webrtc' : 'websocket';

	return {
		type,
		...(typeof config.transportUrl === 'string'
			? { url: config.transportUrl }
			: {}),
	};
}

function normalizeCapabilities(
	config: StoredTypesetterConfig,
): TypesetterServerConfig['capabilities'] {
	if (isRecord(config.capabilities)) {
		const { outline, formatter } = config.capabilities;

		return {
			...(typeof outline === 'boolean' ? { outline } : {}),
			...(typeof formatter === 'string' ? { formatter } : {}),
		};
	}

	return {
		...(typeof config.hasOutline === 'boolean'
			? { outline: config.hasOutline }
			: {}),
		...(typeof config.formatter === 'string'
			? { formatter: config.formatter }
			: {}),
	};
}

function normalizeConfig(value: unknown): TypesetterServerConfig | null {
	if (!isRecord(value)) {
		return null;
	}

	const config = value as StoredTypesetterConfig;

	const id =
		typeof config.id === 'string'
			? config.id
			: typeof config.configId === 'string'
				? config.configId
				: null;

	if (!id || typeof config.projectType !== 'string') {
		return null;
	}

	const transportConfig = normalizeTransportConfig(config);

	if (!transportConfig) {
		return null;
	}

	const ui = normalizeUISchema(config.ui);
	const inputFiles = normalizeInputFiles(config.inputFiles);

	return {
		id,
		name:
			typeof config.name === 'string' && config.name.trim()
				? config.name
				: id.toUpperCase(),
		enabled: config.enabled !== false,
		projectType: config.projectType,
		projectGroup:
			typeof config.projectGroup === 'string' && config.projectGroup.trim()
				? config.projectGroup
				: undefined,
		...(config.incrementalSync === true ? { incrementalSync: true } : {}),
		inputExtensions: normalizeStringArray(config.inputExtensions),
		outputFormats: normalizeOutputFormats(config.outputFormats),
		transportConfig,
		capabilities: normalizeCapabilities(config),
		...(inputFiles.length > 0 ? { inputFiles } : {}),
		...(ui ? { ui } : {}),
	};
}

function parseConfigs(value: unknown): TypesetterServerConfig[] {
	let parsed: unknown = value;

	if (typeof parsed === 'string') {
		try {
			parsed = JSON.parse(parsed);
		} catch {
			return [];
		}
	}

	if (!Array.isArray(parsed)) {
		return [];
	}

	return parsed
		.map(normalizeConfig)
		.filter((config): config is TypesetterServerConfig => config !== null);
}

export const TypesetterConfigProvider: React.FC<
	TypesetterConfigProviderProps
> = ({ children }) => {
	const { getSetting } = useSettings();
	const [configs, setConfigs] = useState<TypesetterServerConfig[]>([]);
	const registeredIdsRef = useRef<Set<string>>(new Set());
	const lastSerializedRef = useRef<Map<string, string>>(new Map());

	const settingValue = getSetting('generic-typesetter-configs')?.value;

	const storedConfigs = useMemo(
		() => parseConfigs(settingValue),
		[settingValue],
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
				compilerRegistryService.register({
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
				compilerRegistryService.unregister(config.id);
			}
		});

		previousIds.forEach((id) => {
			if (!nextIds.has(id)) {
				genericTypesetterService.unregisterConfig(id);
				compilerRegistryService.unregister(id);
			}
		});

		registeredIdsRef.current = nextIds;
		lastSerializedRef.current = nextSerialized;
	}, [storedConfigs]);

	return (
		<TypesetterConfigContext.Provider value={{ configs }}>
			{children}
		</TypesetterConfigContext.Provider>
	);
};
