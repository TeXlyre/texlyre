// src/components/app/LoadingScreen.tsx
import type React from 'react';

import { t } from '@/i18n';

const LoadingScreen: React.FC = () => {
	return (
		<div className='loading-container'>
			<div className='loading-spinner' />
			<p>{t('Loading TeXlyre...')}</p>
		</div>
	);
};

export default LoadingScreen;
