// src/components/common/StorageBanner.tsx
import type React from 'react';

import { t } from '@/i18n';
import { useStorageQuota } from '../../hooks/useStorageQuota';
import { formatFileSize } from '../../utils/fileUtils';
import { AlertCircleIcon } from './Icons';

const StorageBanner: React.FC = () => {
	const { isLow, hideBanner, availableBytes } = useStorageQuota();

	if (!isLow || hideBanner) return null;

	return (
		<div className='offline-banner storage-banner'>
			<div className='offline-content'>
				<span className='offline-icon'>
					<AlertCircleIcon />
				</span>
				<div className='offline-text'>
					<strong>{t('Browser storage is almost full')}</strong>
					<div className='offline-details'>
						{availableBytes > 0
							? t('{size} left. Saving files and compiling may fail.', {
									size: formatFileSize(availableBytes),
								})
							: t('No space left. Saving files and compiling will fail.')}
					</div>
				</div>
			</div>
		</div>
	);
};

export default StorageBanner;
