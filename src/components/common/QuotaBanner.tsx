// src/components/common/QuotaBanner.tsx
import type React from 'react';

import { t } from '@/i18n';
import { useStorageQuota } from '../../hooks/useStorageQuota';
import { formatFileSize } from '../../utils/fileUtils';
import { AlertCircleIcon } from './Icons';

const QuotaBanner: React.FC = () => {
	const { isLow, hideBanner, availableBytes } = useStorageQuota();

	if (!isLow || hideBanner) return null;

	return (
		<div className='ui-message' data-role='banner' data-tone={'warning'}>
			<div className='ui-actions'>
				<span className='ui-icon'>
					<AlertCircleIcon />
				</span>
				<div className='ui-stack' data-gap='xs'>
					<strong>{t('Browser storage is almost full')}</strong>
					<div className='ui-note'>
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

export default QuotaBanner;
