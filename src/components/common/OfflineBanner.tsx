// src/components/common/OfflineBanner.tsx
import type React from 'react';
import { useState } from 'react';

import { t } from '@/i18n';
import { useOffline } from '../../hooks/useOffline';
import { formatDate } from '../../utils/dateUtils';
import { CloseIcon, OfflineIcon } from './Icons';

const OfflineBanner: React.FC = () => {
	const { isOfflineMode, lastOnline } = useOffline();
	const [isVisible, setIsVisible] = useState(true);

	if (!isOfflineMode || !isVisible) return null;

	const lastOnlineText = lastOnline ? formatDate(lastOnline) : t('Unknown');

	return (
		<div className='ui-message' data-role='banner' data-tone={'warning'}>
			<div className='ui-actions'>
				<button
					className='button icon-only'
					data-role='banner-dismiss'
					data-variant='ghost'
					type='button'
					onClick={() => setIsVisible(false)}
					title={t('Dismiss offline banner')}
					aria-label={t('Dismiss offline banner')}
				>
					<CloseIcon />
				</button>
				<span className='ui-icon'>
					<OfflineIcon />
				</span>
				<div className='ui-stack' data-gap='xs'>
					<strong>{t("You're currently offline")}</strong>
					<div className='ui-note'>
						{t('Collaboration features are disabled. Last online:')}
						{lastOnlineText}
					</div>
				</div>
			</div>
		</div>
	);
};

export default OfflineBanner;
