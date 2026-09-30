// extras/backup/github/GitHubBackupModal.tsx
import { t } from '@/i18n';
import type React from 'react';
import { useEffect, useState } from 'react';
import {
	DisconnectIcon,
	RepositoryIcon,
	GitPushIcon,
	ImportIcon,
	SettingsIcon,
	TrashIcon,
} from '@/components/common/Icons';
import Modal from '@/components/common/Modal';
import GitCredentialSelect from '@/components/history/GitCredentialSelect';
import SettingsModal from '@/components/settings/SettingsModal';
import { useAuth } from '@/hooks/useAuth';
import { useSecrets } from '@/hooks/useSecrets';
import { useSettings } from '@/hooks/useSettings';
import { useRecords } from '@/hooks/useRecords';
import { formatDate } from '@/utils/dateUtils';
import { ensureGitRemoteBranch } from '@/utils/gitUtils';
import { gitHubAPIService } from './GitHubAPIService';
import { gitHubGitRemoteProvider } from './GitHubGitRemoteProvider';
import { gitHubBackupService } from './GitHubBackupService';
import { GitHubIcon } from './Icon';
import { createNamedLogger } from '@/logging';
const moduleLog = createNamedLogger('GitHubBackupModal');

interface GitHubBackupModalProps {
	isOpen: boolean;
	onClose: () => void;
	currentProjectId?: string | null;
	isInEditor?: boolean;
}

