// src/settings/registerLSPConfigSettings.tsx
import { useEffect, useRef } from 'react';
import { nanoid } from 'nanoid';

import { t } from '@/i18n';
import { ToolbarCodeBlockIcon } from '../components/common/Icons';
import ToolConfigCards from '../components/settings/ToolConfigCards';
import {
	LSP_CONFIGS_SETTING,
	LSP_DISABLED_CONFIGS_SETTING,
} from '../contexts/LSPConfigContext';
import { useLSPConfig } from '../hooks/useLSPConfig';
import { useSettings } from '../hooks/useSettings';
import { genericLSPService } from '../services/GenericLSPService';
import type { LSPConfigBlock } from '../types/lsp';
import type { ToolConfigKind, ToolConfigStore } from '../types/toolConfig';
import {
	buildTransportConfig,
	joinList,
	normalizeLspConfig,
	splitList,
} from '../utils/toolConfigUtils';

const lspKind: ToolConfigKind = {
	label: 'Language Server',
	icon: ToolbarCodeBlockIcon,
	settingId: LSP_CONFIGS_SETTING,
	emptyMessage: 'No language server recipes yet.',
	fields: [
		{
			key: 'name',
			label: 'Name',
			kind: 'text',
			placeholder: 'LTeX LS Plus',
		},
		{
			key: 'transportType',
			label: 'Transport',
			kind: 'select',
			options: [
				{ label: 'WebSocket', value: 'websocket' },
				{ label: 'WebRTC', value: 'webrtc' },
				{ label: 'Worker', value: 'worker' },
			],
		},
		{
			key: 'transportUrl',
			label: 'Server URL',
			kind: 'text',
			placeholder: 'ws://localhost:7020',
		},
		{
			key: 'transportRoomId',
			label: 'Room override',
			kind: 'text',
			help: 'Optional. Defaults to a room derived from your account.',
		},
		{
			key: 'fileExtensions',
			label: 'File extensions',
			kind: 'list',
			help: 'Comma-separated, e.g. tex, latex, md',
		},
		{
			key: 'clientConfig',
			label: 'Client configuration',
			kind: 'textarea',
			help: 'JSON passed to the language server on start',
		},
	],
	useStore: useLSPConfig as unknown as () => ToolConfigStore,
	normalize: normalizeLspConfig,
	toFieldValues: (config) => {
		const block = config as LSPConfigBlock | null;
		return {
			name: block?.name ?? '',
			transportType: block?.transportConfig.type ?? 'websocket',
			transportUrl: block?.transportConfig.url ?? '',
			transportRoomId: block?.transportConfig.roomId ?? '',
			fileExtensions: joinList(block?.fileExtensions),
			clientConfig: block?.clientConfig ?? '{}',
		};
	},
	toStoredConfig: (values, base) => {
		const block = base as LSPConfigBlock | null;
		return {
			...(block ?? {}),
			id: block?.id ?? nanoid(),
			name: values.name.trim() || 'Language Server',
			enabled: block?.enabled ?? true,
			fileExtensions: splitList(values.fileExtensions),
			transportConfig: buildTransportConfig(
				values.transportType,
				values.transportUrl,
				values.transportRoomId,
				block?.transportConfig,
			),
			clientConfig: values.clientConfig.trim() || '{}',
		};
	},
	badges: (config) => {
		const block = config as LSPConfigBlock;
		return [
			block.transportConfig.type,
			...(block.fileExtensions.length > 0
				? [joinList(block.fileExtensions)]
				: []),
		];
	},
	getStatus: (id) => genericLSPService.getConnectionStatus(id),
	onStatusChange: (listener) => genericLSPService.onStatusChange(listener),
};

export function useRegisterLSPConfigSettings() {
	const { registerSetting, batchGetSettings } = useSettings();
	const registered = useRef(false);

	useEffect(() => {
		if (registered.current) return;
		registered.current = true;

		const batchedSettings = batchGetSettings([
			LSP_CONFIGS_SETTING,
			LSP_DISABLED_CONFIGS_SETTING,
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
			id: LSP_CONFIGS_SETTING,
			category: t('External Tools'),
			subcategory: t('Generic LSP'),
			type: 'custom',
			label: t('LSP Recipes'),
			description: (
				<>
					<a
						href='https://texlyre.org/docs/lsp-with-texlyre'
						target='_blank'
						rel='noopener noreferrer'
					>
						{t('Learn more about the LSP recipe format')}
					</a>
					<br />
					<a
						href='https://texlyre.org/docs/category/supported-lsp'
						target='_blank'
						rel='noopener noreferrer'
					>
						{t('Tested LSP servers and setup guides')}
					</a>
				</>
			),
			defaultValue: readStoredValue(LSP_CONFIGS_SETTING),
			liveUpdate: true,
			render: () => <ToolConfigCards kind={lspKind} />,
		});

		registerSetting({
			id: LSP_DISABLED_CONFIGS_SETTING,
			category: t('External Tools'),
			subcategory: t('Generic LSP'),
			type: 'custom',
			label: t('Disabled LSP Recipes'),
			defaultValue: readStoredValue(LSP_DISABLED_CONFIGS_SETTING),
			liveUpdate: true,
			hidden: true,
		});
	}, [registerSetting, batchGetSettings]);
}
