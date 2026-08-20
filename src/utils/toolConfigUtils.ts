// src/utils/toolConfigUtils.ts
import type { TransportConfig } from '@chelys/types/transport';

import type { TypesetterServerConfig } from '../services/GenericTypesetterService';
import type {
	TypesetterInputFile,
	TypesetterOutputFormat,
	TypesetterTransportConfig,
	TypesetterUIField,
	TypesetterUIInfoSection,
	TypesetterUIRenderer,
	TypesetterUISchema,
	TypesetterUISection,
	TranslatableText,
} from '../types/compilation';
import type { LSPConfigBlock } from '../types/lsp';

export function parseStoredList(value: unknown): unknown[] {
	let parsed: unknown = value;

	if (typeof parsed === 'string') {
		try {
			parsed = JSON.parse(parsed);
		} catch {
			return [];
		}
	}

	return Array.isArray(parsed) ? parsed : [];
}

interface StoredTypesetterConfig {
	id?: unknown;
	configId?: unknown;
	name?: unknown;
	enabled?: unknown;
	icon?: unknown;
	incrementalSync?: unknown;
	projectType?: unknown;
	projectGroup?: unknown;
	inputExtensions?: unknown;
	inputFiles?: unknown;
	outputFormats?: unknown;
	transportConfig?: unknown;
	transportType?: unknown;
	transportUrl?: unknown;
	transportRoomId?: unknown;
	capabilities?: unknown;
	hasOutline?: unknown;
	formatter?: unknown;
	ui?: unknown;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function normalizeStringArray(value: unknown): string[] {
	if (!Array.isArray(value)) {
		return [];
	}

	return value.filter((item): item is string => typeof item === 'string');
}

function normalizeOutputFormats(value: unknown): TypesetterOutputFormat[] {
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

function normalizeInputFiles(value: unknown): TypesetterInputFile[] {
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

function normalizeUIField(value: unknown): TypesetterUIField | null {
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

	const group = typeof value.group === 'string' ? value.group : undefined;
	const showWhen =
		isRecord(value.showWhen) &&
		typeof value.showWhen.field === 'string' &&
		Array.isArray(value.showWhen.in)
			? {
					field: value.showWhen.field,
					in: value.showWhen.in.filter(
						(entry): entry is string => typeof entry === 'string',
					),
				}
			: undefined;

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
		...(group ? { group } : {}),
		...(showWhen ? { showWhen } : {}),
	};
}

function normalizeUISection(value: unknown): TypesetterUISection | null {
	if (!isRecord(value) || !Array.isArray(value.fields)) {
		return null;
	}

	const fields = value.fields
		.map(normalizeUIField)
		.filter((field): field is TypesetterUIField => field !== null);

	if (fields.length === 0) {
		return null;
	}

	const label = normalizeTranslatableText(value.label);

	return {
		fields,
		...(label !== null ? { label } : {}),
	};
}

function normalizeInfoSection(value: unknown): TypesetterUIInfoSection | null {
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

function normalizeRenderers(value: unknown): TypesetterUIRenderer[] | null {
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

function normalizeUISchema(value: unknown): TypesetterUISchema | undefined {
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
): TypesetterTransportConfig | null {
	const hasBlock = isRecord(config.transportConfig);
	const source = hasBlock
		? config.transportConfig
		: {
				type: config.transportType,
				url: config.transportUrl,
				roomId: config.transportRoomId,
				signaling: undefined as unknown,
			};
	const { url, signaling, roomId } = source;
	const type =
		source.type === 'webrtc'
			? 'webrtc'
			: source.type === 'websocket' || !hasBlock
				? 'websocket'
				: null;

	if (!type) {
		return null;
	}

	if (type === 'webrtc') {
		return {
			type,
			...(Array.isArray(signaling)
				? {
						signaling: signaling.filter(
							(item): item is string => typeof item === 'string',
						),
					}
				: {}),
			...(typeof roomId === 'string' && roomId.trim()
				? { roomId: roomId.trim() }
				: {}),
		};
	}

	return {
		type,
		...(typeof url === 'string' ? { url } : {}),
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

export function normalizeTypesetterConfig(
	value: unknown,
): TypesetterServerConfig | null {
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
		...(typeof config.icon === 'string' ? { icon: config.icon } : {}),
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

export function parseTypesetterConfigs(
	value: unknown,
): TypesetterServerConfig[] {
	return parseStoredList(value)
		.map(normalizeTypesetterConfig)
		.filter((config): config is TypesetterServerConfig => config !== null);
}

function normalizeLanguageIdMap(
	value: unknown,
): Record<string, string> | undefined {
	if (!isRecord(value)) {
		return undefined;
	}

	const entries = Object.entries(value).filter(
		(entry): entry is [string, string] => typeof entry[1] === 'string',
	);

	return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function normalizeLspTransport(value: unknown): TransportConfig | null {
	if (!isRecord(value)) {
		return null;
	}

	const { type } = value;

	if (type !== 'websocket' && type !== 'webrtc' && type !== 'worker') {
		return null;
	}

	const contentLength =
		typeof value.contentLength === 'boolean'
			? { contentLength: value.contentLength }
			: {};

	if (type === 'worker') {
		return {
			type,
			...(typeof value.workerPath === 'string'
				? { workerPath: value.workerPath }
				: {}),
			...contentLength,
		};
	}

	if (type === 'webrtc') {
		return {
			type,
			...(Array.isArray(value.signaling)
				? {
						signaling: value.signaling.filter(
							(item): item is string => typeof item === 'string',
						),
					}
				: {}),
			...(typeof value.roomId === 'string' && value.roomId.trim()
				? { roomId: value.roomId.trim() }
				: {}),
			...contentLength,
		};
	}

	return {
		type,
		...(typeof value.url === 'string' ? { url: value.url } : {}),
		...contentLength,
	};
}

export function normalizeLspConfig(value: unknown): LSPConfigBlock | null {
	if (!isRecord(value)) {
		return null;
	}

	const id =
		typeof value.id === 'string'
			? value.id
			: typeof value.configId === 'string'
				? value.configId
				: null;

	if (!id) {
		return null;
	}

	const transportConfig =
		normalizeLspTransport(value.transportConfig) ??
		normalizeLspTransport({
			type:
				typeof value.transportType === 'string'
					? value.transportType
					: 'websocket',
			url: value.transportUrl,
			roomId: value.transportRoomId,
			signaling: value.signalingServers,
			contentLength: value.contentLength,
		});

	if (!transportConfig) {
		return null;
	}

	const languageIdMap = normalizeLanguageIdMap(value.languageIdMap);

	return {
		id,
		name:
			typeof value.name === 'string' && value.name.trim()
				? value.name
				: id.toUpperCase(),
		enabled: value.enabled !== false,
		...(typeof value.icon === 'string' ? { icon: value.icon } : {}),
		fileExtensions: normalizeStringArray(value.fileExtensions),
		...(languageIdMap ? { languageIdMap } : {}),
		transportConfig,
		clientConfig:
			typeof value.clientConfig === 'string'
				? value.clientConfig
				: JSON.stringify(value.clientConfig ?? {}, null, 2),
	};
}

export function parseLspConfigs(value: unknown): LSPConfigBlock[] {
	return parseStoredList(value)
		.map(normalizeLspConfig)
		.filter((config): config is LSPConfigBlock => config !== null);
}

export function upsertConfig<T extends { id: string }>(
	configs: T[],
	config: T,
): T[] {
	const index = configs.findIndex((entry) => entry.id === config.id);

	if (index < 0) {
		return [...configs, config];
	}

	const next = [...configs];
	next[index] = config;
	return next;
}

export function moveConfig<T extends { id: string }>(
	from: T[],
	to: T[],
	id: string,
): { from: T[]; to: T[] } | null {
	const config = from.find((entry) => entry.id === id);

	if (!config) {
		return null;
	}

	return {
		from: from.filter((entry) => entry.id !== id),
		to: upsertConfig(to, config),
	};
}

export function withoutDisabled<T extends { id: string }>(
	configs: T[],
	disabled: T[],
): T[] {
	if (disabled.length === 0) {
		return configs;
	}

	const disabledIds = new Set(disabled.map((entry) => entry.id));
	return configs.filter((config) => !disabledIds.has(config.id));
}

export function splitList(value: string): string[] {
	return value
		.split(/[\s,]+/)
		.map((entry) => entry.trim().replace(/^\./, ''))
		.filter(Boolean);
}

export function joinList(value: string[] | undefined): string {
	return (value ?? []).join(', ');
}

export function optionalText(value: string): string | undefined {
	return value.trim() ? value.trim() : undefined;
}

export function resolveTransportType(value: string): TransportConfig['type'] {
	return value === 'webrtc' || value === 'worker' ? value : 'websocket';
}

export function buildTransportConfig(
	transportType: string,
	url: string,
	roomId: string,
	base?: Partial<TransportConfig>,
): TransportConfig {
	const type = resolveTransportType(transportType);
	const contentLength =
		typeof base?.contentLength === 'boolean'
			? { contentLength: base.contentLength }
			: {};

	if (type === 'worker') {
		return {
			type,
			...(base?.workerPath ? { workerPath: base.workerPath } : {}),
			...contentLength,
		};
	}

	if (type === 'webrtc') {
		return {
			type,
			...(base?.signaling?.length ? { signaling: base.signaling } : {}),
			...(optionalText(roomId) ? { roomId: optionalText(roomId) } : {}),
			...contentLength,
		};
	}

	return {
		type,
		...(optionalText(url) ? { url: optionalText(url) } : {}),
		...contentLength,
	};
}
