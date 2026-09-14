import type React from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { t } from '@/i18n';
import { useSecrets } from '@/hooks/useSecrets';
import { useSettings } from '@/hooks/useSettings';
import { DisconnectIcon, GitRemoteIcon } from '@/components/common/Icons';
import Modal from '@/components/common/Modal';
import { fileHandlerService } from '@/services/FileHandlerService';
import { fileStoreService } from '@/services/FileStoreService';
import {
	type GitDiskStatus,
	gitFileSystemService,
} from '@/services/GitFileSystemService';
import {
	type GitCredentialChoice,
	gitSyncService,
} from '@/services/GitSyncService';
import type {
	GitRemoteBranch,
	GitRemoteProvider,
	GitRemoteRepository,
} from '@/types/gitRemote';
import { workspaceService } from '@/services/WorkspaceService';
import { ensureGitRemoteBranch } from '@/utils/gitUtils';
import GitCredentialSelect from './GitCredentialSelect';

interface GitRemoteModalProps {
	isOpen: boolean;
	onClose: () => void;
	projectId: string;
}

const EMPTY_DISK_STATUS: GitDiskStatus = {
	attached: false,
	hasGit: false,
	diskHead: null,
	browserHead: null,
	conflict: false,
};

const GitRemoteModal: React.FC<GitRemoteModalProps> = ({
	isOpen,
	onClose,
	projectId,
}) => {
	const { getSecret, setSecret, removeSecret } = useSecrets();
	const { getSetting } = useSettings();
	const fileSystem = useMemo(
		() => gitFileSystemService.get(projectId),
		[projectId],
	);
	const [providers, setProviders] = useState<GitRemoteProvider[]>([]);
	const initialRemote = gitSyncService.getConfig(projectId);
	const [gitSettings, setGitSettings] = useState(() =>
		fileSystem.getSettings(),
	);
	const [workspaceCleanAnnotations, setWorkspaceCleanAnnotations] = useState(
		() => fileHandlerService.getWorkspaceCleanAnnotations(projectId),
	);
	const [remote, setRemote] = useState(initialRemote);
	const [diskStatus, setDiskStatus] =
		useState<GitDiskStatus>(EMPTY_DISK_STATUS);
	const [providerId, setProviderId] = useState(
		initialRemote?.providerId ?? providers[0]?.id ?? '',
	);
	const [credentialSource, setCredentialSource] =
		useState<GitCredentialChoice>('new');
	const [token, setToken] = useState('');
	const [repositories, setRepositories] = useState<GitRemoteRepository[]>([]);
	const [repositoryId, setRepositoryId] = useState(
		initialRemote?.repositoryId ?? '',
	);
	const [repositoryQuery, setRepositoryQuery] = useState(
		initialRemote?.repositoryLabel ?? '',
	);
	const [branches, setBranches] = useState<GitRemoteBranch[]>([]);
	const [branch, setBranch] = useState(initialRemote?.branch ?? 'main');
	const [repositoryReady, setRepositoryReady] = useState(false);
	const [alignment, setAlignment] = useState<'git' | 'disk'>('git');
	const [showAlignment, setShowAlignment] = useState(false);
	const [isBusy, setIsBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const provider: GitRemoteProvider | null = useMemo(
		() => providers.find((candidate) => candidate.id === providerId) ?? null,
		[providerId, providers],
	);
	const workspaceStatus = workspaceService.getStatus();
	const hasLinkedFolder = workspaceStatus.projectId === projectId;

	useEffect(() => {
		provider?.configure?.(getSetting);
	}, [getSetting, provider]);

	const refreshDisk = useCallback(async () => {
		setDiskStatus(await fileSystem.getDiskStatus());
	}, [fileSystem]);

	const remirrorFolder = useCallback(async () => {
		if (
			workspaceService.getStatus().projectId !== projectId ||
			!fileHandlerService.hasWorkspace() ||
			fileStoreService.getCurrentProjectId() !== projectId
		) {
			return;
		}
		const files = await fileStoreService.getAllFiles(false, false, true);
		await fileHandlerService.mirrorFiles(files);
	}, [projectId]);

	/* biome-ignore lint/correctness/useExhaustiveDependencies(isOpen): Opening the modal intentionally refreshes settings backed by external services. */
	useEffect(() => {
		setGitSettings(fileSystem.getSettings());
		setWorkspaceCleanAnnotations(
			fileHandlerService.getWorkspaceCleanAnnotations(projectId),
		);
	}, [fileSystem, isOpen, projectId]);

	useEffect(() => {
		if (!isOpen) return;
		let active = true;
		void gitSyncService.getProviders().then((available) => {
			if (!active) return;
			setProviders(available);
			setProviderId((current) => current || available[0]?.id || '');
		});
		return () => {
			active = false;
		};
	}, [isOpen]);

	useEffect(() => {
		setRemote(gitSyncService.getConfig(projectId));
		return gitSyncService.addListener(projectId, (next) => setRemote(next));
	}, [projectId]);

	useEffect(() => {
		const needsAlignment =
			isOpen &&
			!diskStatus.conflict &&
			(gitSettings.storeGitOnDisk || diskStatus.hasGit) &&
			workspaceCleanAnnotations !== gitSettings.gitCleanAnnotations;
		setShowAlignment(needsAlignment);
	}, [
		diskStatus.conflict,
		diskStatus.hasGit,
		gitSettings.gitCleanAnnotations,
		gitSettings.storeGitOnDisk,
		isOpen,
		workspaceCleanAnnotations,
	]);

	useEffect(() => {
		if (!isOpen) return;
		let active = true;

		const loadOpenState = async () => {
			try {
				await refreshDisk();
				const current = await gitSyncService.prepareConfiguredRemote(
					projectId,
					getSetting,
				);
				if (!current || !active) return;

				setProviderId(current.providerId);
				setRepositoryId(current.repositoryId);
				setRepositoryQuery(current.repositoryLabel);
				setBranch(current.branch);
				setCredentialSource(current.credentialSource);
				setToken('');
			} catch (openError) {
				if (active) {
					setError(
						openError instanceof Error
							? openError.message
							: t('Failed to load Git remote status'),
					);
				}
			}
		};

		void loadOpenState();
		const onStorageChanged = () => {
			void refreshDisk().catch((statusError) => {
				if (active) {
					setError(
						statusError instanceof Error
							? statusError.message
							: t('Failed to refresh Git storage status'),
					);
				}
			});
		};
		document.addEventListener('git-storage-changed', onStorageChanged);

		return () => {
			active = false;
			document.removeEventListener('git-storage-changed', onStorageChanged);
		};
	}, [getSetting, isOpen, projectId, refreshDisk]);

	const normalizedRepositoryQuery = provider?.normalizeRepositoryInput
		? provider.normalizeRepositoryInput(repositoryQuery)
		: repositoryQuery.trim();
	const filteredRepositories = repositories.filter((item) =>
		item.label.toLowerCase().includes(repositoryQuery.trim().toLowerCase()),
	);
	const hasCredential = credentialSource !== 'new' || Boolean(token.trim());
	const effectiveRepositoryId = repositoryId || normalizedRepositoryQuery;
	const effectiveRepository = repositories.find(
		(item) => item.id === effectiveRepositoryId,
	);
	const effectiveRepositoryLabel =
		effectiveRepository?.label ||
		normalizedRepositoryQuery ||
		effectiveRepositoryId;

	const run = async (action: () => Promise<void>) => {
		setError(null);
		setIsBusy(true);
		try {
			await action();
		} catch (actionError) {
			setError(
				actionError instanceof Error
					? actionError.message
					: t('Git action failed'),
			);
		} finally {
			setIsBusy(false);
		}
	};

	const resolveCredentialToken = useCallback(async (): Promise<string> => {
		if (credentialSource === 'new') return token.trim();
		return (
			(await gitSyncService.getCredentialToken(
				providerId,
				projectId,
				credentialSource,
				{ getSecret },
			)) ?? ''
		).trim();
	}, [credentialSource, getSecret, projectId, providerId, token]);

	const loadRepositories = () =>
		run(async () => {
			if (!provider) return;
			const credentialToken = await resolveCredentialToken();
			if (!credentialToken) throw new Error(t('A credential is required'));
			if (!(await provider.testConnection(credentialToken))) {
				throw new Error(
					t('The selected credential could not be authenticated'),
				);
			}
			const loaded = await provider.listRepositories(credentialToken);
			setRepositories(loaded);
			if (!repositoryQuery && remote?.repositoryLabel) {
				setRepositoryQuery(remote.repositoryLabel);
			}
		});

	const loadBranches = async (nextRepositoryId: string, nextLabel?: string) => {
		setRepositoryId(nextRepositoryId);
		if (nextLabel) setRepositoryQuery(nextLabel);
		setBranches([]);
		setRepositoryReady(false);
		if (!provider || !nextRepositoryId) return;
		const credentialToken = await resolveCredentialToken();
		if (!credentialToken) throw new Error(t('A credential is required'));
		const loaded = await provider.listBranches(
			credentialToken,
			nextRepositoryId,
		);
		setBranches(loaded);
		const repository = repositories.find(
			(item) => item.id === nextRepositoryId,
		);
		const preferred =
			loaded.find((item) => item.name === repository?.defaultBranch) ??
			loaded.find((item) => item.name === branch) ??
			loaded.find((item) => item.name === 'main') ??
			loaded.find((item) => item.name === 'master') ??
			loaded[0];
		setBranch(preferred?.name ?? repository?.defaultBranch ?? branch ?? 'main');
		setRepositoryReady(true);
	};

	const connectRemote = () =>
		run(async () => {
			const branchName = branch.trim();
			if (!provider || !effectiveRepositoryId || !branchName) {
				throw new Error(t('Choose a provider, repository, and branch'));
			}
			const repository = repositories.find(
				(item) => item.id === effectiveRepositoryId,
			);
			const credentialToken = await resolveCredentialToken();
			if (!credentialToken) throw new Error(t('A credential is required'));
			await ensureGitRemoteBranch(
				provider,
				credentialToken,
				effectiveRepositoryId,
				branchName,
				branches,
				remote?.providerId === provider.id &&
					remote.repositoryId === effectiveRepositoryId
					? remote.branch
					: repository?.defaultBranch,
			);
			await gitSyncService.connect(
				projectId,
				{
					providerId: provider.id,
					repositoryId: effectiveRepositoryId,
					repositoryLabel:
						repository?.label ??
						(remote?.repositoryId === effectiveRepositoryId
							? remote.repositoryLabel
							: effectiveRepositoryLabel),
					branch: branchName,
				},
				{ source: credentialSource, token },
				{ getSecret, setSecret },
			);
		});

	const toggleGitClean = (clean: boolean) =>
		run(async () => {
			fileSystem.setGitCleanAnnotations(clean);
			const next = fileSystem.getSettings();
			setGitSettings(next);
			if (next.storeGitOnDisk) {
				fileHandlerService.setWorkspaceCleanAnnotations(projectId, clean);
				setWorkspaceCleanAnnotations(clean);
				await remirrorFolder();
				await fileSystem.syncGitToDisk();
			}
		});

	const toggleDiskGit = (enabled: boolean) =>
		run(async () => {
			if (!enabled) {
				fileSystem.unlinkGitFromDisk();
				setGitSettings(fileSystem.getSettings());
				setShowAlignment(false);
				return;
			}

			const current = fileSystem.getSettings();
			const folderClean =
				fileHandlerService.getWorkspaceCleanAnnotations(projectId);
			setWorkspaceCleanAnnotations(folderClean);
			if (folderClean !== current.gitCleanAnnotations) {
				setShowAlignment(true);
				return;
			}

			await fileSystem.attachStoredDisk();
			fileSystem.linkGitToDisk();
			setGitSettings(fileSystem.getSettings());
			await fileSystem.syncGitToDisk();
			await refreshDisk();
		});

	const applyAlignment = () =>
		run(async () => {
			await fileSystem.attachStoredDisk();
			if (alignment === 'disk') {
				fileSystem.setGitCleanAnnotations(workspaceCleanAnnotations);
			} else {
				fileHandlerService.setWorkspaceCleanAnnotations(
					projectId,
					gitSettings.gitCleanAnnotations,
				);
				setWorkspaceCleanAnnotations(gitSettings.gitCleanAnnotations);
			}
			fileSystem.linkGitToDisk();
			setGitSettings(fileSystem.getSettings());
			setShowAlignment(false);
			await remirrorFolder();
			await fileSystem.syncGitToDisk();
			await refreshDisk();
		});

	return (
		<Modal
			isOpen={isOpen}
			onClose={onClose}
			title={t('Git Remote')}
			icon={GitRemoteIcon}
			size='medium'
		>
			<div className='git-remote-modal ui-stack' data-gap='lg'>
				{error ? (
					<div className='ui-message' data-tone='error'>
						{error}
					</div>
				) : null}

				<section
					className='ui-card ui-stack'
					data-gap='sm'
					data-padding='md'
					data-surface='secondary'
				>
					<label className='checkbox-control'>
						<input
							type='checkbox'
							checked={gitSettings.gitCleanAnnotations}
							disabled={isBusy}
							onChange={(event) => void toggleGitClean(event.target.checked)}
						/>
						<span>{t('Clean annotations')}</span>
					</label>
					<p className='ui-note'>
						{t(
							'Removes TeXlyre annotation markers from files written by future Git commits. Existing commits are not changed.',
						)}
					</p>

					{hasLinkedFolder ? (
						<>
							<label className='checkbox-control'>
								<input
									type='checkbox'
									checked={gitSettings.storeGitOnDisk}
									disabled={isBusy}
									onChange={(event) => void toggleDiskGit(event.target.checked)}
								/>
								<span>{t('Store Git history in linked folder')}</span>
							</label>
							{diskStatus.hasGit ? (
								<p className='ui-note'>
									{t('The linked folder contains .git')}
								</p>
							) : null}
						</>
					) : null}

					{showAlignment ? (
						<div
							className='git-alignment-choice ui-stack ui-message'
							data-tone='warning'
							data-gap='sm'
						>
							<p>
								{t(
									'Folder files and Git currently use different annotation modes. Choose which mode both should use while Git is stored on disk.',
								)}
							</p>
							<label className='checkbox-control'>
								<input
									type='radio'
									name='git-clean-alignment'
									checked={alignment === 'disk'}
									onChange={() => setAlignment('disk')}
								/>
								{t('Use folder setting')}
							</label>
							<label className='checkbox-control'>
								<input
									type='radio'
									name='git-clean-alignment'
									checked={alignment === 'git'}
									onChange={() => setAlignment('git')}
								/>
								{t('Use Git setting')}
							</label>
							<button
								type='button'
								className='button primary'
								onClick={() => void applyAlignment()}
							>
								{t('Apply')}
							</button>
						</div>
					) : null}

					{diskStatus.conflict ? (
						<div className='ui-message' data-tone='warning'>
							<p>
								{t(
									'The browser and folder contain different Git histories. Neither has been overwritten.',
								)}
							</p>
							<div className='ui-actions' data-wrap='true'>
								<button
									type='button'
									className='button secondary'
									onClick={() =>
										void run(async () => {
											setDiskStatus(
												await fileSystem.resolveDiskConflict('disk'),
											);
										})
									}
								>
									{t('Use folder history')}
								</button>
								<button
									type='button'
									className='button secondary'
									onClick={() =>
										void run(async () => {
											setDiskStatus(
												await fileSystem.resolveDiskConflict('browser'),
											);
										})
									}
								>
									{t('Keep browser history')}
								</button>
							</div>
						</div>
					) : null}
				</section>

				<section
					className='ui-card ui-stack'
					data-gap='sm'
					data-padding='md'
					data-surface='secondary'
				>
					{remote ? (
						<div className='ui-list' data-gap='sm'>
							<div className='ui-meta' data-layout='row'>
								<strong>{t('Remote:')}</strong>
								<span>
									{remote.repositoryLabel} ({remote.branch})
								</span>
							</div>
							<button
								type='button'
								className='button secondary'
								disabled={isBusy}
								onClick={() =>
									void run(async () => {
										await gitSyncService.disconnect(projectId, {
											removeSecret,
										});
										setRepositories([]);
										setRepositoryId('');
										setRepositoryQuery('');
										setRepositoryReady(false);
										setBranches([]);
										setBranch('main');
										setToken('');
										setCredentialSource('new');
									})
								}
							>
								<DisconnectIcon /> {t('Disconnect remote')}
							</button>
						</div>
					) : null}

					<h3>{remote ? t('Change remote') : t('Connect remote')}</h3>
					{providers.length === 0 ? (
						<p>{t('No Git remote providers are available in this build.')}</p>
					) : (
						<>
							<label className='ui-field-label'>{t('Provider')}</label>
							<select
								value={providerId}
								disabled={isBusy}
								onChange={(event) => {
									setProviderId(event.target.value);
									setToken('');
									setCredentialSource('new');
									setRepositories([]);
									setRepositoryQuery('');
									setRepositoryId('');
									setRepositoryReady(false);
									setBranches([]);
								}}
							>
								{providers.map((item) => (
									<option key={item.id} value={item.id}>
										{item.displayName}
									</option>
								))}
							</select>

							<label className='ui-field-label'>{t('Credential')}</label>
							<GitCredentialSelect
								providerId={providerId}
								projectId={projectId}
								value={token}
								source={credentialSource}
								onChange={setToken}
								onSourceChange={setCredentialSource}
								disabled={isBusy}
							/>
							<button
								type='button'
								className='button secondary'
								disabled={isBusy || !provider || !hasCredential}
								onClick={() => void loadRepositories()}
							>
								{t('Load repositories')}
							</button>

							{repositories.length > 0 || hasCredential ? (
								<>
									<label className='ui-field-label'>{t('Repository')}</label>
									<input
										type='text'
										value={repositoryQuery}
										disabled={isBusy}
										onChange={(event) => {
											setRepositoryQuery(event.target.value);
											setRepositoryId('');
											setRepositoryReady(false);
											setBranches([]);
										}}
										placeholder={t(
											'Search repositories or paste repository path / URL',
										)}
									/>
									{repositories.length > 0 ? (
										<select
											value={repositoryId}
											disabled={isBusy}
											onChange={(event) => {
												const selected = repositories.find(
													(item) => item.id === event.target.value,
												);
												setRepositoryId(event.target.value);
												setRepositoryQuery(
													selected?.label ?? event.target.value,
												);
												setRepositoryReady(false);
												setBranches([]);
											}}
										>
											<option value=''>
												{t('Choose from loaded repositories...')}
											</option>
											{filteredRepositories.map((item) => (
												<option key={item.id} value={item.id}>
													{item.label}
												</option>
											))}
										</select>
									) : null}
									<button
										type='button'
										className='button secondary'
										disabled={isBusy || !effectiveRepositoryId}
										onClick={() =>
											void run(() =>
												loadBranches(
													effectiveRepositoryId,
													effectiveRepositoryLabel,
												),
											)
										}
									>
										{t('Load branches')}
									</button>
								</>
							) : null}

							{repositoryReady ? (
								<>
									<label className='ui-field-label'>{t('Branch')}</label>
									<input
										type='text'
										list='git-remote-branches'
										value={branch}
										disabled={isBusy}
										onChange={(event) => setBranch(event.target.value)}
										placeholder={t('Branch name')}
									/>
									<datalist id='git-remote-branches'>
										{branches.map((item) => (
											<option key={item.name} value={item.name} />
										))}
									</datalist>
									{branches.length > 0 &&
									!branches.some((item) => item.name === branch.trim()) ? (
										<p className='ui-note'>
											{t(
												'A new remote branch will be created when you connect.',
											)}
										</p>
									) : null}
									<button
										type='button'
										className='button primary'
										disabled={
											isBusy || !effectiveRepositoryId || !branch.trim()
										}
										onClick={() => void connectRemote()}
									>
										{t('Connect')}
									</button>
								</>
							) : null}
						</>
					)}
				</section>
			</div>
		</Modal>
	);
};

export default GitRemoteModal;
