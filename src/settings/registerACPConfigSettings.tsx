// src/settings/registerACPConfigSettings.tsx
import { useEffect, useRef } from 'react';
import { nanoid } from 'nanoid';

import { t } from '@/i18n';
import { ChatIcon } from '../components/common/Icons';
import ToolConfigCards from '../components/settings/ToolConfigCards';
import {
	ACP_CONFIGS_SETTING,
	ACP_DISABLED_CONFIGS_SETTING,
} from '../contexts/ACPConfigContext';
import { useACPConfig } from '../hooks/useACPConfig';
import { useSettings } from '../hooks/useSettings';
import { genericACPService } from '../services/GenericACPService';
import type { ACPServerConfig } from '../types/acp';
import type { ToolConfigKind, ToolConfigStore } from '../types/toolConfig';
import {
	buildTransportConfig,
	normalizeAcpConfig,
	optionalText,
} from '../utils/toolConfigUtils';

const acpKind: ToolConfigKind = {
	label: 'Agent',
	icon: ChatIcon,
	settingId: ACP_CONFIGS_SETTING,
	emptyMessage: 'No agent recipes yet.',
	// An agent acts on the user's machine and account; it is never offered to
	// collaborators.
	shareable: false,
	fields: [
		{
			key: 'name',
			label: 'Name',
			kind: 'text',
			placeholder: 'Claude Agent',
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
			label: 'Agent URL',
			kind: 'text',
			placeholder: 'ws://localhost:7060',
		},
		{
			key: 'transportRoomId',
			label: 'Room override',
			kind: 'text',
			help: 'Optional. Defaults to a room derived from your account.',
		},
		{
			key: 'sessionMeta',
			label: 'Session options',
			kind: 'textarea',
			help: 'Optional JSON object sent as _meta on session/new, for agent-specific options',
		},
	],
	useStore: useACPConfig as unknown as () => ToolConfigStore,
	normalize: normalizeAcpConfig,
	toFieldValues: (config) => {
		const block = config as ACPServerConfig | null;
		return {
			name: block?.name ?? '',
			transportType: block?.transportConfig.type ?? 'websocket',
			transportUrl: block?.transportConfig.url ?? '',
			transportRoomId: block?.transportConfig.roomId ?? '',
			sessionMeta: block?.sessionMeta ?? '',
		};
	},
	toStoredConfig: (values, base) => {
		const block = base as ACPServerConfig | null;
		const sessionMeta = optionalText(values.sessionMeta);
		const { sessionMeta: _previous, ...rest } =
			block ?? ({} as ACPServerConfig);
		return {
			...rest,
			id: block?.id ?? nanoid(),
			name: values.name.trim() || 'Agent',
			enabled: block?.enabled ?? true,
			transportConfig: {
				...buildTransportConfig(
					values.transportType,
					values.transportUrl,
					values.transportRoomId,
					block?.transportConfig,
				),
				contentLength: false,
			},
			...(sessionMeta ? { sessionMeta } : {}),
		};
	},
	badges: (config) => [(config as ACPServerConfig).transportConfig.type],
	getStatus: (id) => genericACPService.getConnectionStatus(id),
	onStatusChange: (listener) => genericACPService.onStatusChange(listener),
};

export function useRegisterACPConfigSettings() {
	const { registerSetting, batchGetSettings } = useSettings();
	const registered = useRef(false);

	useEffect(() => {
		if (registered.current) return;
		registered.current = true;

		const batchedSettings = batchGetSettings([
			ACP_CONFIGS_SETTING,
			ACP_DISABLED_CONFIGS_SETTING,
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
			id: ACP_CONFIGS_SETTING,
			category: t('External Tools'),
			subcategory: t('Agents'),
			type: 'custom',
			label: t('Agent Recipes'),
			description: t(
				'Agents run on your machine through Chelys and work on the open project with your approval. Project content you share with an agent is sent to its AI provider.',
			),
			defaultValue: readStoredValue(ACP_CONFIGS_SETTING),
			liveUpdate: true,
			render: () => <ToolConfigCards kind={acpKind} />,
		});

		registerSetting({
			id: ACP_DISABLED_CONFIGS_SETTING,
			category: t('External Tools'),
			subcategory: t('Agents'),
			type: 'custom',
			label: t('Disabled Agent Recipes'),
			defaultValue: readStoredValue(ACP_DISABLED_CONFIGS_SETTING),
			liveUpdate: true,
			hidden: true,
		});
	}, [registerSetting, batchGetSettings]);
}
