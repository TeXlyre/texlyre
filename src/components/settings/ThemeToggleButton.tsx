// src/components/settings/ThemeToggleButton.tsx
import type React from 'react';
import { useEffect, useRef } from 'react';

import { t } from '@/i18n';
import { useProperties } from '../../hooks/useProperties';
import { useSettings } from '../../hooks/useSettings';
import { SunIcon, MoonIcon } from '../common/Icons';

interface ThemeToggleButtonProps {
	className?: string;
}

const ThemeToggleButton: React.FC<ThemeToggleButtonProps> = ({
	className = '',
}) => {
	const { getSetting, updateSetting } = useSettings();
	const { getProperty, registerProperty } = useProperties();
	const propertiesRegistered = useRef(false);

	useEffect(() => {
		if (propertiesRegistered.current) return;
		propertiesRegistered.current = true;

		registerProperty({
			id: 'theme-toggle-light',
			category: 'Theme',
			subcategory: 'Toggle',
			defaultValue: 'light',
		});
		registerProperty({
			id: 'theme-toggle-dark',
			category: 'Theme',
			subcategory: 'Toggle',
			defaultValue: 'dark',
		});
	}, [registerProperty]);

	const lightVariant = (getProperty('theme-toggle-light') as string) || 'light';
	const darkVariant = (getProperty('theme-toggle-dark') as string) || 'dark';

	const themeVariantSetting = getSetting('theme-variant');
	const currentVariant =
		themeVariantSetting?.value || themeVariantSetting?.defaultValue || 'system';

	const isDark =
		currentVariant === darkVariant ||
		(currentVariant === 'system' &&
			window.matchMedia('(prefers-color-scheme: dark)').matches);

	const toggleTheme = () => {
		updateSetting('theme-variant', isDark ? lightVariant : darkVariant);
	};

	return (
		<button
			className={`${className}`}
			onClick={toggleTheme}
			title={t('Switch to {theme}', {
				theme: isDark ? t('Light Theme') : t('Dark Theme'),
			})}
		>
			{isDark ? <SunIcon /> : <MoonIcon />}
		</button>
	);
};

export default ThemeToggleButton;
