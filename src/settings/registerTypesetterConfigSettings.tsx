// src/settings/registerTypesetterConfigSettings.tsx
import { useEffect, useRef } from 'react';
import { nanoid } from 'nanoid';

import { t } from '@/i18n';
import { OutputIcon } from '../components/common/Icons';
import ToolConfigCards from '../components/settings/ToolConfigCards';
import {
	TYPESETTER_CONFIGS_SETTING,
	TYPESETTER_DISABLED_CONFIGS_SETTING,
} from '../contexts/TypesetterConfigContext';
import { useSettings } from '../hooks/useSettings';
import { useTypesetterConfig } from '../hooks/useTypesetterConfig';
import {
	genericTypesetterService,
	type TypesetterServerConfig,
} from '../services/GenericTypesetterService';
import type { ToolConfigKind, ToolConfigStore } from '../types/toolConfig';
import {
	buildTransportConfig,
	joinList,
	normalizeTypesetterConfig,
	optionalText,
	splitList,
} from '../utils/toolConfigUtils';

const parseOutputFormats = (value: string, fallback: unknown): unknown => {
	if (!value.trim()) return fallback;
	try {
		return JSON.parse(value);
	} catch {
		return fallback;
	}
};

const typesetterKind: ToolConfigKind = {
	label: 'Typesetter',
	icon: OutputIcon,
	settingId: TYPESETTER_CONFIGS_SETTING,
	emptyMessage: 'No typesetter recipes yet.',
	fields: [
		{
			key: 'name',
			label: 'Name',
			kind: 'text',
			placeholder: 'Tectonic',
		},
		{
			key: 'projectType',
			label: 'Project type',
			kind: 'text',
			placeholder: 'tectonic',
			help: 'Identifier used to select this typesetter for a project',
		},
		{
			key: 'projectGroup',
			label: 'Project group',
			kind: 'text',
			placeholder: 'latex',
		},
		{
			key: 'transportType',
			label: 'Transport',
			kind: 'select',
			options: [
				{ label: 'WebSocket', value: 'websocket' },
				{ label: 'WebRTC', value: 'webrtc' },
			],
		},
		{
			key: 'transportUrl',
			label: 'Server URL',
			kind: 'text',
			placeholder: 'ws://localhost:7030',
		},
		{
			key: 'transportRoomId',
			label: 'Room override',
			kind: 'text',
			help: 'Optional. Defaults to a room derived from your account.',
		},
		{
			key: 'inputExtensions',
			label: 'Input extensions',
			kind: 'list',
			help: 'Comma-separated, e.g. tex, bib, cls',
		},
		{
			key: 'outputFormats',
			label: 'Output formats',
			kind: 'textarea',
			help: 'JSON array of { id, mimeType } entries',
		},
	],
	useStore: useTypesetterConfig as unknown as () => ToolConfigStore,
	normalize: normalizeTypesetterConfig,
	toFieldValues: (config) => {
		const block = config as TypesetterServerConfig | null;
		return {
			name: block?.name ?? '',
			projectType: block?.projectType ?? '',
			projectGroup: block?.projectGroup ?? '',
			transportType: block?.transportConfig.type ?? 'websocket',
			transportUrl: block?.transportConfig.url ?? '',
			transportRoomId: block?.transportConfig.roomId ?? '',
			inputExtensions: joinList(block?.inputExtensions),
			outputFormats: JSON.stringify(block?.outputFormats ?? [], null, 2),
		};
	},
	toStoredConfig: (values, base) => {
		const block = base as TypesetterServerConfig | null;
		return {
			...(block ?? {}),
			id: block?.id ?? nanoid(),
			name: values.name.trim() || values.projectType.trim() || 'Typesetter',
			enabled: block?.enabled ?? true,
			projectType: values.projectType.trim(),
			projectGroup: optionalText(values.projectGroup),
			inputExtensions: splitList(values.inputExtensions),
			outputFormats: parseOutputFormats(
				values.outputFormats,
				block?.outputFormats ?? [],
			),
			transportConfig: buildTransportConfig(
				values.transportType,
				values.transportUrl,
				values.transportRoomId,
				block?.transportConfig,
			),
		};
	},
	badges: (config) => {
		const block = config as TypesetterServerConfig;
		return [
			block.transportConfig.type,
			block.projectType,
			...(block.outputFormats.length > 0
				? [block.outputFormats.map((format) => format.id).join(', ')]
				: []),
		];
	},
	getStatus: (id) => genericTypesetterService.getConnectionStatus(id),
	onStatusChange: (listener) =>
		genericTypesetterService.onStatusChange(listener),
};

export function useRegisterTypesetterConfigSettings() {
	const { registerSetting, batchGetSettings } = useSettings();
	const registered = useRef(false);

	useEffect(() => {
		if (registered.current) return;
		registered.current = true;

		const batchedSettings = batchGetSettings([
			TYPESETTER_CONFIGS_SETTING,
			TYPESETTER_DISABLED_CONFIGS_SETTING,
		]);

		const readStoredValue = (id: string): string | unknown[] => {
			const settingValue = batchedSettings[id];

			if (typeof settingValue === 'string') {
				return settingValue;
			}
			if (Array.isArray(settingValue)) {
				return settingValue;
			}
			return '[]';
		};

		registerSetting({
			id: TYPESETTER_CONFIGS_SETTING,
			category: t('External Tools'),
			subcategory: t('Generic Typesetter'),
			type: 'custom',
			label: t('Typesetter Recipes'),
			description: t('Stored remote typesetter recipes (JSON array)'),
			defaultValue: readStoredValue(TYPESETTER_CONFIGS_SETTING),
			liveUpdate: true,
			render: () => <ToolConfigCards kind={typesetterKind} />,
		});

		registerSetting({
			id: TYPESETTER_DISABLED_CONFIGS_SETTING,
			category: t('External Tools'),
			subcategory: t('Generic Typesetter'),
			type: 'custom',
			label: t('Disabled Typesetter Recipes'),
			defaultValue: readStoredValue(TYPESETTER_DISABLED_CONFIGS_SETTING),
			liveUpdate: true,
			hidden: true,
		});
	}, [registerSetting, batchGetSettings]);
}