const GitHubBackupModal: React.FC<GitHubBackupModalProps> = ({
	isOpen,
	onClose,
	currentProjectId,
	isInEditor = false,
}) => {
	const [showSettings, setShowSettings] = useState(false);
	const [status, setStatus] = useState(gitHubBackupService.getStatus());
	const [activities, setActivities] = useState(
		gitHubBackupService.getActivities(),
	);
	const [syncScope, setSyncScope] = useState<'current' | 'all'>('current');
	const [isOperating, setIsOperating] = useState(false);
	const [currentProjectName, setCurrentProjectName] = useState<string>('');
	const [commitMessage, setCommitMessage] = useState('');
	const [showConnectionFlow, setShowConnectionFlow] = useState(false);
	const [gitHubToken, setGitHubToken] = useState('');
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
	const records = useRecords();
	const { getSetting } = useSettings();
	const scopedProjectId =
		isInEditor && syncScope === 'current'
			? (currentProjectId ?? undefined)
			: undefined;

	useEffect(() => {
		const apiEndpoint =
			(getSetting('github-backup-api-endpoint')?.value as string) ||
			'https://api.github.com';
		const defaultBranch =
			(getSetting('github-backup-default-branch')?.value as string) || 'main';
		const defaultCommitMessage =
			(getSetting('github-backup-default-commit-message')?.value as string) ||
			'';
		const ignorePatterns =
			(getSetting('github-backup-ignore-patterns')?.value as string) || '';
		const maxFileSize =
			(getSetting('github-backup-max-file-size')?.value as number) || 100;
		const requestTimeout =
			(getSetting('github-backup-request-timeout')?.value as number) || 30;
		const maxRetryAttempts =
			(getSetting('github-backup-max-retry-attempts')?.value as number) || 3;
		const activityHistoryLimit =
			(getSetting('github-backup-activity-history-limit')?.value as number) ||
			50;
		const importAfterPush =
			(getSetting('github-backup-import-after-push')?.value as boolean) ?? true;

		gitHubBackupService.setSettings({
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
			importAfterPush,
		});
	}, [getSetting]);

	/* biome-ignore lint/correctness/useExhaustiveDependencies: One-time seed of branch and commit message with settings defaults; stored credentials and user input take over after mount. */
	useEffect(() => {
		const defaultBranch =
			(getSetting('github-backup-default-branch')?.value as string) || 'main';
		const defaultCommitMessage =
			(getSetting('github-backup-default-commit-message')?.value as string) ||
			'';

		setSelectedBranch(defaultBranch);
		if (!commitMessage) {
			setCommitMessage(defaultCommitMessage);
		}
	}, []);

	useEffect(() => {
		gitHubBackupService.setSecretsContext(secrets);
	}, [secrets]);

	useEffect(() => {
		gitHubBackupService.setRecordsContext(records);
	}, [records]);

	useEffect(() => {
		gitHubBackupService.setCurrentProjectId(scopedProjectId);
	}, [scopedProjectId]);

	useEffect(() => {
		const unsubscribeStatus = gitHubBackupService.addStatusListener(setStatus);
		const unsubscribeActivities =
			gitHubBackupService.addActivityListener(setActivities);
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
				const projectId = scopedProjectId;
				if (await gitHubBackupService.hasStoredCredentials(projectId)) {
					try {
						const storedRepo =
							await gitHubBackupService.getStoredRepository(projectId);
						const storedBranch =
							await gitHubBackupService.getStoredBranch(projectId);
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
						moduleLog.error('Could not load stored credentials.', error);
					}
				}
			};
			checkExistingCredentials();
		}
	}, [isOpen, scopedProjectId]);

	const normalizeGitHubRepoInput = (input: string): string => {
		const trimmed = input.trim();

		if (!trimmed) return '';

		const githubMatch = trimmed.match(
			/github\.com[/:]([^/\s]+)\/([^/\s#?]+)(?:\.git)?/i,
		);

		if (githubMatch) {
			return `${githubMatch[1]}/${githubMatch[2].replace(/\.git$/, '')}`;
		}

		const ownerRepoMatch = trimmed.match(/^([^/\s]+)\/([^/\s]+)$/);

		if (ownerRepoMatch) {
			return `${ownerRepoMatch[1]}/${ownerRepoMatch[2].replace(/\.git$/, '')}`;
		}

		return trimmed;
	};

	const normalizedRepoInput = normalizeGitHubRepoInput(repoInput);

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
			moduleLog.error('Operation failed:', error);
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
			const result = await gitHubBackupService.requestAccess();
			if (result.success) {
				setShowConnectionFlow(true);
				setConnectionStep('token');
				const projectId = scopedProjectId;
				const storedRepo =
					await gitHubBackupService.getStoredRepository(projectId);
				const storedBranch =
					await gitHubBackupService.getStoredBranch(projectId);
				if (storedRepo) setSelectedRepo(storedRepo);
				if (storedBranch) setSelectedBranch(storedBranch);
			}
		});

	const handleTokenSubmit = () =>
		handleAsyncOperation(async () => {
			if (!gitHubToken.trim()) return;
			const result = await gitHubBackupService.connectWithToken(gitHubToken);
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

			if (!repoName || !repoName.includes('/')) {
				setError(
					t(
						'Enter a repository as owner/repo or paste a GitHub repository URL.',
					),
				);
				return;
			}

			const [owner, repo] = repoName.split('/');

			const branches = await gitHubAPIService.getBranches(
				gitHubToken,
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

			if (defaultBranch) {
				setSelectedBranch(defaultBranch.name);
			}

			setConnectionStep('branch');
		});

	const handleBranchSubmit = () =>
		handleAsyncOperation(async () => {
			const branchName = selectedBranch.trim();
			if (!branchName) return;

			const repoName = effectiveSelectedRepo || selectedRepo;

			if (!repoName || !repoName.includes('/')) {
				setError(
					t(
						'Enter a repository as owner/repo or paste a GitHub repository URL.',
					),
				);
				return;
			}

			await ensureGitRemoteBranch(
				gitHubGitRemoteProvider,
				gitHubToken,
				repoName,
				branchName,
				availableBranches,
				displayBranch,
			);

			const projectId = scopedProjectId;

			const success = await gitHubBackupService.connectToRepository(
				gitHubToken,
				repoName,
				projectId,
				branchName,
			);

			if (success) {
				setDisplayBranch(branchName);
				setShowConnectionFlow(false);
				setGitHubToken('');
				setSelectedRepo('');
				setRepoInput('');
				setConnectionStep('token');
			}
		});

	const handleChangeConnection = () =>
		handleAsyncOperation(async () => {
			const projectId = scopedProjectId;

			const credentials =
				await gitHubBackupService.getStoredCredentials(projectId);

			if (!credentials) {
				setError(t('Could not retrieve GitHub credentials. Please reconnect.'));
				return;
			}

			setGitHubToken(credentials.token);

			const result = await gitHubBackupService.connectWithToken(
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
		if (newRepo && gitHubToken) {
			try {
				const [owner, repo] = newRepo.split('/');
				const branches = await gitHubAPIService.getBranches(
					gitHubToken,
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
				moduleLog.error('Failed to load branches:', error);
			}
		}
	};

	const getScopedProjectId = () => scopedProjectId;

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
			await gitHubBackupService.exportData(
				getScopedProjectId(),
				finalCommitMessage,
				selectedBranch,
			);
		});

	const handleImport = () =>
		handleAsyncOperation(() =>
			gitHubBackupService.importChanges(getScopedProjectId(), selectedBranch),
		);

	const handleDisconnect = () =>
		handleAsyncOperation(async () => {
			await gitHubBackupService.disconnect(getScopedProjectId());
			await handleConnect();
		});

	const getActivityIcon = (type: string) =>
		({
			backup_error: '❌',
			import_error: '❌',
			backup_complete: '✓',
			import_complete: '✓',
			backup_start: '📤',
			import_start: '📥',
		})[type] || 'ℹ️';

	const getActivityTone = (type: string) => {
		if (type === 'backup_error' || type === 'import_error')
			return 'error' as const;
		if (type === 'backup_complete' || type === 'import_complete')
			return 'success' as const;
		return 'info' as const;
	};

	const getDefaultCommitMessagePlaceholder = (): string => {
		const template =
			(getSetting('github-backup-default-commit-message')?.value as string) ||
			t('Add commit message to push changes (e.g. "Backup on {date}")');
		return replaceCommitMessageVariables(template);
	};

	return (
		<>
			<Modal
				isOpen={isOpen}
				onClose={onClose}
				title={t('GitHub Backup')}
				icon={GitHubIcon}
				size='medium'
				headerActions={
					<button
						type='button'
						className='ui-icon-button'
						data-role='modal-close'
						data-variant='subtle'
						onClick={() => setShowSettings(true)}
						title={t('GitHub Backup Settings')}
					>
						<SettingsIcon />
					</button>
				}
			>
				<div className='ui-stack' data-gap='lg'>
					{error && (
						<div className='ui-message' data-tone='error'>
							{error}
						</div>
					)}

					{showConnectionFlow && (
						<div
							className='ui-card ui-stack'
							data-gap='md'
							data-padding='md'
							data-radius='lg'
							data-surface='accent'
						>
							<h3 className='ui-panel-title' data-size='body'>
								{t('Connect to GitHub')}
							</h3>
							{connectionStep === 'token' && (
								<div className='ui-stack' data-gap='md'>
									<label className='ui-field-label'>
										{t('GitHub Personal Access Token:')}
									</label>
									<GitCredentialSelect
										providerId='github'
										projectId={isInEditor ? (currentProjectId ?? '') : ''}
										value={gitHubToken}
										onChange={setGitHubToken}
										mode='backup'
										placeholder={t('ghp_...')}
									/>
									<div className='ui-actions' data-gap='md'>
										<button
											type='button'
											className='button primary'
											onClick={handleTokenSubmit}
											disabled={!gitHubToken.trim() || isOperating}
										>
											{isOperating ? t('Connecting...') : t('Connect')}
										</button>
										<button
											type='button'
											className='button secondary'
											onClick={() => setShowConnectionFlow(false)}
										>
											{t('Cancel')}
										</button>
									</div>
									<a
										href='https://texlyre.org/docs/integrations/github'
										target='_blank'
										rel='noopener noreferrer'
									>
										{t('Learn more about GitHub Integration')}
									</a>
								</div>
							)}
							{connectionStep === 'repo' && (
								<div className='ui-stack' data-gap='md'>
									<label className='ui-field-label'>{t('Repository: ')}</label>
									<input
										className='ui-field-control'
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
										className='ui-field-control'
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

									<div className='ui-actions' data-gap='md'>
										<button
											type='button'
											className='button primary'
											onClick={handleRepoSubmit}
											disabled={!effectiveSelectedRepo || isOperating}
										>
											{isOperating ? t('Loading...') : t('Next')}
										</button>
										<button
											type='button'
											className='button secondary'
											onClick={() => setConnectionStep('token')}
										>
											{t('Back')}
										</button>
									</div>
								</div>
							)}
							{connectionStep === 'branch' && (
								<div className='ui-stack' data-gap='md'>
									<label className='ui-field-label'>{t('Branch: ')}</label>
									<input
										className='ui-field-control'
										type='text'
										list='gitHubGitRemoteProvider-branches'
										value={selectedBranch}
										onChange={(e) => {
											setError(null);
											setSelectedBranch(e.target.value);
										}}
									/>
									<datalist id='gitHubGitRemoteProvider-branches'>
										{availableBranches.map((branch) => (
											<option
												key={branch.name}
												value={branch.name}
												label={branch.protected ? t('(Protected)') : undefined}
											/>
										))}
									</datalist>
									{availableBranches.length > 0 &&
									!availableBranches.some(
										(item) => item.name === selectedBranch.trim(),
									) ? (
										<p className='ui-note'>
											{t(
												'A new remote branch will be created when you connect.',
											)}
										</p>
									) : null}
									<div className='ui-actions' data-gap='md'>
										<button
											type='button'
											className='button primary'
											onClick={handleBranchSubmit}
											disabled={!selectedBranch.trim() || isOperating}
										>
											{isOperating ? t('Connecting...') : t('Connect')}
										</button>
										<button
											type='button'
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
							<div
								className='ui-card ui-stack'
								data-gap='md'
								data-padding='md'
								data-surface='secondary'
							>
								<div className='ui-stack' data-gap='md'>
									<div className='ui-stack' data-gap='sm'>
										{!status.isConnected ? (
											<button
												type='button'
												className='button primary'
												onClick={handleConnect}
												disabled={isOperating}
											>
												{t('Connect to GitHub')}
											</button>
										) : (
											<>
												{isInEditor && (
													<div
														className='ui-card ui-stack'
														data-gap='sm'
														data-padding='sm'
													>
														<label className='ui-field-label'>
															{t('Backup Scope:')}
														</label>
														<div className='ui-actions' data-wrap='true'>
															<label className='checkbox-control'>
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
															<label className='checkbox-control'>
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
													<label className='ui-field-label'>
														{t('Commit Message:')}
													</label>
													<input
														className='ui-field-control'
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
																: t('Push To GH')}
														</button>
														<button
															type='button'
															className='button warn secondary'
															onClick={handleImport}
															disabled={
																status.status === 'syncing' || isOperating
															}
														>
															<ImportIcon />
															{status.status === 'syncing' || isOperating
																? t('Importing...')
																: t('Import From GH')}
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
															onClick={handleChangeConnection}
															disabled={isOperating}
															title={t('Change repository/branch')}
														>
															<RepositoryIcon />
														</button>
														<button
															type='button'
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
								<div className='ui-list' data-gap='sm'>
									<div className='ui-meta' data-layout='row'>
										<strong>{t('GitHub Backup:')}</strong>{' '}
										{status.isConnected ? t('Connected') : t('Disconnected')}
									</div>
									{status.isConnected && status.repository && (
										<div className='ui-meta' data-layout='row'>
											<strong>{t('Repository: ')}</strong>
											<span>
												{status.repository} ({displayBranch})
											</span>
										</div>
									)}
									{status.lastSync && (
										<div className='ui-meta' data-layout='row'>
											<strong>{t('Last Sync:')}</strong>{' '}
											{formatDate(status.lastSync)}
										</div>
									)}
									{status.error && (
										<div className='ui-message' data-tone='error'>
											{status.error}
										</div>
									)}
								</div>
								<br />
								<a
									href='https://texlyre.org/docs/git-synchronization'
									target='_blank'
									rel='noopener noreferrer'
								>
									{t('Learn more about Git synchronization')}
								</a>
							</div>
							{activities.length > 0 && (
								<div className='ui-list' data-gap='md'>
									<div
										className='ui-toolbar'
										data-justify='between'
										data-gap='sm'
									>
										<h3 className='ui-panel-title'>{t('Recent Activity')}</h3>
										<button
											type='button'
											className='button danger  secondary'
											onClick={() => gitHubBackupService.clearAllActivities()}
											title={t('Clear all activities')}
											disabled={isOperating}
										>
											<TrashIcon />
											{t('Clear All')}
										</button>
									</div>
									<div className='ui-list' data-gap='sm' data-scroll='medium'>
										{activities
											.slice(-10)
											.reverse()
											.map((activity) => (
												<div
													key={activity.id}
													className='ui-message ui-stack'
													data-tone={getActivityTone(activity.type)}
													data-density='compact'
													data-gap='xs'
												>
													<div className='ui-list-content'>
														<div className='ui-actions'>
															<span className='ui-icon'>
																{getActivityIcon(activity.type)}
															</span>
															<span
																className='ui-list-content'
																data-grow='true'
															>
																{activity.message}
															</span>
															<button
																type='button'
																aria-label={t('Dismiss activity')}
																className='ui-icon-button'
																data-variant='subtle'
																data-size='xs'
																onClick={() =>
																	gitHubBackupService.clearActivity(activity.id)
																}
																title={t('Dismiss activity')}
																disabled={isOperating}
															>
																<span aria-hidden='true'>×</span>
															</button>
														</div>
														<div className='ui-meta'>
															{formatDate(activity.timestamp)}
														</div>
													</div>
												</div>
											))}
									</div>
								</div>
							)}

							<div className='ui-message' data-tone='info'>
								<h3>{t('How GitHub Backup Works')}</h3>
								<div>
									<p>
										{t(
											'GitHub backup stores your TeXlyre data in a GitHub repository:',
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
												'Your GitHub token is encrypted and stored securely with your TeXlyre password',
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
				initialSubcategory={t('GitHub')}
			/>
		</>
	);
};

export default GitHubBackupModal;
