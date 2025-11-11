// src/components/common/OfflineBanner.tsx
import { t } from '@/i18n';
import type React from 'react';

import { useOffline } from '../../hooks/useOffline';
import { OfflineIcon } from './Icons';

const OfflineBanner: React.FC = () => {
	const { isOfflineMode, lastOnline } = useOffline();

	if (!isOfflineMode) return null;

	const lastOnlineText = lastOnline ?
		new Date(lastOnline).toLocaleString() :
		'Unknown';

	return (
		<div className="offline-banner">
			<div className="offline-content">
				<span className="offline-icon"><OfflineIcon /></span>
				<div className="offline-text">
					<strong>{t('You\'re currently offline')}</strong>
					<div className="offline-details">{t('Collaboration features are disabled. Last online:')}
						{lastOnlineText}
					</div>
				</div>
			</div>
		</div>);

};

export default OfflineBanner;