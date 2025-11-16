// src/components/settings/ThemeToggleButton.tsx
import { t } from '@/i18n';
import type React from 'react';

import { useSettings } from '../../hooks/useSettings';
import { SunIcon, MoonIcon } from '../common/Icons';

interface ThemeToggleButtonProps {
	className?: string;
}

const ThemeToggleButton: React.FC<ThemeToggleButtonProps> = ({ className = '' }) => {
	const { getSetting, updateSetting } = useSettings();

	const themeVariantSetting = getSetting('theme-variant');
	const currentVariant = themeVariantSetting?.value || themeVariantSetting?.defaultValue || 'system';

	const toggleTheme = () => {
		const newVariant = currentVariant === 'dark' ? 'light' : 'dark';
		updateSetting('theme-variant', newVariant);
	};

	const isDark = currentVariant === 'dark' ||
		(currentVariant === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

	return (
		<button
			className={`${className}`}
			onClick={toggleTheme}
			title={t('Switch to {theme} theme', {
				theme: isDark ? t('light') : t('dark')
			})}
		>
			{isDark ? <SunIcon /> : <MoonIcon />}
		</button>
	);
};

export default ThemeToggleButton;