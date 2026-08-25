// src/components/settings/ToolConfigCards.tsx
import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import type { TransportStatus } from '@chelys/types/transport';

import { t } from '@/i18n';
import { useSettings } from '../../hooks/useSettings';
import { useSharedToolPreferences } from '../../hooks/useSharedToolPreferences';
import type { ToolConfigBlock, ToolConfigKind } from '../../types/toolConfig';
import {
	describeSharedToolAvailability,
	getSharedToolKind,
} from '../../utils/sharedToolsUtils';
import {
	ChevronDownIcon,
	ChevronUpIcon,
	EditIcon,
	ImportIcon,
	PlusIcon,
	TrashIcon,
} from '../common/Icons';
import ToolConfigForm, { ToolConfigJsonEditor } from './ToolConfigForm';
import ToolConfigImport from './ToolConfigImport';
import ToolConfigShareActions from './ToolConfigShareActions';

interface ToolConfigCardsProps {
	kind: ToolConfigKind;
}

const STATUS_LABELS: Record<TransportStatus, string> = {
	connected: 'Connected',
	connecting: 'Connecting…',
	disconnected: 'Disconnected',
	error: 'Error',
};

const ToolConfigCards: React.FC<ToolConfigCardsProps> = ({ kind }) => {
	const KindIcon = kind.icon;
	const store = kind.useStore();
	const { updateSetting } = useSettings();
	const sharing = useSharedToolPreferences();

	const [editing, setEditing] = useState<ToolConfigBlock | 'new' | null>(null);
	const [importing, setImporting] = useState(false);
	const [jsonDraft, setJsonDraft] = useState<string | null>(null);
	const [showDisabled, setShowDisabled] = useState(false);
	const [statuses, setStatuses] = useState<Record<string, TransportStatus>>({});
	const [error, setError] = useState<string | null>(null);

	const activeConfigs = useMemo(
		() => store.configs.filter((config) => config.enabled),
		[store.configs],
	);

	const inactiveConfigs = useMemo(
		() => [
			...store.configs.filter((config) => !config.enabled),
			...store.disabledConfigs,
		],
		[store.configs, store.disabledConfigs],
	);

	const activeIds = useMemo(
		() => activeConfigs.map((config) => config.id).join(','),
		[activeConfigs],
	);

	useEffect(() => {
		const ids = activeIds ? activeIds.split(',') : [];

		setStatuses(Object.fromEntries(ids.map((id) => [id, kind.getStatus(id)])));

		return kind.onStatusChange((id, status) => {
			setStatuses((prev) => ({ ...prev, [id]: status }));
		});
	}, [kind, activeIds]);

	const handleSave = (config: ToolConfigBlock) => {
		if (editing && editing !== 'new') {
			store.updateConfig(config.id, config);
		} else {
			store.addConfigs([config]);
		}
		setEditing(null);
	};

	const handleImport = (configs: ToolConfigBlock[]) => {
		store.addConfigs(configs);
		setImporting(false);
	};

	const applyJsonDraft = () => {
		if (jsonDraft === null) return;

		let parsed: unknown;

		try {
			parsed = JSON.parse(jsonDraft);
		} catch {
			setError(t('The recipe list is not valid JSON.'));
			return;
		}

		if (!Array.isArray(parsed)) {
			setError(t('The recipe list must be a JSON array.'));
			return;
		}

		setError(null);
		updateSetting(kind.settingId, parsed);
		setJsonDraft(null);
	};

	if (editing) {
		return (
			<ToolConfigForm
				kind={kind}
				config={editing === 'new' ? null : editing}
				onSave={handleSave}
				onCancel={() => setEditing(null)}
			/>
		);
	}

	if (importing) {
		return (
			<ToolConfigImport
				kind={kind}
				onImport={handleImport}
				onCancel={() => setImporting(false)}
			/>
		);
	}

	const renderCard = (config: ToolConfigBlock, enabled: boolean) => {
		const sharedKind = getSharedToolKind(config);
		const origin = sharing.getOrigin(sharedKind, config.id);
		const share = describeSharedToolAvailability(config);
		const canAdvertise = enabled && share.shareable;
		const sharedWithAll = sharing.isSharedWithAll(sharedKind, config.id);

		return (
			<div
				key={config.id}
				className={`tool-config-card${enabled ? '' : ' inactive'}`}
			>
				<div className='tool-config-card-main'>
					<div className='tool-config-card-info'>
						{config.icon ? (
							<span
								className='tool-config-icon'
								aria-hidden='true'
								/* biome-ignore lint/security/noDangerouslySetInnerHtml: Icons are trusted pre-rendered SVG strings */
								dangerouslySetInnerHTML={{ __html: config.icon }}
							/>
						) : (
							<span className='tool-config-icon' aria-hidden='true'>
								<KindIcon />
							</span>
						)}
						<span className='tool-config-name'>{config.name}</span>
						{origin && (
							<span className='tool-config-badge'>
								{t('Shared by')} {origin.ownerName}
							</span>
						)}
						{kind.badges(config).map((badge) => (
							<span key={badge} className='tool-config-badge'>
								{badge}
							</span>
						))}
					</div>
					{enabled && (
						<span
							className={`tool-config-state tool-config-state-${statuses[config.id] ?? 'disconnected'}`}
						>
							{t(STATUS_LABELS[statuses[config.id] ?? 'disconnected'])}
						</span>
					)}
				</div>

				<div className='tool-config-actions'>
					<button
						className={enabled ? 'button danger' : 'button primary'}
						onClick={() => store.setConfigEnabled(config.id, !enabled)}
					>
						{enabled ? t('Disable') : t('Enable')}
					</button>
					<button
						className='button'
						disabled={Boolean(origin)}
						title={
							origin
								? t('Shared recipes are managed by their owner.')
								: undefined
						}
						onClick={() => setEditing(config)}
					>
						<EditIcon />
						{t('Edit')}
					</button>
					<button
						className='button danger'
						onClick={() => {
							sharing.detachLocalTool(sharedKind, config.id);
							store.removeConfig(config.id);
						}}
					>
						<TrashIcon />
						{t('Remove')}
					</button>
					<div className='tool-config-actions-utility'>
						<ToolConfigShareActions config={config} />
					</div>
				</div>

				<label
					className='checkbox-control shared-tool-toggle'
					title={!canAdvertise ? share.message : undefined}
				>
					<input
						type='checkbox'
						checked={sharedWithAll}
						disabled={!canAdvertise && !sharedWithAll}
						onChange={(event) =>
							sharing.setSharedWithAll(
								sharedKind,
								config.id,
								event.target.checked,
							)
						}
					/>
					<span>{t('Share with all collaborators')}</span>
				</label>
				{!canAdvertise && share.message && (
					<div className='shared-tool-note'>{t(share.message)}</div>
				)}
			</div>
		);
	};

	return (
		<div className='tool-config-list'>
			<div className='tool-config-list-header'>
				<button
					className='action-button primary'
					onClick={() => setEditing('new')}
				>
					<PlusIcon />
					{t('Add recipe')}
				</button>
				<button className='action-button' onClick={() => setImporting(true)}>
					<ImportIcon />
					{t('Import recipe')}
				</button>
				<button
					className='button secondary smaller tool-config-json-toggle'
					onClick={() =>
						setJsonDraft(
							jsonDraft === null
								? JSON.stringify(store.configs, null, 2)
								: null,
						)
					}
				>
					{jsonDraft === null ? t('Edit as JSON') : t('Close JSON editor')}
				</button>
			</div>

			{error && <div className='error-message'>{error}</div>}

			{jsonDraft !== null && (
				<div className='tool-config-json'>
					<ToolConfigJsonEditor value={jsonDraft} onChange={setJsonDraft} />
					<div className='form-actions'>
						<button className='button primary' onClick={applyJsonDraft}>
							{t('Apply')}
						</button>
					</div>
				</div>
			)}

			{activeConfigs.length === 0 && inactiveConfigs.length === 0 && (
				<p className='tool-config-empty'>{t(kind.emptyMessage)}</p>
			)}

			{activeConfigs.map((config) => renderCard(config, true))}

			{inactiveConfigs.length > 0 && (
				<div className='tool-config-disabled'>
					<button
						className='button secondary smaller'
						onClick={() => setShowDisabled(!showDisabled)}
					>
						{showDisabled ? <ChevronUpIcon /> : <ChevronDownIcon />}
						{t('Disabled')} ({inactiveConfigs.length})
					</button>
					{showDisabled &&
						inactiveConfigs.map((config) => renderCard(config, false))}
				</div>
			)}
		</div>
	);
};

export default ToolConfigCards;
