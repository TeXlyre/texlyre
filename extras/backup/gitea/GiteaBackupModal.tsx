// extras/backup/gitea/GiteaBackupModal.tsx
import { t } from '@/i18n';
import type React from 'react';
import { useEffect, useState } from 'react';
import {
	DisconnectIcon,
	GitBranchIcon,
	GitPushIcon,
	ImportIcon,
	SettingsIcon,
	TrashIcon,
} from '@/components/common/Icons';
import Modal from '@/components/common/Modal';
import SettingsModal from '@/components/settings/SettingsModal';
import { useAuth } from '@/hooks/useAuth';
import { useSecrets } from '@/hooks/useSecrets';
import { useSettings } from '@/hooks/useSettings';
import { formatDate } from '@/utils/dateUtils';
import { giteaAPIService } from './GiteaAPIService';
import { giteaBackupService } from './GiteaBackupService';
import { GiteaIcon } from './Icon';
import './styles.css';

interface GiteaBackupModalProps {
	isOpen: boolean;
	onClose: () => void;
	currentProjectId?: string | null;
	isInEditor?: boolean;
}

const GiteaBackupModal: React.FC<GiteaBackupModalProps> = ({
	isOpen,
	onClose,
	currentProjectId,
	isInEditor = false,
}) => {
	const [showSettings, setShowSettings] = useState(false);
	const [status, setStatus] = useState(giteaBackupService.getStatus());
	const [activities, setActivities] = useState(
		giteaBackupService.getActivities(),
	);
	const [syncScope, setSyncScope] = useState<'current' | 'all'>('current');
	const [isOperating, setIsOperating] = useState(false);
	const [currentProjectName, setCurrentProjectName] = useState<string>('');
	const [commitMessage, setCommitMessage] = useState('');
	const [showConnectionFlow, setShowConnectionFlow] = useState(false);
	const [giteaToken, setGiteaToken] = useState('');
	const [availableRepos, setAvailableRepos] = useState<any[]>([]);
	const [availableBranches, setAvailableBranches] = useState<any[]>([]);
	const [selectedRepo, setSelectedRepo] = useState('');
	const [repoInput, setRepoInput] = useState('');
	const [selectedBranch, setSelectedBranch] = useState('main');
	const [displayBranch, setDisplayBranch] = useState<string>('main');
	const [error, setError] = useState<string | null>(null);
	const [connectionStep, setConnectionStep] = useState<
		'token' | 'repo' | 'branch'
	>('token');

	const { getProjectById } = useAuth();
	const secrets = useSecrets();
	const { getSetting } = useSettings();

	useEffect(() => {
		const apiEndpoint =
			(getSetting('gitea-backup-api-endpoint')?.value as string) ||
			'https://gitea.com/api/v1';
		const defaultBranch =
			(getSetting('gitea-backup-default-branch')?.value as string) || 'main';
		const defaultCommitMessage =
			(getSetting('gitea-backup-default-commit-message')?.value as string) ||
			'';
		const ignorePatterns =
			(getSetting('gitea-backup-ignore-patterns')?.value as string) || '';
		const maxFileSize =
			(getSetting('gitea-backup-max-file-size')?.value as number) || 100;
		const requestTimeout =
			(getSetting('gitea-backup-request-timeout')?.value as number) || 30;
		const maxRetryAttempts =
			(getSetting('gitea-backup-max-retry-attempts')?.value as number) || 3;
		const activityHistoryLimit =
			(getSetting('gitea-backup-activity-history-limit')?.value as number) ||
			50;

		giteaBackupService.setSettings({
			apiEndpoint,
			defaultBranch,
			defaultCommitMessage,
			ignorePatterns: ignorePatterns
				.split(',')
				.map((s) => s.trim())
				.filter(Boolean),
			maxFileSize,
			requestTimeout,
			maxRetryAttempts,
			activityHistoryLimit,
		});

		setSelectedBranch(defaultBranch);

		if (!commitMessage) {
			setCommitMessage(defaultCommitMessage);
		}
	}, [getSetting, commitMessage]);

	useEffect(() => {
		giteaBackupService.setSecretsContext(secrets);
	}, [secrets]);

	useEffect(() => {
		const unsubscribeStatus = giteaBackupService.addStatusListener(setStatus);
		const unsubscribeActivities =
			giteaBackupService.addActivityListener(setActivities);
		return () => {
			unsubscribeStatus();
			unsubscribeActivities();
		};
	}, []);

	useEffect(() => {
		const loadProjectName = async () => {
			if (isInEditor && currentProjectId) {
				try {
					const project = await getProjectById(currentProjectId);
					setCurrentProjectName(project?.name || 'Current project');
				} catch {
					setCurrentProjectName('Current project');
				}
			}
		};
		loadProjectName();
	}, [currentProjectId, getProjectById, isInEditor]);

	useEffect(() => {
		if (isOpen) {
			const checkExistingCredentials = async () => {
				const projectId =
					isInEditor && syncScope === 'current' ? currentProjectId : undefined;
				if (await giteaBackupService.hasStoredCredentials(projectId)) {
					try {
						const storedRepo =
							await giteaBackupService.getStoredRepository(projectId);
						const storedBranch =
							await giteaBackupService.getStoredBranch(projectId);
						if (storedRepo) {
							setStatus((prev) => ({
								...prev,
								isConnected: true,
								isEnabled: true,
								repository: storedRepo,
							}));
							setSelectedRepo(storedRepo);
							setSelectedBranch(storedBranch);
							setDisplayBranch(storedBranch);
						}
					} catch (error) {
						console.log('Could not load stored credentials.', error);
					}
				}
			};
			checkExistingCredentials();
		}
	}, [isOpen, isInEditor, syncScope, currentProjectId]);

	const normalizeGiteaRepoInput = (input: string): string => {
		const trimmed = input.trim();
		if (!trimmed) return '';

		const urlMatch = trimmed.match(
			/(?:gitea|github|codeberg|forgejo|gitlab).*?[/:]([^/\s]+)\/([^/\s#?]+)(?:\.git)?/i,
		);

		if (urlMatch) {
			return `${urlMatch[1]}/${urlMatch[2].replace(/\.git$/, '')}`;
		}

		const ownerRepoMatch = trimmed.match(/^([^/\s]+)\/([^/\s]+)$/);

		if (ownerRepoMatch) {
			return `${ownerRepoMatch[1]}/${ownerRepoMatch[2].replace(/\.git$/, '')}`;
		}

		return trimmed;
	};

	const normalizedRepoInput = normalizeGiteaRepoInput(repoInput);

	const filteredRepos = availableRepos.filter((repo) =>
		(repo.full_name || '')
			.toLowerCase()
			.includes(repoInput.trim().toLowerCase()),
	);

	const effectiveSelectedRepo = selectedRepo || normalizedRepoInput;

	const handleAsyncOperation = async (operation: () => Promise<void>) => {
		if (isOperating) return;
		setIsOperating(true);
		setError(null);
		try {
			await operation();
		} catch (error) {
			console.error('Operation failed:', error);
			setError(
				t('Operation failed: {error}', {
					error: error instanceof Error ? error.message : String(error),
				}),
			);
		} finally {
			setIsOperating(false);
		}
	};

	const handleConnect = () =>
		handleAsyncOperation(async () => {
			const result = await giteaBackupService.requestAccess();
			if (result.success) {
				setShowConnectionFlow(true);
				setConnectionStep('token');
				const projectId =
					isInEditor && syncScope === 'current' ? currentProjectId : undefined;
				const storedRepo =
					await giteaBackupService.getStoredRepository(projectId);
				const storedBranch =
					await giteaBackupService.getStoredBranch(projectId);
				if (storedRepo) setSelectedRepo(storedRepo);
				if (storedBranch) setSelectedBranch(storedBranch);
			}
		});

	const handleTokenSubmit = () =>
		handleAsyncOperation(async () => {
			if (!giteaToken.trim()) return;
			const result = await giteaBackupService.connectWithToken(giteaToken);
			if (result.success && result.repositories) {
				setAvailableRepos(result.repositories);
				setConnectionStep('repo');
			} else {
				setError(result.error || t('Failed to connect with token.'));
			}
		});

	const handleRepoSubmit = () =>
		handleAsyncOperation(async () => {
			const repoName = effectiveSelectedRepo;

			if (!repoName?.includes('/')) {
				setError(
					t('Enter a repository as owner/repo or paste a repository URL.'),
				);
				return;
			}

			const [owner, repo] = repoName.split('/');

			const branches = await giteaAPIService.getBranches(
				giteaToken,
				owner,
				repo,
			);

			setSelectedRepo(repoName);
			setAvailableBranches(branches);

			const defaultBranch =
				branches.find((b) => b.name === selectedBranch) ||
				branches.find((b) => b.name === 'main') ||
				branches.find((b) => b.name === 'master') ||
				branches[0];

			if (defaultBranch) setSelectedBranch(defaultBranch.name);

			setConnectionStep('branch');
		});

	const handleBranchSubmit = () =>
		handleAsyncOperation(async () => {
			if (!selectedBranch) return;

			const repoName = effectiveSelectedRepo || selectedRepo;

			if (!repoName?.includes('/')) {
				setError(
					t('Enter a repository as owner/repo or paste a repository URL.'),
				);
				return;
			}

			const projectId =
				isInEditor && syncScope === 'current' ? currentProjectId : undefined;

			const success = await giteaBackupService.connectToRepository(
				giteaToken,
				repoName,
				projectId,
				selectedBranch,
			);

			if (success) {
				setDisplayBranch(selectedBranch);
				setShowConnectionFlow(false);
				setGiteaToken('');
				setSelectedRepo('');
				setRepoInput('');
				setConnectionStep('token');
			}
		});

	const handleChangeConnection = () =>
		handleAsyncOperation(async () => {
			const projectId =
				isInEditor && syncScope === 'current' ? currentProjectId : undefined;

			const credentials =
				await giteaBackupService.getStoredCredentials(projectId);

			if (!credentials) {
				setError(t('Could not retrieve Gitea credentials. Please reconnect.'));
				return;
			}

			setGiteaToken(credentials.token);

			const result = await giteaBackupService.connectWithToken(
				credentials.token,
			);

			if (result.success && result.repositories) {
				setAvailableRepos(result.repositories);
				setSelectedRepo(credentials.target);
				setRepoInput(credentials.target);
				setSelectedBranch(credentials.branch);
				setDisplayBranch(credentials.branch);
				setShowConnectionFlow(true);
				setConnectionStep('repo');
			}
		});

	const handleRepoChange = async (newRepo: string) => {
		setSelectedRepo(newRepo);
		if (newRepo && giteaToken) {
			try {
				const [owner, repo] = newRepo.split('/');
				const branches = await giteaAPIService.getBranches(
					giteaToken,
					owner,
					repo,
				);
				setAvailableBranches(branches);
				const defaultBranch =
					branches.find((b) => b.name === 'main') ||
					branches.find((b) => b.name === 'master') ||
					branches[0];
				if (defaultBranch) {
					setSelectedBranch(defaultBranch.name);
				}
			} catch (error) {
				console.error('Failed to load branches:', error);
			}
		}
	};

	const getScopedProjectId = () =>
		isInEditor && syncScope === 'current' ? currentProjectId : undefined;

	const replaceCommitMessageVariables = (template: string): string => {
		const now = new Date();
		return template
			.replace(/{date}/g, now.toLocaleDateString())
			.replace(/{time}/g, now.toLocaleTimeString());
	};

	const handleExport = () =>
		handleAsyncOperation(async () => {
			if (!commitMessage.trim()) return;
			const finalCommitMessage = replaceCommitMessageVariables(commitMessage);
			await giteaBackupService.exportData(
				getScopedProjectId(),
				finalCommitMessage,
				selectedBranch,
			);
		});

	const handleImport = () =>
		handleAsyncOperation(() =>
			giteaBackupService.importChanges(getScopedProjectId(), selectedBranch),
		);

	const handleDisconnect = () =>
		handleAsyncOperation(async () => {
			await giteaBackupService.disconnect(getScopedProjectId());
			await handleConnect();
		});

	const getActivityIcon = (type: string) =>
		({
			backup_error: '❌',
			import_error: '❌',
			backup_complete: '✅',
			import_complete: '✅',
			backup_start: '📤',
			import_start: '📥',
		})[type] || 'ℹ️';
	const getActivityColor = (type: string) =>
		({
			backup_error: '#dc3545',
			import_error: '#dc3545',
			backup_complete: '#28a745',
			import_complete: '#28a745',
			backup_start: '#007bff',
			import_start: '#6f42c1',
		})[type] || '#6c757d';

	const getDefaultCommitMessagePlaceholder = (): string => {
		const template =
			(getSetting('gitea-backup-default-commit-message')?.value as string) ||
			'TeXlyre Backup: {date}';
		return replaceCommitMessageVariables(template);
	};

	return (
		<>
			<Modal
				isOpen={isOpen}
				onClose={onClose}
				title={t('Gitea Backup')}
				icon={GiteaIcon}
				size='medium'
				headerActions={
					<button
						className='modal-close-button'
						onClick={() => setShowSettings(true)}
						title={t('Gitea Backup Settings')}
					>
						<SettingsIcon />
					</button>
				}
			>
				<div className='backup-modal'>
					{error && <div className='error-message'>{error}</div>}
					{showConnectionFlow && (
						<div className='connection-flow'>
							<h3>{t('Connect to Gitea')}</h3>
							{connectionStep === 'token' && (
								<div>
									<label>{t('Gitea Access Token:')}</label>
									<input
										type='password'
										value={giteaToken}
										onChange={(e) => {
											setError(null);
											setGiteaToken(e.target.value);
										}}
										placeholder={t('token...')}
									/>
									<div className='button-group'>
										<button
											className='button primary'
											onClick={handleTokenSubmit}
											disabled={!giteaToken.trim() || isOperating}
										>
											{isOperating ? t('Connecting...') : t('Connect')}
										</button>
										<button
											className='button secondary'
											onClick={() => setShowConnectionFlow(false)}
										>
											{t('Cancel')}
										</button>
									</div>
									<br />
									<a
										href='https://texlyre.github.io/docs/integrations/gitea'
										target='_blank'
										rel='noopener noreferrer'
										className='dropdown-link'
									>
										{t('Learn more about Gitea Integration')}
									</a>
								</div>
							)}
							{connectionStep === 'repo' && (
								<div>
									<label>{t('Repository:')}</label>
									<input
										type='text'
										value={repoInput}
										onChange={(e) => {
											setError(null);
											setRepoInput(e.target.value);
											setSelectedRepo('');
										}}
										placeholder={t(
											'Search repositories or paste owner/repo or URL',
										)}
									/>

									<select
										value={selectedRepo}
										onChange={(e) => {
											setError(null);
											setSelectedRepo(e.target.value);
											setRepoInput(e.target.value);
											handleRepoChange(e.target.value);
										}}
									>
										<option value=''>
											{t('Choose from loaded repositories...')}
										</option>
										{filteredRepos.map((repo) => (
											<option key={repo.full_name} value={repo.full_name}>
												{repo.full_name}{' '}
												{repo.private ? t('(Private)') : t('(Public)')}
											</option>
										))}
									</select>

									<div className='button-group'>
										<button
											className='button primary'
											onClick={handleRepoSubmit}
											disabled={!effectiveSelectedRepo || isOperating}
										>
											{isOperating ? t('Loading...') : t('Next')}
										</button>
										<button
											className='button secondary'
											onClick={() => setConnectionStep('token')}
										>
											{t('Back')}
										</button>
									</div>
								</div>
							)}
							{connectionStep === 'branch' && (
								<div>
									<label>{t('Select Branch:')}</label>
									<select
										value={selectedBranch}
										onChange={(e) => {
											setError(null);
											setSelectedBranch(e.target.value);
										}}
									>
										{availableBranches.map((branch) => (
											<option key={branch.name} value={branch.name}>
												{branch.name} {branch.protected ? t('(Protected)') : ''}
											</option>
										))}
									</select>
									<div className='button-group'>
										<button
											className='button primary'
											onClick={handleBranchSubmit}
											disabled={!selectedBranch || isOperating}
										>
											{isOperating ? t('Connecting...') : t('Connect')}
										</button>
										<button
											className='button secondary'
											onClick={() => setConnectionStep('repo')}
										>
											{t('Back')}
										</button>
									</div>
								</div>
							)}
						</div>
					)}

					{!showConnectionFlow && (
						<>
							<div className='backup-status'>
								<div className='status-header'>
									<div className='backup-controls'>
										{!status.isConnected ? (
											<button
												className='button primary'
												onClick={handleConnect}
												disabled={isOperating}
											>
												{t('Connect to Gitea')}
											</button>
										) : (
											<>
												{isInEditor && (
													<div className='sync-scope-selector'>
														<label>{t('Backup Scope:')}</label>
														<div>
															<label>
																<input
																	type='radio'
																	name='syncScope'
																	value='current'
																	checked={syncScope === 'current'}
																	onChange={(e) => {
																		setError(null);
																		setSyncScope(
																			e.target.value as 'current' | 'all',
																		);
																	}}
																	disabled={isOperating}
																/>
																<span>
																	{t('Current Project (')}
																	{currentProjectName})
																</span>
															</label>
															<label>
																<input
																	type='radio'
																	name='syncScope'
																	value='all'
																	checked={syncScope === 'all'}
																	onChange={(e) => {
																		setError(null);
																		setSyncScope(
																			e.target.value as 'current' | 'all',
																		);
																	}}
																	disabled={isOperating}
																/>
																<span>{t('All projects')}</span>
															</label>
														</div>
													</div>
												)}
												<div>
													<label>{t('Commit Message:')}</label>
													<input
														type='text'
														value={commitMessage}
														onChange={(e) => {
															setError(null);
															setCommitMessage(e.target.value);
														}}
														placeholder={getDefaultCommitMessagePlaceholder()}
														disabled={isOperating}
													/>
												</div>
												<div className='backup-toolbar'>
													<div className='primary-actions'>
														<button
															className='button secondary'
															onClick={handleExport}
															disabled={
																status.status === 'syncing' ||
																isOperating ||
																!commitMessage.trim()
															}
														>
															<GitPushIcon />
															{status.status === 'syncing' || isOperating
																? t('Pushing...')
																: t('Push To Gitea')}
														</button>
														<button
															className='button secondary'
															onClick={handleImport}
															disabled={
																status.status === 'syncing' || isOperating
															}
														>
															<ImportIcon />
															{status.status === 'syncing' || isOperating
																? t('Importing...')
																: t('Import From Gitea')}
														</button>
													</div>
													<div className='secondary-actions'>
														<button
															className='button secondary icon-only'
															onClick={handleChangeConnection}
															disabled={isOperating}
															title={t('Change repository/branch')}
														>
															<GitBranchIcon />
														</button>
														<button
															className='button secondary icon-only'
															onClick={handleDisconnect}
															disabled={isOperating}
															title={t('Disconnect (deletes API key)')}
														>
															<DisconnectIcon />
														</button>
													</div>
												</div>
											</>
										)}
									</div>
								</div>
								<div className='status-info'>
									<div className='status-item'>
										<strong>{t('Gitea Backup:')}</strong>{' '}
										{status.isConnected ? t('Connected') : t('Disconnected')}
									</div>
									{status.isConnected && status.repository && (
										<div className='status-item'>
											<strong>{t('Repository: ')}</strong>
											<span>
												{status.repository} ({displayBranch})
											</span>
										</div>
									)}
									{status.lastSync && (
										<div className='status-item'>
											<strong>{t('Last Sync:')}</strong>{' '}
											{formatDate(status.lastSync)}
										</div>
									)}
									{status.error && (
										<div className='error-message'>{status.error}</div>
									)}
								</div>
							</div>
							{activities.length > 0 && (
								<div className='backup-activities'>
									<div className='activities-header'>
										<h3>{t('Recent Activity')}</h3>
										<button
											className='button small secondary'
											onClick={() => giteaBackupService.clearAllActivities()}
											title={t('Clear all activities')}
											disabled={isOperating}
										>
											<TrashIcon />
											{t('Clear All')}
										</button>
									</div>
									<div className='activities-list'>
										{activities
											.slice(-10)
											.reverse()
											.map((activity) => (
												<div
													key={activity.id}
													className='activity-item'
													style={{
														borderLeftColor: getActivityColor(activity.type),
													}}
												>
													<div className='activity-content'>
														<div className='activity-header'>
															<span className='activity-icon'>
																{getActivityIcon(activity.type)}
															</span>
															<span className='activity-message'>
																{activity.message}
															</span>
															<button
																aria-label={t('Dismiss activity')}
																className='activity-close'
																onClick={() =>
																	giteaBackupService.clearActivity(activity.id)
																}
																title={t('Dismiss activity')}
																disabled={isOperating}
															>
																<span aria-hidden='true'>×</span>
															</button>
														</div>
														<div className='activity-time'>
															{formatDate(activity.timestamp)}
														</div>
													</div>
												</div>
											))}
									</div>
								</div>
							)}

							<div className='backup-info'>
								<h3>{t('How Gitea Backup Works')}</h3>
								<div className='info-content'>
									<p>
										{t(
											'Gitea backup stores your TeXlyre data in a Gitea repository:',
										)}
									</p>
									<ul>
										<li>
											<strong>{t('Push: ')}</strong>&nbsp;
											{t('Pushes local changes to the repository')}
										</li>
										<li>
											<strong>{t('Import: ')}</strong>&nbsp;
											{t(
												'Imports changes from the repository to your local workspace',
											)}
										</li>
										<li>
											<strong>{t('Change repo/branch:')}</strong>&nbsp;
											{t('Click the branch icon to switch repository/branch')}
										</li>
										<li>
											{t(
												'Each project is stored in a separate folder with documents and files organized',
											)}
										</li>
										<li>
											{t(
												'Your Gitea token is encrypted and stored securely with your TeXlyre password',
											)}
										</li>
										<li>
											{t(
												'Repository and branch selection is remembered per project scope for convenience',
											)}
										</li>
										<li>
											{t('Use private repositories to keep your data secure')}
										</li>
									</ul>
								</div>
							</div>
						</>
					)}
				</div>
			</Modal>

			<SettingsModal
				isOpen={showSettings}
				onClose={() => setShowSettings(false)}
				initialCategory={t('Backup')}
				initialSubcategory={t('Gitea')}
			/>
		</>
	);
};

export default GiteaBackupModal;
