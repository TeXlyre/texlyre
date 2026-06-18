// src/components/profile/ProfileBrowserStorageSection.tsx
import type React from 'react';
import { useCallback, useEffect, useState } from 'react';

import { t } from '@/i18n';
import { useStorageQuota } from '../../hooks/useStorageQuota';
import { authService } from '../../services/AuthService';
import {
	type ReclaimableDatabase,
	type ReclaimableKind,
	deleteDatabases,
	listReclaimableDatabases,
} from '../../utils/dbDeleteUtils';
import { formatFileSize } from '../../utils/fileUtils';
import Modal from '../common/Modal';
import { LockIcon, TrashIcon } from '../common/Icons';

interface BrowserStorageSectionProps {
	isSubmitting: boolean;
	setIsSubmitting: (value: boolean) => void;
	onError: (message: string) => void;
	onSuccess: (message: string) => void;
}

const BrowserStorageSection: React.FC<BrowserStorageSectionProps> = ({
	isSubmitting,
	setIsSubmitting,
	onError,
	onSuccess,
}) => {
	const {
		isSupported,
		isPersisted,
		isLow,
		usageBytes,
		quotaBytes,
		availableBytes,
		usedRatio,
		segments,
		refresh,
		requestPersistence,
	} = useStorageQuota();

	const [reclaimable, setReclaimable] = useState<ReclaimableDatabase[]>([]);
	const [pendingKind, setPendingKind] = useState<ReclaimableKind | null>(null);

	const scanReclaimable = useCallback(async () => {
		try {
			const projects = await authService.getAllProjects();
			setReclaimable(await listReclaimableDatabases(projects));
		} catch (error) {
			setReclaimable([]);
			onError(
				error instanceof Error
					? error.message
					: t('Failed to inspect browser storage'),
			);
		}
	}, [onError]);

	useEffect(() => {
		void scanReclaimable();
	}, [scanReclaimable]);

	const groupOf = (kind: ReclaimableKind) =>
		reclaimable.filter((entry) => entry.kind === kind);

	const handleConfirmClear = async () => {
		if (!pendingKind) return;

		try {
			setIsSubmitting(true);
			await deleteDatabases(groupOf(pendingKind).map((entry) => entry.name));
			await scanReclaimable();
			await refresh();
			onSuccess(t('Storage cleaned up'));
		} catch (error) {
			onError(
				error instanceof Error ? error.message : t('Failed to free up storage'),
			);
		} finally {
			setIsSubmitting(false);
			setPendingKind(null);
		}
	};

	const handleRequestPersistence = async () => {
		const granted = await requestPersistence();
		if (granted) {
			onSuccess(t('Your data is now protected from automatic deletion'));
		} else {
			onError(t('Your browser did not grant protection for this data'));
		}
	};

	const reclaimableGroups: {
		kind: ReclaimableKind;
		title: string;
		description: string;
	}[] = [
		{
			kind: 'typesetter-cache',
			title: t('Typesetter package cache'),
			description: t(
				'Packages downloaded for compilation. They are fetched again on the next compile, which needs an internet connection.',
			),
		},
		{
			kind: 'orphan-project',
			title: t('Leftover project data'),
			description: t(
				'Data left behind by projects that no longer exist on this device.',
			),
		},
	];

	const pendingGroup = reclaimableGroups.find(
		(group) => group.kind === pendingKind,
	);

	return (
		<>
			<h3 style={{ paddingTop: '1rem' }}>{t('Browser Storage')}</h3>

			{!isSupported ? (
				<p className='storage-notice'>
					{t('Your browser does not report how much storage is available')}
				</p>
			) : (
				<div className='browser-storage-summary'>
					<div className='browser-storage-figures'>
						<span>
							{t('{used} used of about {total}', {
								used: formatFileSize(usageBytes),
								total: formatFileSize(quotaBytes),
							})}
						</span>
						<span>
							{t('{size} left', { size: formatFileSize(availableBytes) })}
						</span>
					</div>

					<div className={`storage-meter ${isLow ? 'low' : ''}`}>
						{segments.length > 0 ? (
							segments.map((segment) => (
								<div
									key={segment.id}
									className={`storage-meter-segment ${segment.id}`}
									style={{
										width: `${quotaBytes > 0 ? (segment.bytes / quotaBytes) * 100 : 0}%`,
									}}
								/>
							))
						) : (
							<div
								className='storage-meter-segment indexedDB'
								style={{ width: `${usedRatio * 100}%` }}
							/>
						)}
					</div>

					{segments.length > 0 && (
						<div className='storage-meter-legend'>
							{segments.map((segment) => (
								<span key={segment.id}>
									<i className={`storage-meter-key ${segment.id}`} />
									{segment.label} {formatFileSize(segment.bytes)}
								</span>
							))}
						</div>
					)}

					<div className='browser-storage-persistence'>
						<LockIcon />
						<span>
							{isPersisted
								? t('This data is protected from automatic deletion')
								: t('Your browser may delete this data when space runs low')}
						</span>
						{!isPersisted && (
							<button
								type='button'
								className='button secondary smaller'
								onClick={handleRequestPersistence}
								disabled={isSubmitting}
							>
								{t('Keep my data')}
							</button>
						)}
					</div>
				</div>
			)}

			<div className='local-storage-actions'>
				{reclaimableGroups.map((group) => {
					const entries = groupOf(group.kind);

					return (
						<div className='storage-action-group' key={group.kind}>
							<div className='storage-action-info'>
								<strong>{group.title}</strong>
								<p>{group.description}</p>
							</div>
							<div className='storage-action-buttons'>
								<button
									type='button'
									className='button danger smaller icon-only'
									onClick={() => setPendingKind(group.kind)}
									disabled={isSubmitting || entries.length === 0}
									title={
										entries.length === 0
											? t('Nothing to clear')
											: t('Clear {name}', { name: group.title })
									}
								>
									<TrashIcon />
								</button>
							</div>
						</div>
					);
				})}
			</div>

			<Modal
				isOpen={pendingKind !== null}
				onClose={() => setPendingKind(null)}
				title={pendingGroup?.title ?? ''}
				icon={TrashIcon}
				size='medium'
			>
				<div className='clear-storage-modal'>
					<div className='warning-message'>
						<p>{t('This action cannot be undone.')}</p>
						<p>{pendingGroup?.description}</p>
					</div>

					<div className='modal-actions'>
						<button
							type='button'
							className='button secondary'
							onClick={() => setPendingKind(null)}
							disabled={isSubmitting}
						>
							{t('Cancel')}
						</button>
						<button
							type='button'
							className='button danger'
							onClick={handleConfirmClear}
							disabled={isSubmitting}
						>
							{isSubmitting ? t('Clearing...') : t('Clear')}
						</button>
					</div>
				</div>
			</Modal>
		</>
	);
};

export default BrowserStorageSection;
