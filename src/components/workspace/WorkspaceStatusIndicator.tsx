// src/components/common/WorkspaceStatusIndicator.tsx
import type React from 'react';
import { useEffect, useState } from 'react';

import { t } from '@/i18n';
import {
	type WorkspaceStatus,
	workspaceService,
} from '../../services/WorkspaceService';
import { FolderOpenIcon } from '../common/Icons';
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

	if (!status.projectId) return null;

	const tooltip = status.needsPermission
		? t('Folder access is not granted. Click to reconnect.')
		: t('Mirroring {count} files with {name}', {
				count: status.fileCount,
				name: status.directoryName ?? '',
			});

	return (
		<>
			<button
				type='button'
				className={`workspace-badge ${status.needsPermission ? 'disconnected' : ''}`}
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
	);
};

export default WorkspaceStatusIndicator;
