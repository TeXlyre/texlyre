// src/settings/registerStorageConfigSettings.tsx
import { useEffect, useRef } from 'react';
import { nanoid } from 'nanoid';

import { t } from '@/i18n';
import { BackupIcon } from '../components/common/Icons';
import ToolConfigCards from '../components/settings/ToolConfigCards';
import {
	STORAGE_CONFIGS_SETTING,
	STORAGE_DISABLED_CONFIGS_SETTING,
} from '../contexts/StorageConfigContext';
import { useSettings } from '../hooks/useSettings';
import { useStorageConfig } from '../hooks/useStorageConfig';
import { genericStorageService } from '../services/GenericStorageService';
import type { StorageConfigBlock } from '../types/storage';
import type { ToolConfigKind, ToolConfigStore } from '../types/toolConfig';
import {
	buildTransportConfig,
	normalizeStorageConfig,
} from '../utils/toolConfigUtils';

const storageKind: ToolConfigKind = {
	label: 'Storage',
	icon: BackupIcon,
	settingId: STORAGE_CONFIGS_SETTING,
	emptyMessage: 'No storage recipes yet.',
	allowGlobalShare: false,
	fields: [
		{
			key: 'name',
			label: 'Name',
			kind: 'text',
			placeholder: 'Garage Storage',
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
			placeholder: 'ws://localhost:7060',
		},
		{
			key: 'transportRoomId',
			label: 'Room override',
			kind: 'text',
			help: 'Optional. Defaults to a room derived from your account.',
		},
	],
	useStore: useStorageConfig as unknown as () => ToolConfigStore,
	normalize: normalizeStorageConfig,
	toFieldValues: (config) => {
		const block = config as StorageConfigBlock | null;
		return {
			name: block?.name ?? '',
			transportType: block?.transportConfig.type ?? 'websocket',
			transportUrl: block?.transportConfig.url ?? '',
			transportRoomId: block?.transportConfig.roomId ?? '',
		};
	},
	toStoredConfig: (values, base) => {
		const block = base as StorageConfigBlock | null;
		return {
			...(block ?? {}),
			id: block?.id ?? nanoid(),
			name: values.name.trim() || 'Storage',
			enabled: block?.enabled ?? true,
			transportConfig: buildTransportConfig(
				values.transportType,
				values.transportUrl,
				values.transportRoomId,
				block?.transportConfig,
			),
		};
	},
	badges: (config) => [(config as StorageConfigBlock).transportConfig.type],
	getStatus: (id) => genericStorageService.getConnectionStatus(id),
	onStatusChange: (listener) => genericStorageService.onStatusChange(listener),
};

export function useRegisterStorageConfigSettings() {
	const { registerSetting, batchGetSettings } = useSettings();
	const registered = useRef(false);

	useEffect(() => {
		if (registered.current) return;
		registered.current = true;

		const batchedSettings = batchGetSettings([
			STORAGE_CONFIGS_SETTING,
			STORAGE_DISABLED_CONFIGS_SETTING,
		]);

		const readStoredValue = (id: string): string | unknown[] => {
			const settingValue = batchedSettings[id];
			if (typeof settingValue === 'string') return settingValue;
			if (Array.isArray(settingValue)) return settingValue;
			return '[]';
		};

		registerSetting({
			id: STORAGE_CONFIGS_SETTING,
			category: t('External Tools'),
			subcategory: t('Remote Storage'),
			type: 'custom',
			label: t('Storage Recipes'),
			defaultValue: readStoredValue(STORAGE_CONFIGS_SETTING),
			liveUpdate: true,
			render: () => <ToolConfigCards kind={storageKind} />,
		});

		registerSetting({
			id: STORAGE_DISABLED_CONFIGS_SETTING,
			category: t('External Tools'),
			subcategory: t('Remote Storage'),
			type: 'custom',
			label: t('Disabled Storage Recipes'),
			defaultValue: readStoredValue(STORAGE_DISABLED_CONFIGS_SETTING),
			liveUpdate: true,
			hidden: true,
		});
	}, [registerSetting, batchGetSettings]);
}
