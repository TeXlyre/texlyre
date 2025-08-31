// src/components/settings/ThemeToggleButton.tsx
import type React from "react";

import { useSettings } from "../../hooks/useSettings";
import { SunIcon, MoonIcon } from "../common/Icons";

interface ThemeToggleButtonProps {
	className?: string;
}

const ThemeToggleButton: React.FC<ThemeToggleButtonProps> = ({ className = "" }) => {
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
			className={`theme-toggle-button ${className}`}
			onClick={toggleTheme}
			title={`Switch to ${isDark ? 'light' : 'dark'} theme`}
		>
			{isDark ? <SunIcon /> : <MoonIcon />}
		</button>
	);
};

export default ThemeToggleButton;