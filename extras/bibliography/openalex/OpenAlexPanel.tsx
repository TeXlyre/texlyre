// extras/bibliography/openalex/OpenAlexPanel.tsx
import { useEffect, useState } from 'react';
import type React from 'react';
import { t } from '@/i18n';

import type { BibliographyPanelProps } from '@/plugins/PluginInterface';
import { useSecrets } from '@/hooks/useSecrets';
import { useBibliography } from '@/hooks/useBibliography';
import {
	DisconnectIcon,
	KeyIcon,
	UpdateIcon,
	ImportIcon,
	SearchIcon,
} from '@/components/common/Icons';
import { openAlexService } from './OpenAlexService';
import { WORK_TYPES } from './OpenAlexAPIService';
import type { OpenAlexFilters } from './OpenAlexAPIService';
import OpenAlexConnectionModal from './OpenAlexConnectionModal';

const OpenAlexPanel: React.FC<BibliographyPanelProps> = ({
	className = '',
	onFiltersChange,
}) => {
	const secrets = useSecrets();
	const {
		importAllExternal,
		updateAllLocal,
		isBulkOperating,
		targetBibFile,
		externalEntries,
		localEntries,
	} = useBibliography();
	const [showModal, setShowModal] = useState(false);
	const [connectionStatus, setConnectionStatus] = useState(
		openAlexService.getConnectionStatus(),
	);
	const [existingEmail, setExistingEmail] = useState<string | undefined>();
	const [hasExistingApiKey, setHasExistingApiKey] = useState(false);
	const [filters, setFilters] = useState<OpenAlexFilters>({});
	const [showFilters, setShowFilters] = useState(false);

	useEffect(() => {
		openAlexService.setSecretsContext(secrets);
	}, [secrets]);

	useEffect(() => {
		const unsubscribe = openAlexService.addStatusListener(setConnectionStatus);
		return unsubscribe;
	}, []);

	useEffect(() => {
		const checkAndConnect = async () => {
			const creds = await openAlexService.getStoredCredentials();
			if (creds) {
				setExistingEmail(creds.email);
				setHasExistingApiKey(!!creds.apiKey);
				await openAlexService.autoConnect();
			}
		};
		checkAndConnect();
	}, []);

	const handleConnect = async (apiKey?: string, email?: string) => {
		await openAlexService.connect(apiKey, email);
		const creds = await openAlexService.getStoredCredentials();
		setExistingEmail(creds?.email);
		setHasExistingApiKey(!!creds?.apiKey);
	};

	const handleDisconnect = async () => {
		await openAlexService.disconnect();
		setExistingEmail(undefined);
		setHasExistingApiKey(false);
	};

	const updateFilter = <K extends keyof OpenAlexFilters>(
		key: K,
		value: OpenAlexFilters[K],
	) => {
		const next = { ...filters, [key]: value };
		if (
			value === '' ||
			value === undefined ||
			(value === false && key !== 'isOA')
		) {
			delete next[key];
		}
		setFilters(next);
		onFiltersChange?.(next);
	};

	const clearFilters = () => {
		setFilters({});
		onFiltersChange?.({});
	};

	const hasFilters = Object.keys(filters).length > 0;

	const hasUpdatable = localEntries.some((e) =>
		externalEntries.some(
			(ext) =>
				(ext.remoteId && ext.remoteId === e.remoteId) || ext.key === e.key,
		),
	);
	const hasImportable = externalEntries.some((e) => !e.isImported);

	return (
		<div className={`ui-stack ${className}`} data-gap='sm'>
			{connectionStatus === 'disconnected' && (
				<div
					className='ui-card ui-stack'
					data-gap='sd'
					data-padding='md'
					data-surface='secondary'
				>
					<p>{t('Connect to OpenAlex to search 250M+ scholarly works.')}</p>
					<button
						type='button'
						className='button primary'
						onClick={() => setShowModal(true)}
					>
						{t('Connect to OpenAlex')}
					</button>
				</div>
			)}

			{connectionStatus === 'connecting' && (
				<div
					className='ui-card ui-stack'
					data-gap='sd'
					data-padding='md'
					data-surface='secondary'
				>
					<p>{t('Connecting to OpenAlex...')}</p>
				</div>
			)}

			{connectionStatus === 'error' && (
				<div
					className='ui-card ui-stack'
					data-gap='sd'
					data-padding='md'
					data-surface='secondary'
				>
					<p className='ui-message' data-tone='error'>
						{t('Failed to connect to {provider}', { provider: 'OpenAlex' })}
					</p>
					<div
						className='ui-toolbar'
						data-width='full'
						data-justify='between'
						data-gap='md'
					>
						<div
							className='ui-toolbar-actions'
							data-role='primary'
							data-gap='sm'
						>
							<button
								type='button'
								className='button primary'
								onClick={() => setShowModal(true)}
							>
								{t('Reconnect')}
							</button>
						</div>
						<div
							className='ui-toolbar-actions'
							data-role='secondary'
							data-gap='xs'
						>
							<button
								type='button'
								className='button secondary icon-only'
								onClick={handleDisconnect}
								title={t('Disconnect')}
							>
								<DisconnectIcon />
							</button>
						</div>
					</div>
				</div>
			)}

			{connectionStatus === 'connected' && (
				<div className='ui-stack' data-gap='sm'>
					<div
						className='ui-toolbar'
						data-width='full'
						data-justify='between'
						data-gap='md'
					>
						<div
							className='ui-toolbar-actions'
							data-role='primary'
							data-gap='sm'
						>
							<button
								type='button'
								className='button secondary'
								onClick={updateAllLocal}
								disabled={isBulkOperating || !hasUpdatable}
								title={t('Update all local entries from OpenAlex')}
							>
								<UpdateIcon />
								{t('Update')}
							</button>
							<button
								type='button'
								className='button secondary icon-only'
								onClick={importAllExternal}
								disabled={isBulkOperating || !targetBibFile || !hasImportable}
								title={t('Import all unimported OpenAlex entries')}
							>
								<ImportIcon />
							</button>
						</div>
						<div
							className='ui-toolbar-actions'
							data-role='secondary'
							data-gap='xs'
						>
							<button
								type='button'
								className={`button secondary icon-only ${showFilters || hasFilters ? 'active' : ''}`}
								onClick={() => setShowFilters((v) => !v)}
								title={t('Toggle Search Filters')}
							>
								<SearchIcon />
								{hasFilters && (
									<span
										className='ui-status-dot'
										data-tone='accent'
										data-placement='corner'
									/>
								)}
							</button>
							<button
								type='button'
								className='button secondary icon-only'
								onClick={() => setShowModal(true)}
								title={t('Edit Credentials')}
							>
								<KeyIcon />
							</button>
							<button
								type='button'
								className='button secondary icon-only'
								onClick={handleDisconnect}
								title={t('Disconnect')}
							>
								<DisconnectIcon />
							</button>
						</div>
					</div>

					{showFilters && (
						<div className='ui-card ui-stack' data-gap='sm' data-padding='sm'>
							<div className='ui-toolbar' data-justify='between'>
								<span
									className='ui-menu-title'
									data-size='sm'
									data-tone='secondary'
								>
									{t('Filters')}
								</span>
								{hasFilters && (
									<button
										type='button'
										className='button '
										data-variant='text'
										onClick={clearFilters}
									>
										{t('Clear')}
									</button>
								)}
							</div>

							<div className='ui-field'>
								<label>{t('Author')}</label>
								<input
									type='text'
									placeholder={t('Author name')}
									value={filters.authorQuery || ''}
									onChange={(e) =>
										updateFilter('authorQuery', e.target.value || undefined)
									}
									className='ui-field-control'
								/>
							</div>

							<div className='ui-field'>
								<label>{t('Type')}</label>
								<select
									value={filters.type || ''}
									onChange={(e) =>
										updateFilter('type', e.target.value || undefined)
									}
									className='ui-field-control'
								>
									<option value=''>{t('Any type')}</option>
									{WORK_TYPES.map((type) => (
										<option key={type} value={type}>
											{type}
										</option>
									))}
								</select>
							</div>

							<div className='ui-field'>
								<label>{t('Year')}</label>
								<div className='ui-control-cluster'>
									<input
										type='number'
										placeholder={t('From')}
										min={1000}
										max={new Date().getFullYear()}
										value={filters.yearFrom || ''}
										onChange={(e) =>
											updateFilter(
												'yearFrom',
												e.target.value ? Number(e.target.value) : undefined,
											)
										}
										className='ui-field-control'
									/>
									<span className='ui-note'>–</span>
									<input
										type='number'
										placeholder={t('To')}
										min={filters.yearFrom ?? 1000}
										max={new Date().getFullYear()}
										value={filters.yearTo || ''}
										onChange={(e) =>
											updateFilter(
												'yearTo',
												e.target.value ? Number(e.target.value) : undefined,
											)
										}
										className='ui-field-control'
									/>
								</div>
							</div>

							<div className='ui-field'>
								<label>{t('Open Access')}</label>
								<select
									value={filters.isOA === undefined ? '' : String(filters.isOA)}
									onChange={(e) =>
										updateFilter(
											'isOA',
											e.target.value === ''
												? undefined
												: e.target.value === 'true',
										)
									}
									className='ui-field-control'
								>
									<option value=''>{t('Any')}</option>
									<option value='true'>{t('Open Access only')}</option>
									<option value='false'>{t('Not Open Access')}</option>
								</select>
							</div>

							<div className='ui-field'>
								<label>{t('Has DOI')}</label>
								<select
									value={
										filters.hasDoi === undefined ? '' : String(filters.hasDoi)
									}
									onChange={(e) =>
										updateFilter(
											'hasDoi',
											e.target.value === ''
												? undefined
												: e.target.value === 'true',
										)
									}
									className='ui-field-control'
								>
									<option value=''>{t('Any')}</option>
									<option value='true'>{t('Yes')}</option>
									<option value='false'>{t('No')}</option>
								</select>
							</div>

							<div className='ui-field'>
								<label>{t('Min. Citations')}</label>
								<input
									type='number'
									min={0}
									placeholder='0'
									value={filters.minCitations || ''}
									onChange={(e) =>
										updateFilter(
											'minCitations',
											e.target.value ? Number(e.target.value) : undefined,
										)
									}
									className='ui-field-control'
								/>
							</div>
						</div>
					)}
				</div>
			)}

			<OpenAlexConnectionModal
				isOpen={showModal}
				onClose={() => setShowModal(false)}
				onConnect={handleConnect}
				existingEmail={existingEmail}
				hasExistingApiKey={hasExistingApiKey}
			/>
		</div>
	);
};

export default OpenAlexPanel;
