// extras/backup/gitlab/GitLabBackupModal.tsx
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
import { useRecords } from '@/hooks/useRecords';
import { formatDate } from '@/utils/dateUtils';
import { gitLabAPIService } from './GitLabAPIService';
import { gitLabBackupService } from './GitLabBackupService';
import { GitLabIcon } from './Icon';
import './styles.css';

interface GitLabBackupModalProps {
	isOpen: boolean;
	onClose: () => void;
	currentProjectId?: string | null;
	isInEditor?: boolean;
}

const GitLabBackupModal: React.FC<GitLabBackupModalProps> = ({
	isOpen,
	onClose,
	currentProjectId,
	isInEditor = false,
}) => {
	const [showSettings, setShowSettings] = useState(false);
	const [status, setStatus] = useState(gitLabBackupService.getStatus());
	const [activities, setActivities] = useState(
		gitLabBackupService.getActivities(),
	);
	const [syncScope, setSyncScope] = useState<'current' | 'all'>('current');
	const [isOperating, setIsOperating] = useState(false);
	const [currentProjectName, setCurrentProjectName] = useState<string>('');
	const [commitMessage, setCommitMessage] = useState('');
	const [showConnectionFlow, setShowConnectionFlow] = useState(false);
	const [gitLabToken, setGitLabToken] = useState('');
	const [availableProjects, setAvailableProjects] = useState<any[]>([]);
	const [availableBranches, setAvailableBranches] = useState<any[]>([]);
	const [selectedProject, setSelectedProject] = useState('');
	const [projectInput, setProjectInput] = useState('');
	const [selectedBranch, setSelectedBranch] = useState('main');
	const [displayBranch, setDisplayBranch] = useState<string>('main');
	const [error, setError] = useState<string | null>(null);
	const [connectionStep, setConnectionStep] = useState<
		'token' | 'project' | 'branch'
	>('token');

	const { getProjectById } = useAuth();
	const secrets = useSecrets();
	const records = useRecords();
	const { getSetting } = useSettings();

	useEffect(() => {
		const apiEndpoint =
			(getSetting('gitlab-backup-api-endpoint')?.value as string) ||
			'https://gitlab.com/api/v4';
		const defaultBranch =
			(getSetting('gitlab-backup-default-branch')?.value as string) || 'main';
		const defaultCommitMessage =
			(getSetting('gitlab-backup-default-commit-message')?.value as string) ||
			'';
		const ignorePatterns =
			(getSetting('gitlab-backup-ignore-patterns')?.value as string) || '';
		const maxFileSize =
			(getSetting('gitlab-backup-max-file-size')?.value as number) || 100;
		const requestTimeout =
			(getSetting('gitlab-backup-request-timeout')?.value as number) || 30;
		const maxRetryAttempts =
			(getSetting('gitlab-backup-max-retry-attempts')?.value as number) || 3;
		const activityHistoryLimit =
			(getSetting('gitlab-backup-activity-history-limit')?.value as number) ||
			50;
		const importAfterPush =
			(getSetting('gitlab-backup-import-after-push')?.value as boolean) ?? true;

		gitLabBackupService.setSettings({
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

		setSelectedBranch(defaultBranch);

		if (!commitMessage) {
			setCommitMessage(defaultCommitMessage);
		}
	}, [getSetting]);

	useEffect(() => {
		gitLabBackupService.setSecretsContext(secrets);
	}, [secrets]);

	useEffect(() => {
		gitLabBackupService.setRecordsContext(records);
	}, [records]);

	useEffect(() => {
		const scopedProjectId =
			isInEditor && syncScope === 'current'
				? (currentProjectId ?? undefined)
				: undefined;
		gitLabBackupService.setCurrentProjectId(scopedProjectId);
	}, [isInEditor, syncScope, currentProjectId]);

	useEffect(() => {
		const unsubscribeStatus = gitLabBackupService.addStatusListener(setStatus);
		const unsubscribeActivities =
			gitLabBackupService.addActivityListener(setActivities);
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
				if (await gitLabBackupService.hasStoredCredentials(projectId)) {
					try {
						const storedProject =
							await gitLabBackupService.getStoredProject(projectId);
						const storedBranch =
							await gitLabBackupService.getStoredBranch(projectId);
						if (storedProject) {
							setStatus((prev) => ({
								...prev,
								isConnected: true,
								isEnabled: true,
								project: storedProject,
							}));
							setSelectedProject(storedProject);
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

	const normalizeGitLabProjectInput = (input: string): string => {
		const trimmed = input.trim();
		if (!trimmed) return '';

		const gitlabProjectUrlMatch = trimmed.match(
			/gitlab\.[^/]+\/(.+?)(?:\.git)?(?:[?#].*)?$/i,
		);

		if (gitlabProjectUrlMatch) {
			return gitlabProjectUrlMatch[1].replace(/\.git$/, '');
		}

		return trimmed.replace(/\.git$/, '');
	};

	const normalizedProjectInput = normalizeGitLabProjectInput(projectInput);

	const filteredProjects = availableProjects.filter((project) =>
		(project.path_with_namespace || project.name || '')
			.toLowerCase()
			.includes(projectInput.trim().toLowerCase()),
	);

	const selectedProjectData = availableProjects.find(
		(project) => project.id.toString() === selectedProject,
	);

	const effectiveProjectId = selectedProject || normalizedProjectInput;

	const effectiveProjectPathWithNamespace =
		selectedProjectData?.path_with_namespace ||
		normalizedProjectInput ||
		selectedProject;

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
			const result = await gitLabBackupService.requestAccess();
			if (result.success) {
				setShowConnectionFlow(true);
				setConnectionStep('token');
				const projectId =
					isInEditor && syncScope === 'current' ? currentProjectId : undefined;
				const storedProject =
					await gitLabBackupService.getStoredProject(projectId);
				const storedBranch =
					await gitLabBackupService.getStoredBranch(projectId);
				if (storedProject) setSelectedProject(storedProject);
				if (storedBranch) setSelectedBranch(storedBranch);
			}
		});

	const handleTokenSubmit = () =>
		handleAsyncOperation(async () => {
			if (!gitLabToken.trim()) return;
			const result = await gitLabBackupService.connectWithToken(gitLabToken);
			if (result.success && result.projects) {
				setAvailableProjects(result.projects);
				setConnectionStep('project');
			} else {
				setError(result.error || t('Failed to connect with token.'));
			}
		});

	const handleProjectSubmit = () =>
		handleAsyncOperation(async () => {
			if (!effectiveProjectId) {
				setError(
					t('Enter a project ID, namespace/project, or GitLab project URL.'),
				);
				return;
			}

			const branches = await gitLabAPIService.getBranches(
				gitLabToken,
				effectiveProjectId,
			);

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
			if (!selectedBranch || !effectiveProjectId) {
				setError(t('Select a project and branch before connecting.'));
				return;
			}

			const localProjectId =
				isInEditor && syncScope === 'current' ? currentProjectId : undefined;

			const success = await gitLabBackupService.connectToProject(
				gitLabToken,
				effectiveProjectId,
				effectiveProjectPathWithNamespace,
				localProjectId,
				selectedBranch,
			);

			if (success) {
				setDisplayBranch(selectedBranch);
				setShowConnectionFlow(false);
				setGitLabToken('');
				setSelectedProject('');
				setProjectInput('');
				setConnectionStep('token');
			}
		});

	const handleChangeConnection = () =>
		handleAsyncOperation(async () => {
			const projectId =
				isInEditor && syncScope === 'current' ? currentProjectId : undefined;

			const credentials =
				await gitLabBackupService.getStoredCredentials(projectId);

			if (!credentials) {
				setError(t('Could not retrieve GitLab credentials. Please reconnect.'));
				return;
			}

			setGitLabToken(credentials.token);

			const result = await gitLabBackupService.connectWithToken(
				credentials.token,
			);

			if (result.success && result.projects) {
				setAvailableProjects(result.projects);
				setSelectedProject(credentials.target);
				setProjectInput(credentials.target);
				setSelectedBranch(credentials.branch);
				setDisplayBranch(credentials.branch);
				setShowConnectionFlow(true);
				setConnectionStep('project');
			}
		});

	const handleProjectChange = async (newProjectId: string) => {
		setSelectedProject(newProjectId);
		if (newProjectId && gitLabToken) {
			try {
				const branches = await gitLabAPIService.getBranches(
					gitLabToken,
					newProjectId,
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
			await gitLabBackupService.exportData(
				getScopedProjectId(),
				finalCommitMessage,
				selectedBranch,
			);
		});

	const handleImport = () =>
		handleAsyncOperation(() =>
			gitLabBackupService.importChanges(getScopedProjectId(), selectedBranch),
		);

	const handleDisconnect = () =>
		handleAsyncOperation(async () => {
			await gitLabBackupService.disconnect(getScopedProjectId());
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
			(getSetting('gitlab-backup-default-commit-message')?.value as string) ||
			'TeXlyre Backup: {date}';
		return replaceCommitMessageVariables(template);
	};

	return (
		<>
			<Modal
				isOpen={isOpen}
				onClose={onClose}
				title={t('GitLab Backup')}
				icon={GitLabIcon}
				size='medium'
				headerActions={
					<button
						className='modal-close-button'
						onClick={() => setShowSettings(true)}
						title={t('GitLab Backup Settings')}
					>
						<SettingsIcon />
					</button>
				}
			>
				<div className='backup-modal'>
					{error && <div className='error-message'>{error}</div>}
					{showConnectionFlow && (
						<div className='connection-flow'>
							<h3>{t('Connect to GitLab')}</h3>
							{connectionStep === 'token' && (
								<div>
									<label>{t('GitLab Personal Access Token:')}</label>
									<input
										type='password'
										value={gitLabToken}
										onChange={(e) => {
											setError(null);
											setGitLabToken(e.target.value);
										}}
										placeholder={t('glpat-...')}
									/>
									<div className='button-group'>
										<button
											className='button primary'
											onClick={handleTokenSubmit}
											disabled={!gitLabToken.trim() || isOperating}
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
										href='https://texlyre.github.io/docs/integrations/gitlab'
										target='_blank'
										rel='noopener noreferrer'
										className='dropdown-link'
									>
										{t('Learn more about GitLab Integration')}
									</a>
								</div>
							)}
							{connectionStep === 'project' && (
								<div>
									<label>{t('Project:')}</label>
									<input
										type='text'
										value={projectInput}
										onChange={(e) => {
											setError(null);
											setProjectInput(e.target.value);
											setSelectedProject('');
										}}
										placeholder={t(
											'Search projects or paste project ID / namespace/project / URL',
										)}
									/>

									<select
										value={selectedProject}
										onChange={(e) => {
											setError(null);
											setSelectedProject(e.target.value);
											const selected = availableProjects.find(
												(project) => project.id.toString() === e.target.value,
											);
											setProjectInput(
												selected?.path_with_namespace || e.target.value,
											);
											handleProjectChange(e.target.value);
										}}
									>
										<option value=''>
											{t('Choose from loaded projects...')}
										</option>
										{filteredProjects.map((project) => (
											<option key={project.id} value={project.id.toString()}>
												{project.path_with_namespace} (
												{project.visibility === 'private'
													? t('Private')
													: t('Public')}
												)
											</option>
										))}
									</select>

									<div className='button-group'>
										<button
											className='button primary'
											onClick={handleProjectSubmit}
											disabled={!effectiveProjectId || isOperating}
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
											onClick={() => setConnectionStep('project')}
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
												{t('Connect to GitLab')}
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
																: t('Push To GL')}
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
																: t('Import From GL')}
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
										<strong>{t('GitLab Backup:')}</strong>{' '}
										{status.isConnected ? t('Connected') : t('Disconnected')}
									</div>
									{status.isConnected && status.project && (
										<div className='status-item'>
											<strong>{t('Project: ')}</strong>
											<span>
												{status.project} ({displayBranch})
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
											onClick={() => gitLabBackupService.clearAllActivities()}
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
																	gitLabBackupService.clearActivity(activity.id)
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
								<h3>{t('How GitLab Backup Works')}</h3>
								<div className='info-content'>
									<p>
										{t(
											'GitLab backup stores your TeXlyre data in a GitLab repository:',
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
												'Your GitLab token is encrypted and stored securely with your TeXlyre password',
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
				initialSubcategory={t('GitLab')}
			/>
		</>
	);
};

export default GitLabBackupModal;
