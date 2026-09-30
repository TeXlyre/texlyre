// src/components/common/WorkspaceStatusIndicator.tsx
import type React from 'react';
import { useEffect, useState } from 'react';

import { t } from '@/i18n';
import {
	type WorkspaceStatus,
	workspaceService,
} from '../../services/WorkspaceService';
import { FolderOpenIcon } from '../common/Icons';
import GitRemoteStatusIndicator from '../history/GitRemoteStatusIndicator';
import WorkspaceModal from './WorkspaceModal';

const WorkspaceStatusIndicator: React.FC = () => {
	const [status, setStatus] = useState<WorkspaceStatus>(
		workspaceService.getStatus(),
	);
	const [showModal, setShowModal] = useState(false);

	useEffect(() => {
		setStatus(workspaceService.getStatus());
		return workspaceService.addStatusListener(setStatus);
	}, []);

	useEffect(() => {
		const handleShowModal = () => setShowModal(true);

		document.addEventListener('show-workspace-modal', handleShowModal);
		return () =>
			document.removeEventListener('show-workspace-modal', handleShowModal);
	}, []);

	const tooltip = status.needsPermission
		? t('Folder access is not granted. Click to reconnect.')
		: t('Mirroring {count} files with {name}', {
				count: status.fileCount,
				name: status.directoryName ?? '',
			});

	return (
		<>
			{status.projectId ? (
				<>
					<button
						type='button'
						className='ui-badge'
						data-variant='label'
						data-tone={status.needsPermission ? 'danger' : undefined}
						data-truncate='true'
						title={tooltip}
						onClick={() => setShowModal(true)}
					>
						<FolderOpenIcon />
						<span>{status.directoryName ?? t('Folder')}</span>
					</button>

					<WorkspaceModal
						isOpen={showModal}
						onClose={() => setShowModal(false)}
						status={status}
					/>
				</>
			) : null}
			<GitRemoteStatusIndicator />
		</>
	);
};

export default WorkspaceStatusIndicator;
