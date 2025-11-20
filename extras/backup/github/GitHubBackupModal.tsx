// extras/backup/github/GitHubBackupModal.tsx
import { t } from '@/i18n';
import type React from 'react';
import { useEffect, useState } from 'react';
import {
  DisconnectIcon,
  GitBranchIcon,
  GitPushIcon,
  ImportIcon,
  SettingsIcon,
  TrashIcon
} from '@/components/common/Icons';
import Modal from '@/components/common/Modal';
import SettingsModal from '@/components/settings/SettingsModal';
import { useAuth } from '@/hooks/useAuth';
import { useSecrets } from '@/hooks/useSecrets';
import { useSettings } from '@/hooks/useSettings';
import { formatDate } from '@/utils/dateUtils';
import { gitHubApiService } from './GitHubApiService';
import { gitHubBackupService } from './GitHubBackupService';
import { GitHubIcon } from './Icon';
import './styles.css';

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
  isInEditor = false
}) => {
  const [showSettings, setShowSettings] = useState(false);
  const [status, setStatus] = useState(gitHubBackupService.getStatus());
  const [activities, setActivities] = useState(
    gitHubBackupService.getActivities()
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
  const [connectionStep, setConnectionStep] = useState<'token' | 'repo' | 'branch'>('token');

  const { getProjectById } = useAuth();
  const secrets = useSecrets();
  const { getSetting } = useSettings();

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
    });

    setSelectedBranch(defaultBranch);

    if (!commitMessage) {
      setCommitMessage(defaultCommitMessage);
    }
  }, [getSetting]);

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
                repository: storedRepo
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
        `Operation failed: ${error instanceof Error ? error.message : String(error)}`
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
        repo
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
        selectedBranch
      );
      if (success) {
        setDisplayBranch(selectedBranch);
        setShowConnectionFlow(false);
        setGitHubToken('');
        setSelectedRepo('');
        setConnectionStep('token');
      }
    });

  const handleChangeConnection = () =>
    handleAsyncOperation(async () => {
      const projectId =
        isInEditor && syncScope === 'current' ? currentProjectId : undefined;
      const credentials = await (
        gitHubBackupService as any).
        getGitHubCredentials(projectId);
      if (!credentials) {
        alert('Could not retrieve GitHub credentials. Please reconnect.');
        return;
      }

      setGitHubToken(credentials.token);
      const result = await gitHubBackupService.connectWithToken(
        credentials.token
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
          repo
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
      await gitHubBackupService.exportData(
        getScopedProjectId(),
        finalCommitMessage,
        selectedBranch
      );
    });

  const handleImport = () =>
    handleAsyncOperation(() =>
      gitHubBackupService.importChanges(getScopedProjectId(), selectedBranch)
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
      import_start: '📥'
    })[type] || 'ℹ️';
  const getActivityColor = (type: string) =>
    ({
      backup_error: '#dc3545',
      import_error: '#dc3545',
      backup_complete: '#28a745',
      import_complete: '#28a745',
      backup_start: '#007bff',
      import_start: '#6f42c1'
    })[type] || '#6c757d';

  const getDefaultCommitMessagePlaceholder = (): string => {
    const template =
      (getSetting('github-backup-default-commit-message')?.value as string) ||
      'TeXlyre Backup: {date}';
    return replaceCommitMessageVariables(template);
  };

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={t('GitHub Backup')}
        icon={GitHubIcon}
        size="medium"
        headerActions={
          <button
            className="modal-close-button"
            onClick={() => setShowSettings(true)}
            title={t('GitHub Backup Settings')}>
            <SettingsIcon />
          </button>
        }>
        <div className="backup-modal">
          {showConnectionFlow && (
            <div className="connection-flow">
              <h3>{t('Connect to GitHub')}</h3>
              {connectionStep === 'token' && (
                <div>
                  <label>{t('GitHub Personal Access Token:')}</label>
                  <input
                    type="password"
                    value={gitHubToken}
                    onChange={(e) => setGitHubToken(e.target.value)}
                    placeholder={t('ghp_...')} />
                  <div className="button-group">
                    <button
                      className="button primary"
                      onClick={handleTokenSubmit}
                      disabled={!gitHubToken.trim() || isOperating}>
                      {isOperating ? 'Connecting...' : 'Connect'}
                    </button>
                    <button
                      className="button secondary"
                      onClick={() => setShowConnectionFlow(false)}>
                      {t('Cancel')}
                    </button>
                  </div>
                </div>
              )}
              {connectionStep === 'repo' && (
                <div>
                  <label>{t('Select Repository:')}</label>
                  <select
                    value={selectedRepo}
                    onChange={(e) => handleRepoChange(e.target.value)}>
                    <option value="">{t('Choose a repository...')}</option>
                    {availableRepos.map((repo) => (
                      <option key={repo.full_name} value={repo.full_name}>
                        {repo.full_name} {repo.private ? '(Private)' : '(Public)'}
                      </option>
                    ))}
                  </select>
                  <div className="button-group">
                    <button
                      className="button primary"
                      onClick={handleRepoSubmit}
                      disabled={!selectedRepo || isOperating}>
                      {isOperating ? 'Loading...' : 'Next'}
                    </button>
                    <button
                      className="button secondary"
                      onClick={() => setConnectionStep('token')}>
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
                    onChange={(e) => setSelectedBranch(e.target.value)}>
                    {availableBranches.map((branch) => (
                      <option key={branch.name} value={branch.name}>
                        {branch.name} {branch.protected ? '(Protected)' : ''}
                      </option>
                    ))}
                  </select>
                  <div className="button-group">
                    <button
                      className="button primary"
                      onClick={handleBranchSubmit}
                      disabled={!selectedBranch || isOperating}>
                      {isOperating ? 'Connecting...' : 'Connect'}
                    </button>
                    <button
                      className="button secondary"
                      onClick={() => setConnectionStep('repo')}>
                      {t('Back')}
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
                        disabled={isOperating}>
                        {t('Connect to GitHub')}
                      </button>
                    ) : (
                      <>
                        {isInEditor && (
                          <div className="sync-scope-selector">
                            <label>{t('Backup Scope:')}</label>
                            <div>
                              <label>
                                <input
                                  type="radio"
                                  name="syncScope"
                                  value="current"
                                  checked={syncScope === 'current'}
                                  onChange={(e) =>
                                    setSyncScope(
                                      e.target.value as 'current' | 'all'
                                    )
                                  }
                                  disabled={isOperating} />
                                <span>
                                  {t('Current Project (')}
                                  {currentProjectName})
                                </span>
                              </label>
                              <label>
                                <input
                                  type="radio"
                                  name="syncScope"
                                  value="all"
                                  checked={syncScope === 'all'}
                                  onChange={(e) =>
                                    setSyncScope(
                                      e.target.value as 'current' | 'all'
                                    )
                                  }
                                  disabled={isOperating} />
                                <span>{t('All projects')}</span>
                              </label>
                            </div>
                          </div>
                        )}
                        <div>
                          <label>{t('Commit Message:')}</label>
                          <input
                            type="text"
                            value={commitMessage}
                            onChange={(e) => setCommitMessage(e.target.value)}
                            placeholder={getDefaultCommitMessagePlaceholder()}
                            disabled={isOperating} />
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
                              }>
                              <GitPushIcon />
                              {status.status === 'syncing' || isOperating
                                ? t('Pushing...')
                                : t('Push To GH')}
                            </button>
                            <button
                              className="button secondary"
                              onClick={handleImport}
                              disabled={
                                status.status === 'syncing' || isOperating
                              }>
                              <ImportIcon />
                              {status.status === 'syncing' || isOperating
                                ? t('Importing...')
                                : t('Import From GH')}
                            </button>
                          </div>
                          <div className="secondary-actions">
                            <button
                              className="button secondary icon-only"
                              onClick={handleChangeConnection}
                              disabled={isOperating}
                              title={t('Change repository/branch')}>
                              <GitBranchIcon />
                            </button>
                            <button
                              className="button secondary icon-only"
                              onClick={handleDisconnect}
                              disabled={isOperating}
                              title={t('Disconnect (deletes API key)')}>
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
                    <strong>{t('GitHub Backup:')}</strong>{' '}
                    {status.isConnected ? t('Connected') : t('Disconnected')}
                  </div>
                  {status.isConnected && status.repository && (
                    <div className="status-item">
                      <strong>{t('Repository: ')}</strong>
                      <span>
                        {status.repository} ({displayBranch})
                      </span>
                    </div>
                  )}
                  {status.lastSync && (
                    <div className="status-item">
                      <strong>{t('Last Sync:')}</strong> {formatDate(status.lastSync)}
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
                    <h3>{t('Recent Activity')}</h3>
                    <button
                      className="button small secondary"
                      onClick={() => gitHubBackupService.clearAllActivities()}
                      title={t('Clear all activities')}
                      disabled={isOperating}>
                      <TrashIcon />{t('Clear All')}
                    </button>
                  </div>
                  <div className="activities-list">
                    {activities.slice(-10).reverse().map((activity) => (
                      <div
                        key={activity.id}
                        className="activity-item"
                        style={{
                          borderLeftColor: getActivityColor(activity.type)
                        }}>
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
                              title={t('Dismiss')}
                              disabled={isOperating}>
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
                <h3>{t('How GitHub Backup Works')}</h3>
                <div className="info-content">
                  <p>{t('GitHub backup stores your TeXlyre data in a GitHub repository:')}</p>
                  <ul>
                    <li>
                      <strong>{t('Push: ')}</strong>&nbsp;{t('Pushes local changes to the repository')}
                    </li>
                    <li>
                      <strong>{t('Import: ')}</strong>&nbsp;{t('Imports changes from the repository to your local workspace')}
                    </li>
                    <li>
                      <strong>{t('Change repo/branch:')}</strong>&nbsp;{t('Click the branch icon to switch repository/branch')}
                    </li>
                    <li>{t('Each project is stored in a separate folder with documents and files organized')}</li>
                    <li>{t('Your GitHub token is encrypted and stored securely with your TeXlyre password')}</li>
                    <li>{t('Repository and branch selection is remembered per project scope for convenience')}</li>
                    <li>{t('Use private repositories to keep your data secure')}</li>
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
        initialCategory={t("Backup")}
        initialSubcategory={t("GitHub")} />
    </>
  );
};

export default GitHubBackupModal;