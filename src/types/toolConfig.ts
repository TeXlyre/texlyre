// src/types/toolConfig.ts
import type React from 'react';

import type { TransportStatus } from '@chelys/types/transport';
import type { TypesetterServerConfig } from '../services/GenericTypesetterService';
import type { LSPConfigBlock } from './lsp';

export type ToolConfigBlock = LSPConfigBlock | TypesetterServerConfig;

export type ToolConfigFieldValues = Record<string, string>;

export interface ToolConfigField {
	key: string;
	label: string;
	kind: 'text' | 'select' | 'list' | 'textarea';
	options?: { label: string; value: string }[];
	placeholder?: string;
	help?: string;
}

export interface ToolConfigStore {
	configs: ToolConfigBlock[];
	disabledConfigs: ToolConfigBlock[];
	addConfigs: (configs: ToolConfigBlock[]) => void;
	updateConfig: (id: string, updates: Partial<ToolConfigBlock>) => void;
	removeConfig: (id: string) => void;
	setConfigEnabled: (id: string, enabled: boolean) => void;
}

export interface ToolConfigKind {
	label: string;
	icon: React.FC;
	settingId: string;
	emptyMessage: string;
	fields: ToolConfigField[];
	useStore: () => ToolConfigStore;
	normalize: (value: unknown) => ToolConfigBlock | null;
	toFieldValues: (config: ToolConfigBlock | null) => ToolConfigFieldValues;
	toStoredConfig: (
		values: ToolConfigFieldValues,
		base: ToolConfigBlock | null,
	) => Record<string, unknown>;
	badges: (config: ToolConfigBlock) => string[];
	getStatus: (id: string) => TransportStatus;
	onStatusChange: (
		listener: (id: string, status: TransportStatus) => void,
	) => () => void;
}
