// extras/bibliography/zotero/ZoteroPanel.tsx
import { t } from '@/i18n';
import type React from 'react';
import { useEffect, useState } from 'react';

import type { BibliographyPanelProps } from '@/plugins/PluginInterface';
import { useSecrets } from '@/hooks/useSecrets';
import { useProperties } from '@/hooks/useProperties';
import { useBibliography } from '@/hooks/useBibliography';
import {
	RepositoryIcon,
	DisconnectIcon,
	ImportIcon,
	UpdateIcon,
} from '@/components/common/Icons';
import { zoteroService } from './ZoteroService';
import ZoteroConnectionModal from './ZoteroConnectionModal';

function getCurrentProjectId(): string | undefined {
	const urlHash = window.location.hash.substring(1);
	const fragments = urlHash.split('/');
	const yjsFragment = fragments.find((f) => f.startsWith('yjs='));
	return yjsFragment ? yjsFragment.slice(4) : undefined;
}

const ZoteroPanel: React.FC<BibliographyPanelProps> = ({ className = '' }) => {
	const secrets = useSecrets();
	const properties = useProperties();
	const {
		importAllExternal,
		updateAllLocal,
		isBulkOperating,
		targetBibFile,
		externalEntries,
		localEntries,
		handleRefresh,
	} = useBibliography();
	const [showModal, setShowModal] = useState(false);
	const [existingCredentials, setExistingCredentials] = useState<{
		apiKey: string;
		userId: string;
	} | null>(null);
	const [connectionStatus, setConnectionStatus] = useState(
		zoteroService.getConnectionStatus(),
	);

	useEffect(() => {
		zoteroService.setSecretsContext(secrets);
		zoteroService.setPropertiesContext(properties);
	}, [secrets, properties]);

	useEffect(() => {
		const unsubscribe = zoteroService.addStatusListener(setConnectionStatus);
		return unsubscribe;
	}, []);

	useEffect(() => {
		const checkCredentials = async () => {
			const creds = await zoteroService.getStoredCredentials();
			setExistingCredentials(creds);
			if (creds) {
				const projectId = getCurrentProjectId();
				await zoteroService.autoConnect(projectId);
			}
		};
		checkCredentials();
	}, []);

	const handleConnect = async (
		apiKey: string,
		userId: string,
		libraryId: string,
		libraryType: 'user' | 'group',
	) => {
		const projectId = getCurrentProjectId();
		await zoteroService.connect(
			apiKey,
			userId,
			libraryId,
			libraryType,
			projectId,
		);
		const creds = await zoteroService.getStoredCredentials();
		setExistingCredentials(creds);
		await handleRefresh();
	};

	const handleDisconnect = async () => {
		const projectId = getCurrentProjectId();
		await zoteroService.disconnect(projectId);
		setExistingCredentials(null);
	};

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
					data-gap='sm'
					data-padding='md'
					data-surface='secondary'
				>
					<p>
						{t('Connect to your Zotero library to access your bibliography.')}
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
								{t('Connect to Zotero')}
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
								title={t('Disconnect (deletes API key)')}
							>
								<DisconnectIcon />
							</button>
						</div>
					</div>
				</div>
			)}

			{connectionStatus === 'connected' && (
				<div
					className='ui-card ui-stack'
					data-gap='sm'
					data-padding='md'
					data-surface='secondary'
				>
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
								title={t('Update all local entries from Zotero')}
							>
								<UpdateIcon />
								{t('Update')}
							</button>
							<button
								type='button'
								className='button secondary icon-only'
								onClick={importAllExternal}
								disabled={isBulkOperating || !targetBibFile || !hasImportable}
								title={t('Import all unimported Zotero entries')}
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
								className='button secondary icon-only'
								onClick={() => setShowModal(true)}
								title={t('Change library')}
							>
								<RepositoryIcon />
							</button>
							<button
								type='button'
								className='button secondary icon-only'
								onClick={handleDisconnect}
								title={t('Disconnect (deletes API key)')}
							>
								<DisconnectIcon />
							</button>
						</div>
					</div>
				</div>
			)}

			{connectionStatus === 'connecting' && (
				<div
					className='ui-card ui-stack'
					data-gap='sm'
					data-padding='md'
					data-surface='secondary'
				>
					<p>{t('Connecting to Zotero...')}</p>
				</div>
			)}

			{connectionStatus === 'error' && (
				<div
					className='ui-card ui-stack'
					data-gap='sm'
					data-padding='md'
					data-surface='secondary'
				>
					<p className='ui-message' data-tone='error'>
						{t('Failed to connect to {provider}', { provider: 'Zotero' })}
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
								title={t('Disconnect (deletes API key)')}
							>
								<DisconnectIcon />
							</button>
						</div>
					</div>
				</div>
			)}
			<ZoteroConnectionModal
				isOpen={showModal}
				onClose={() => setShowModal(false)}
				onConnect={handleConnect}
				existingApiKey={existingCredentials?.apiKey}
				existingUserId={existingCredentials?.userId}
			/>
		</div>
	);
};

export default ZoteroPanel;
