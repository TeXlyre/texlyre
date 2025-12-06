// extras/themes/texlyre_mobile/TeXlyreMobileTheme.ts
import { t } from '@/i18n';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';

import type {
	ThemeLayout,
	ThemePlugin,
	ThemeVariant,
} from '@/plugins/PluginInterface';
import { ProjectsIcon, ProjectsPlusIcon, FolderIcon, EditFileIcon, OutputIcon, ChatIcon } from '@/components/common/Icons';
import { themes } from './colors';
import './styles/index.css';

const renderIcon = (IconComponent: React.FC<any>, props = {}) => {
	return renderToStaticMarkup(createElement(IconComponent, props));
};

const createTeXlyreMobileTheme = (): ThemePlugin => {
	let currentThemeId = 'dark';
	let currentView: 'explorer' | 'editor' | 'output' | 'chat' = 'editor';
	let mobileClickHandler: ((e: Event) => void) | null = null;
	let hashChangeHandler: (() => void) | null = null;
	let loginCheckInterval: NodeJS.Timeout | null = null;

	const layout: ThemeLayout = {
		id: 'texlyre-mobile',
		name: 'TeXlyre Mobile Theme',
		containerClass: 'texlyre-mobile',
		defaultFileExplorerWidth: 100,
		minFileExplorerWidth: 100,
		maxFileExplorerWidth: 100,
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

	const isProjectsView = () => {
		const hash = window.location.hash;
		return hash === '' || hash === '#';
	};

	const cleanupMobileNavigation = () => {
		const existingNav = document.querySelector('.mobile-bottom-nav');
		if (existingNav) {
			existingNav.remove();
		}

		document.body.className = document.body.className.replace(/mobile-view-\w+/g, '');

		if (mobileClickHandler) {
			document.removeEventListener('click', mobileClickHandler);
			mobileClickHandler = null;
		}

		if (hashChangeHandler) {
			window.removeEventListener('hashchange', hashChangeHandler);
			hashChangeHandler = null;
		}
	};

	const handleMobileNavigation = () => {
		const setupNav = () => {
			const existingNav = document.querySelector('.mobile-bottom-nav');
			if (existingNav) {
				existingNav.remove();
			}
			setupMobileNavigation();
		};

		if (document.readyState === 'loading') {
			document.addEventListener('DOMContentLoaded', setupNav);
		} else {
			setupNav();
		}

		if (hashChangeHandler) {
			window.removeEventListener('hashchange', hashChangeHandler);
		}

		hashChangeHandler = () => {
			const existingNav = document.querySelector('.mobile-bottom-nav');
			if (existingNav) {
				existingNav.remove();
			}
			createMobileNavigation();

			if (isProjectsView()) {
				currentView = 'editor';
				updateMobileView('editor');
			}
		};

		window.addEventListener('hashchange', hashChangeHandler);
	};

	const setupMobileNavigation = () => {
		if (!document.querySelector('.mobile-bottom-nav')) {
			createMobileNavigation();
		}

		const handleViewChange = (view: string) => {
			currentView = view as typeof currentView;
			updateMobileView(view);

			setTimeout(() => {
				if (view === 'output') {
					const embed = document.querySelector('.pdf-viewer embed');
					if (embed) {
						(embed as HTMLElement).style.display = 'block';
						(embed as HTMLElement).style.width = '100%';
						(embed as HTMLElement).style.height = '100%';
					}
				}
			}, 50);
		};

		if (mobileClickHandler) {
			document.removeEventListener('click', mobileClickHandler);
		}

		mobileClickHandler = (e: Event) => {
			const target = e.target as HTMLElement;
			const navButton = target.closest('.mobile-nav-button');
			if (navButton) {
				const view = navButton.getAttribute('data-view');
				if (view) {
					handleViewChange(view);
				}
			}
		};

		document.addEventListener('click', mobileClickHandler);
	};

	const createMobileNavigation = () => {
		const existingNav = document.querySelector('.mobile-bottom-nav');
		if (existingNav) return;

		const nav = document.createElement('div');
		nav.className = 'mobile-bottom-nav';

		if (isProjectsView()) {
			nav.innerHTML = `
			<button class="mobile-nav-button ${currentView === 'explorer' ? 'active' : ''}" data-view="explorer">
				${renderIcon(ProjectsPlusIcon)}
				<span>${t('Create Project')}</span>
			</button>
			<button class="mobile-nav-button ${currentView === 'editor' ? 'active' : ''}" data-view="editor">
				${renderIcon(ProjectsIcon)}
				<span>${t('Projects')}</span>
			</button>
		`;
		} else {
			nav.innerHTML = `
			<button class="mobile-nav-button ${currentView === 'explorer' ? 'active' : ''}" data-view="explorer">
				${renderIcon(FolderIcon)}
				<span>${t('Explorer')}</span>
			</button>
			<button class="mobile-nav-button ${currentView === 'editor' ? 'active' : ''}" data-view="editor">
				${renderIcon(EditFileIcon)}
				<span>${t('Editor')}</span>
			</button>
			<button class="mobile-nav-button ${currentView === 'output' ? 'active' : ''}" data-view="output">
				${renderIcon(OutputIcon)}
				<span>${t('Output')}</span>
			</button>
			<button class="mobile-nav-button ${currentView === 'chat' ? 'active' : ''}" data-view="chat">
				${renderIcon(ChatIcon)}
				<span>${t('Chat')}</span>
			</button>
		`;
		}

		const appContainer = document.querySelector('.app-container');
		if (appContainer) {
			appContainer.appendChild(nav);
		} else {
			document.body.appendChild(nav);
		}
	};

	const updateMobileView = (view: string) => {
		document.querySelectorAll('.mobile-nav-button').forEach(btn => {
			btn.classList.toggle('active', btn.getAttribute('data-view') === view);
		});

		document.body.className = document.body.className.replace(/mobile-view-\w+/g, '');
		document.body.classList.add(`mobile-view-${view}`);

		if (view === 'chat') {
			setTimeout(() => {
				const chatHeader = document.querySelector('.chat-panel-header') as HTMLElement;
				if (chatHeader) {
					const chatPanel = chatHeader.closest('.chat-panel');
					if (chatPanel?.classList.contains('collapsed')) {
						chatHeader.click();
					}
				}
			}, 50);
		}

		localStorage.setItem('texlyre-mobile-view', view);
	};

	const setMobileViewport = () => {
		let viewportMeta = document.querySelector('meta[name="viewport"]');
		if (!viewportMeta) {
			viewportMeta = document.createElement('meta');
			viewportMeta.setAttribute('name', 'viewport');
			document.head.appendChild(viewportMeta);
		}

		const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

		if (isMobile) {
			viewportMeta.setAttribute('content', 'width=device-width, initial-scale=1.0, user-scalable=yes');
		} else {
			const screenWidth = window.screen.width;
			const targetWidth = 1200;
			const scale = screenWidth / targetWidth;
			viewportMeta.setAttribute('content', `width=${targetWidth}, initial-scale=${scale}, user-scalable=yes`);
		}
	};

	const resetViewport = () => {
		const viewportMeta = document.querySelector('meta[name="viewport"]');
		if (viewportMeta) {
			const screenWidth = window.screen.width;
			const targetWidth = 1200;
			const scale = screenWidth / targetWidth;
			viewportMeta.setAttribute('content', `width=${targetWidth}, initial-scale=${scale}, user-scalable=yes`);
		}
	};

	return {
		id: 'texlyre-mobile-theme',
		name: 'TeXlyre Mobile Theme',
		version: '1.0.0',
		type: 'theme',
		themes: [
			{ id: 'light', name: t('Light'), isDark: false },
			{ id: 'dark', name: t('Dark'), isDark: true },
			{ id: 'system', name: t('System'), isDark: false },
			{ id: 'monokai', name: t('Monokai'), isDark: true },
			{ id: 'tomorrow_night_blue', name: t('Tomorrow Night Blue'), isDark: true },
			{ id: 'github_light', name: t('GitHub Light'), isDark: false },
			{ id: 'solarized_light', name: t('Solarized Light'), isDark: false },
			{ id: 'atom_light', name: t('Atom Light'), isDark: false },
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
			document.documentElement.setAttribute('data-theme-plugin', 'texlyre-mobile');

			const isLoggedIn = localStorage.getItem('texlyre-current-user') !== null;

			if (isLoggedIn) {
				handleMobileNavigation();

				const savedView = localStorage.getItem('texlyre-mobile-view');
				if (savedView) {
					currentView = savedView as typeof currentView;
					updateMobileView(savedView);
				}
			} else {
				if (loginCheckInterval) {
					clearInterval(loginCheckInterval);
				}
				loginCheckInterval = setInterval(() => {
					if (localStorage.getItem('texlyre-current-user') !== null) {
						if (loginCheckInterval) {
							clearInterval(loginCheckInterval);
							loginCheckInterval = null;
						}
						handleMobileNavigation();
					}
				}, 500);
			}

			setMobileViewport();

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
			handleMobileNavigation();
		},

		cleanup(): void {
			cleanupMobileNavigation();
			resetViewport();
			if (loginCheckInterval) {
				clearInterval(loginCheckInterval);
				loginCheckInterval = null;
			}
		},
	};
};

const teXlyreMobileTheme = createTeXlyreMobileTheme();

window.addEventListener('beforeunload', () => {
	if (teXlyreMobileTheme.cleanup) {
		teXlyreMobileTheme.cleanup();
	}
});

const observer = new MutationObserver((mutations) => {
	mutations.forEach((mutation) => {
		if (mutation.type === 'attributes' && mutation.attributeName === 'data-theme-plugin') {
			const currentPlugin = document.documentElement.getAttribute('data-theme-plugin');
			if (currentPlugin !== 'texlyre-mobile' && teXlyreMobileTheme.cleanup) {
				teXlyreMobileTheme.cleanup();
			}
		}
	});
});

observer.observe(document.documentElement, {
	attributes: true,
	attributeFilter: ['data-theme-plugin']
});

export default teXlyreMobileTheme;