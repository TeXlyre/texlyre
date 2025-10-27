// src/components/app/LoadingScreen.tsx
import { t } from "@/i18n";
import type React from 'react';

const LoadingScreen: React.FC = () => {
  return (
    <div className="loading-container">
			<div className="loading-spinner" />
			<p>{t('Loading TeXlyre...')}</p>
		</div>);

};

export default LoadingScreen;