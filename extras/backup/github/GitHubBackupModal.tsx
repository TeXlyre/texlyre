// extras/backup/github/GitHubBackupModal.tsx
import type React from 'react';
import { useEffect, useState } from 'react';
import {
	DisconnectIcon,
	GitBranchIcon,
	GitPushIcon,
	ImportIcon,
	SettingsIcon,
	SyncIcon,
	TrashIcon,
} from '../../../src/components/common/Icons';
import Modal from '../../../src/components/common/Modal';
import { useAuth } from '../../../src/hooks/useAuth';
import { useSecrets } from '../../../src/hooks/useSecrets';
import { formatDate } from '../../../src/utils/dateUtils';
import { gitHubApiService } from './GitHubApiService';
import { gitHubBackupService } from './GitHubBackupService';
import { GitHubIcon } from './Icon';

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
	const [selectedBranch, setSelectedBranch] = useState('main');
	const [displayBranch, setDisplayBranch] = useState<string>('main');
	const [connectionStep, setConnectionStep] = useState<
		'token' | 'repo' | 'branch'
	>('token');

	const { getProjectById } = useAuth();
	const secrets = useSecrets();

	useEffect(() => {
		gitHubBackupService.setSecretsContext(secrets);
	}, [secrets]);

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
				const projectId =
					isInEditor && syncScope === 'current' ? currentProjectId : undefined;
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
						console.log('Could not load stored credentials.', error);
					}
				}
			};
			checkExistingCredentials();
		}
	}, [isOpen, isInEditor, syncScope, currentProjectId]);

	const handleAsyncOperation = async (operation: () => Promise<void>) => {
		if (isOperating) return;
		setIsOperating(true);
		try {
			await operation();
		} catch (error) {
			console.error('Operation failed:', error);
			alert(
				`Operation failed: ${error instanceof Error ? error.message : String(error)}`,
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
				const projectId =
					isInEditor && syncScope === 'current' ? currentProjectId : undefined;
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
				alert(result.error || 'Failed to connect with token.');
			}
		});

	const handleRepoSubmit = () =>
		handleAsyncOperation(async () => {
			if (!selectedRepo) return;
			const [owner, repo] = selectedRepo.split('/');
			const branches = await gitHubApiService.getBranches(
				gitHubToken,
				owner,
				repo,
			);
			setAvailableBranches(branches);
			setConnectionStep('branch');
		});

	const handleBranchSubmit = () =>
		handleAsyncOperation(async () => {
			if (!selectedBranch) return;
			const projectId =
				isInEditor && syncScope === 'current' ? currentProjectId : undefined;
			const success = await gitHubBackupService.connectToRepository(
				gitHubToken,
				selectedRepo,
				projectId,
				selectedBranch,
			);
			if (success) {
				setDisplayBranch(selectedBranch);
				setShowConnectionFlow(false);
				setGitHubToken('');
				setSelectedRepo('');
				setSelectedBranch('main');
				setConnectionStep('token');
			}
		});

	const handleChangeConnection = () =>
		handleAsyncOperation(async () => {
			const projectId =
				isInEditor && syncScope === 'current' ? currentProjectId : undefined;
			const credentials = await (
				gitHubBackupService as any
			).getGitHubCredentials(projectId);
			if (!credentials) {
				alert('Could not retrieve GitHub credentials. Please reconnect.');
				return;
			}

			setGitHubToken(credentials.token);
			const result = await gitHubBackupService.connectWithToken(
				credentials.token,
			);
			if (result.success && result.repositories) {
				setAvailableRepos(result.repositories);
				const currentBranch =
					await gitHubBackupService.getStoredBranch(projectId);
				setSelectedBranch(currentBranch);
				setShowConnectionFlow(true);
				setConnectionStep('repo');
			}
		});

	const handleRepoChange = async (newRepo: string) => {
		setSelectedRepo(newRepo);
		if (newRepo && gitHubToken) {
			try {
				const [owner, repo] = newRepo.split('/');
				const branches = await gitHubApiService.getBranches(
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
				console.error('Failed to load branches:', error);
			}
		}
	};

	const getScopedProjectId = () =>
		isInEditor && syncScope === 'current' ? currentProjectId : undefined;

	const handleExport = () =>
		handleAsyncOperation(async () => {
			if (!commitMessage.trim()) return;
			await gitHubBackupService.exportData(
				getScopedProjectId(),
				commitMessage,
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

	return (
		<Modal
			isOpen={isOpen}
			onClose={onClose}
			title="GitHub Backup"
			icon={GitHubIcon}
			size="medium"
			headerActions={
				<button
					className="modal-close-button"
					onClick={() => {}}
					title="GitHub Backup Settings"
				>
					<SettingsIcon />
				</button>
			}
		>
			<div className="backup-modal">
				{showConnectionFlow && (
					<div
						className="connection-flow"
						style={{
							marginBottom: '2rem',
							padding: '1rem',
							border: '1px solid var(--accent-border)',
							borderRadius: '8px',
							backgroundColor: 'var(--accent-background)',
						}}
					>
						<h3>Connect to GitHub</h3>
						{connectionStep === 'token' && (
							<div>
								<label
									style={{
										display: 'block',
										marginBottom: '0.5rem',
										fontWeight: 'bold',
									}}
								>
									GitHub Personal Access Token:
								</label>
								<input
									type="password"
									value={gitHubToken}
									onChange={(e) => setGitHubToken(e.target.value)}
									placeholder="ghp_..."
									style={{
										width: '100%',
										padding: '0.5rem',
										marginBottom: '1rem',
									}}
								/>
								<div style={{ display: 'flex', gap: '1rem' }}>
									<button
										className="button primary"
										onClick={handleTokenSubmit}
										disabled={!gitHubToken.trim() || isOperating}
									>
										{isOperating ? 'Connecting...' : 'Connect'}
									</button>
									<button
										className="button secondary"
										onClick={() => setShowConnectionFlow(false)}
									>
										Cancel
									</button>
								</div>
							</div>
						)}
						{connectionStep === 'repo' && (
							<div>
								<label
									style={{
										display: 'block',
										marginBottom: '0.5rem',
										fontWeight: 'bold',
									}}
								>
									Select Repository:
								</label>
								<select
									value={selectedRepo}
									onChange={(e) => handleRepoChange(e.target.value)}
									style={{
										width: '100%',
										padding: '0.5rem',
										marginBottom: '1rem',
									}}
								>
									<option value="">Choose a repository...</option>
									{availableRepos.map((repo) => (
										<option key={repo.full_name} value={repo.full_name}>
											{repo.full_name} {repo.private ? '(Private)' : '(Public)'}
										</option>
									))}
								</select>
								<div style={{ display: 'flex', gap: '1rem' }}>
									<button
										className="button primary"
										onClick={handleRepoSubmit}
										disabled={!selectedRepo || isOperating}
									>
										{isOperating ? 'Loading...' : 'Next'}
									</button>
									<button
										className="button secondary"
										onClick={() => setConnectionStep('token')}
									>
										Back
									</button>
								</div>
							</div>
						)}
						{connectionStep === 'branch' && (
							<div>
								<label
									style={{
										display: 'block',
										marginBottom: '0.5rem',
										fontWeight: 'bold',
									}}
								>
									Select Branch:
								</label>
								<select
									value={selectedBranch}
									onChange={(e) => setSelectedBranch(e.target.value)}
									style={{
										width: '100%',
										padding: '0.5rem',
										marginBottom: '1rem',
									}}
								>
									{availableBranches.map((branch) => (
										<option key={branch.name} value={branch.name}>
											{branch.name} {branch.protected ? '(Protected)' : ''}
										</option>
									))}
								</select>
								<div style={{ display: 'flex', gap: '1rem' }}>
									<button
										className="button primary"
										onClick={handleBranchSubmit}
										disabled={!selectedBranch || isOperating}
									>
										{isOperating ? 'Connecting...' : 'Connect'}
									</button>
									<button
										className="button secondary"
										onClick={() => setConnectionStep('repo')}
									>
										Back
									</button>
								</div>
							</div>
						)}
					</div>
				)}

				{!showConnectionFlow && (
					<>
						<div className="backup-status">
							<div className="status-header">
								<div className="backup-controls">
									{!status.isConnected ? (
										<button
											className="button primary"
											onClick={handleConnect}
											disabled={isOperating}
										>
											Connect to GitHub
										</button>
									) : (
										<>
											{isInEditor && (
												<div
													className="sync-scope-selector"
													style={{ marginBottom: '1rem' }}
												>
													<label
														style={{
															display: 'block',
															marginBottom: '0.5rem',
															fontWeight: 'bold',
														}}
													>
														Backup Scope:
													</label>
													<div style={{ display: 'flex', gap: '1rem' }}>
														<label
															style={{
																display: 'flex',
																alignItems: 'center',
																gap: '0.5rem',
															}}
														>
															<input
																type="radio"
																name="syncScope"
																value="current"
																checked={syncScope === 'current'}
																onChange={(e) =>
																	setSyncScope(
																		e.target.value as 'current' | 'all',
																	)
																}
																disabled={isOperating}
															/>
															<span>
																Current Project ({currentProjectName})
															</span>
														</label>
														<label
															style={{
																display: 'flex',
																alignItems: 'center',
																gap: '0.5rem',
															}}
														>
															<input
																type="radio"
																name="syncScope"
																value="all"
																checked={syncScope === 'all'}
																onChange={(e) =>
																	setSyncScope(
																		e.target.value as 'current' | 'all',
																	)
																}
																disabled={isOperating}
															/>
															<span>All projects</span>
														</label>
													</div>
												</div>
											)}
											<div style={{ marginBottom: '1rem' }}>
												<label
													style={{
														display: 'block',
														marginBottom: '0.5rem',
														fontWeight: 'bold',
													}}
												>
													Commit Message:
												</label>
												<input
													type="text"
													value={commitMessage}
													onChange={(e) => setCommitMessage(e.target.value)}
													placeholder={`TeXlyre backup: ${new Date().toLocaleDateString()}`}
													style={{
														width: '100%',
														padding: '0.5rem',
														borderRadius: '4px',
														border: '1px solid var(--accent-border)',
													}}
													disabled={isOperating}
												/>
											</div>
											<div className="backup-toolbar">
												<div className="primary-actions">
													<button
														className="button secondary"
														onClick={handleExport}
														disabled={
															status.status === 'syncing' ||
															isOperating ||
															!commitMessage.trim()
														}
													>
														<GitPushIcon />
														{status.status === 'syncing' || isOperating
															? 'Pushing...'
															: 'Push To GH'}
													</button>
													<button
														className="button secondary"
														onClick={handleImport}
														disabled={
															status.status === 'syncing' || isOperating
														}
													>
														<ImportIcon />
														{status.status === 'syncing' || isOperating
															? 'Importing...'
															: 'Import From GH'}
													</button>
												</div>
												<div className="secondary-actions">
													<button
														className="button secondary icon-only"
														onClick={handleChangeConnection}
														disabled={isOperating}
														title="Change repository/branch"
													>
														<GitBranchIcon />
													</button>
													<button
														className="button secondary icon-only"
														onClick={handleDisconnect}
														disabled={isOperating}
														title="Disconnect (deletes API key)"
													>
														<DisconnectIcon />
													</button>
												</div>
											</div>
										</>
									)}
								</div>
							</div>
							<div className="status-info">
								<div className="status-item">
									<strong>GitHub Backup:</strong>{' '}
									{status.isConnected ? 'Connected' : 'Disconnected'}
								</div>
								{status.isConnected && status.repository && (
									<div className="status-item">
										<strong>Repository:</strong>
										<span style={{ marginLeft: '0.5rem' }}>
											{status.repository} ({displayBranch})
										</span>
									</div>
								)}
								{status.lastSync && (
									<div className="status-item">
										<strong>Last Sync:</strong> {formatDate(status.lastSync)}
									</div>
								)}
								{status.error && (
									<div className="error-message">{status.error}</div>
								)}
							</div>
						</div>
						{activities.length > 0 && (
							<div className="backup-activities">
								<div className="activities-header">
									<h3>Recent Activity</h3>
									<button
										className="button small secondary"
										onClick={() => gitHubBackupService.clearAllActivities()}
										title="Clear all activities"
										disabled={isOperating}
									>
										<TrashIcon />
										Clear All
									</button>
								</div>
								<div className="activities-list">
									{activities
										.slice(-10)
										.reverse()
										.map((activity) => (
											<div
												key={activity.id}
												className="activity-item"
												style={{
													borderLeft: `3px solid ${getActivityColor(activity.type)}`,
												}}
											>
												<div className="activity-content">
													<div className="activity-header">
														<span className="activity-icon">
															{getActivityIcon(activity.type)}
														</span>
														<span className="activity-message">
															{activity.message}
														</span>
														<button
															className="activity-close"
															onClick={() =>
																gitHubBackupService.clearActivity(activity.id)
															}
															title="Dismiss"
															disabled={isOperating}
														>
															×
														</button>
													</div>
													<div className="activity-time">
														{formatDate(activity.timestamp)}
													</div>
												</div>
											</div>
										))}
								</div>
							</div>
						)}

						<div className="backup-info">
							<h3>How GitHub Backup Works</h3>
							<div className="info-content">
								<p>
									GitHub backup stores your TeXlyre data in a GitHub repository:
								</p>
								<ul>
									<li>
										<strong>Push:</strong> Pushes local changes to the
										repository
									</li>
									<li>
										<strong>Import:</strong> Imports changes from the repository
										to your local workspace
									</li>
									<li>
										<strong>Change repo/branch:</strong> Click the branch icon
										to switch repository/branch
									</li>
									<li>
										Each project is stored in a separate folder with documents
										and files organized
									</li>
									<li>
										Your GitHub token is encrypted and stored securely with your
										TeXlyre password
									</li>
									<li>
										Repository and branch selection is remembered per project
										scope for convenience
									</li>
									<li>Use private repositories to keep your data secure</li>
								</ul>
							</div>
						</div>
					</>
				)}
			</div>
		</Modal>
	);
};

export default GitHubBackupModal;
