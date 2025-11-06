// extras/themes/texlyre_wide/TeXlyreWideTheme.ts
import type {
	ThemeLayout,
	ThemePlugin,
	ThemeVariant,
} from '@/plugins/PluginInterface';
import { themes } from './colors';
import './styles/index.css';

const createTeXlyreWideTheme = (): ThemePlugin => {
	let currentThemeId = 'dark';

	const layout: ThemeLayout = {
		id: 'texlyre-wide',
		name: 'TeXlyre Wide Theme',
		containerClass: 'texlyre-wide',
		defaultFileExplorerWidth: 320,
		minFileExplorerWidth: 250,
		maxFileExplorerWidth: 1250,
		stylesheetPath: './styles/layout.css',
	};

	const applyThemeColors = (themeId: string) => {
		const colors = themes[themeId];
		if (!colors) return;

		Object.entries(colors).forEach(([key, value]) => {
			document.documentElement.style.setProperty(
				`--pico-${key}`,
				value as string,
			);
		});
		document.documentElement.style.setProperty('color', colors.color);
		document.documentElement.style.setProperty('--text-color', colors.color);
	};

	return {
		id: 'texlyre-wide-theme',
		name: 'TeXlyre Wide Theme',
		version: '2.0.0',
		type: 'theme',
		themes: [
			{ id: 'light', name: 'Light', isDark: false },
			{ id: 'dark', name: 'Dark', isDark: true },
			{ id: 'system', name: 'System', isDark: false },
			{ id: 'monokai', name: 'Monokai', isDark: true },
			{ id: 'tomorrow_night_blue', name: 'Tomorrow Night Blue', isDark: true },
			{ id: 'github_light', name: 'GitHub Light', isDark: false },
			{ id: 'solarized_light', name: 'Solarized Light', isDark: false },
			{ id: 'atom_light', name: 'Atom Light', isDark: false },
		],

		applyTheme(variantId: string): boolean {
			const theme = this.themes.find((t) => t.id === variantId);
			if (!theme) return false;

			currentThemeId = variantId;

			if (variantId === 'system') {
				const prefersDark = window.matchMedia(
					'(prefers-color-scheme: dark)',
				).matches;
				applyThemeColors(prefersDark ? 'dark' : 'light');
			} else {
				applyThemeColors(variantId);
			}

			document.documentElement.setAttribute('data-theme', variantId);
			document.documentElement.setAttribute('data-theme-plugin', 'texlyre');
			return true;
		},

		getThemeVariants(): ThemeVariant[] {
			return this.themes;
		},

		getCurrentTheme(): ThemeVariant {
			return this.themes.find((t) => t.id === currentThemeId) || this.themes[0];
		},

		getLayout(): ThemeLayout {
			return layout;
		},

		applyLayout(): void {
			document.documentElement.setAttribute('data-layout', layout.id);
		},
	};
};

const teXlyreWideTheme = createTeXlyreWideTheme();

export default teXlyreWideTheme;
