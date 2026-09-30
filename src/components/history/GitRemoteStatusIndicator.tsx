import type React from 'react';
import { useCallback, useEffect, useState } from 'react';

import { t } from '@/i18n';
import { GitRemoteIcon } from '@/components/common/Icons';
import { fileStoreService } from '@/services/FileStoreService';
import { gitFileSystemService } from '@/services/GitFileSystemService';
import { gitService } from '@/services/GitService';
import { gitSyncService } from '@/services/GitSyncService';
import { workspaceService } from '@/services/WorkspaceService';
import GitRemoteModal from './GitRemoteModal';

interface GitRemoteStatusIndicatorProps {
	className?: string;
}

const getCurrentProjectId = (): string | null =>
	fileStoreService.getCurrentProjectId() ??
	(typeof sessionStorage !== 'undefined'
		? sessionStorage.getItem('currentProjectId')
		: null);

const GitRemoteStatusIndicator: React.FC<GitRemoteStatusIndicatorProps> = ({
	className = '',
}) => {
	const [projectId, setProjectId] = useState<string | null>(
		getCurrentProjectId(),
	);
	const [visible, setVisible] = useState(false);
	const [label, setLabel] = useState(t('Git'));
	const [tooltip, setTooltip] = useState(t('Git history'));
	const [showModal, setShowModal] = useState(false);

	const refresh = useCallback(async () => {
		const currentProjectId = getCurrentProjectId();
		setProjectId(currentProjectId);
		if (!currentProjectId) {
			setVisible(false);
			return;
		}

		const fileSystem = gitFileSystemService.get(currentProjectId);
		const workspaceStatus = workspaceService.getStatus();
		if (
			workspaceStatus.projectId === currentProjectId &&
			workspaceStatus.isConnected
		) {
			await fileSystem.attachStoredDisk();
			if (fileSystem.getSettings().storeGitOnDisk) {
				await fileSystem.syncGitToDisk();
			}
		}

		const [headOid, diskStatus] = await Promise.all([
			gitService.getHeadOid(currentProjectId),
			fileSystem.getDiskStatus(),
		]);
		const remote = gitSyncService.getConfig(currentProjectId);
		setVisible(Boolean(remote || diskStatus.hasGit || headOid));

		if (remote) {
			setLabel(`${remote.repositoryLabel} · ${remote.branch}`);
			setTooltip(
				t('{provider} Git remote: {repository} ({branch})', {
					provider: remote.providerName ?? remote.providerId,
					repository: remote.repositoryLabel,
					branch: remote.branch,
				}),
			);
		} else if (diskStatus.hasGit) {
			setLabel(t('Git · folder'));
			setTooltip(t('Git history is stored in the linked folder'));
		} else {
			setLabel(t('Git · local'));
			setTooltip(t('Local Git history'));
		}
	}, []);

	useEffect(() => {
		const safelyRefresh = () => {
			void refresh().catch(() => {
				// A denied/stale folder handle must not break the footer.
			});
		};
		safelyRefresh();
		document.addEventListener('git-storage-changed', safelyRefresh);
		document.addEventListener('refresh-git-history', safelyRefresh);
		document.addEventListener('refresh-file-tree', safelyRefresh);
		const removeWorkspaceListener =
			workspaceService.addStatusListener(safelyRefresh);
		return () => {
			document.removeEventListener('git-storage-changed', safelyRefresh);
			document.removeEventListener('refresh-git-history', safelyRefresh);
			document.removeEventListener('refresh-file-tree', safelyRefresh);
			removeWorkspaceListener();
		};
	}, [refresh]);

	useEffect(() => {
		if (!projectId) return;
		return gitSyncService.addListener(projectId, () => {
			void refresh().catch(() => {});
		});
	}, [projectId, refresh]);

	if (!visible || !projectId) return null;

	return (
		<>
			<button
				type='button'
				className={`ui-badge ${className}`.trim()}
				data-variant='label'
				data-truncate='true'
				title={tooltip}
				onClick={() => setShowModal(true)}
			>
				<GitRemoteIcon />
				<span>{label}</span>
			</button>
			<GitRemoteModal
				isOpen={showModal}
				onClose={() => setShowModal(false)}
				projectId={projectId}
			/>
		</>
	);
};

export default GitRemoteStatusIndicator;
