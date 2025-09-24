// extras/themes/texlyre_mobile/TeXlyreMobileTheme.ts
import type {
	ThemeLayout,
	ThemePlugin,
	ThemeVariant,
} from "../../../src/plugins/PluginInterface";
import { themes } from "./colors";
import "./styles/index.css";

const createTeXlyreMobileTheme = (): ThemePlugin => {
	let currentThemeId = "dark";
	let currentView: "explorer" | "editor" | "output" | "chat" = "editor";
	let mobileClickHandler: ((e: Event) => void) | null = null;
	let hashChangeHandler: (() => void) | null = null;

	const layout: ThemeLayout = {
		id: "texlyre-mobile",
		name: "TeXlyre Mobile Theme",
		containerClass: "texlyre-mobile",
		defaultFileExplorerWidth: 100,
		minFileExplorerWidth: 100,
		maxFileExplorerWidth: 100,
		stylesheetPath: "./styles/layout.css",
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
		document.documentElement.style.setProperty("color", colors.color);
		document.documentElement.style.setProperty("--text-color", colors.color);
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
				currentView = "editor";
				updateMobileView("editor");
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
					<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
						<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
						<line x1="12" y1="11" x2="12" y2="17"/>
						<line x1="9" y1="14" x2="15" y2="14"/>
					</svg>
					<span>Create Project</span>
				</button>
				<button class="mobile-nav-button ${currentView === 'editor' ? 'active' : ''}" data-view="editor">
					<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
						<path d="M10 4H4c-1.11 0-2 .89-2 2v12c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2h-8l-2-2z"/>
					</svg>
					<span>Projects</span>
				</button>
			`;
		} else {
			nav.innerHTML = `
				<button class="mobile-nav-button ${currentView === 'explorer' ? 'active' : ''}" data-view="explorer">
					<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
						<path d="M10 4H4c-1.11 0-2 .89-2 2v12c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2h-8l-2-2z"/>
					</svg>
					<span>Explorer</span>
				</button>
				<button class="mobile-nav-button ${currentView === 'editor' ? 'active' : ''}" data-view="editor">
					<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
						<path d="M20.71,7.04C21.1,6.65 21.1,6 20.71,5.63L18.37,3.29C18,2.9 17.35,2.9 16.96,3.29L15.12,5.12L18.87,8.87M3,17.25V21H6.75L17.81,9.93L14.06,6.18L3,17.25Z"/>
					</svg>
					<span>Editor</span>
				</button>
				<button class="mobile-nav-button ${currentView === 'output' ? 'active' : ''}" data-view="output">
					<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
						<path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z"/>
					</svg>
					<span>Output</span>
				</button>
				<button class="mobile-nav-button ${currentView === 'chat' ? 'active' : ''}" data-view="chat">
					<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
						<path d="M20,2H4A2,2 0 0,0 2,4V22L6,18H20A2,2 0 0,0 22,16V4C22,2.89 21.1,2 20,2Z"/>
					</svg>
					<span>Chat</span>
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

		localStorage.setItem('texlyre-mobile-view', view);
	};

	return {
		id: "texlyre-mobile-theme",
		name: "TeXlyre Mobile Theme",
		version: "1.0.0",
		type: "theme",
		themes: [
			{ id: "light", name: "Light", isDark: false },
			{ id: "dark", name: "Dark", isDark: true },
			{ id: "system", name: "System", isDark: false },
			{ id: "monokai", name: "Monokai", isDark: true },
			{ id: "tomorrow_night_blue", name: "Tomorrow Night Blue", isDark: true },
			{ id: "github_light", name: "GitHub Light", isDark: false },
			{ id: "solarized_light", name: "Solarized Light", isDark: false },
			{ id: "atom_light", name: "Atom Light", isDark: false },
		],

		applyTheme(variantId: string): boolean {
			const theme = this.themes.find((t) => t.id === variantId);
			if (!theme) return false;

			currentThemeId = variantId;

			if (variantId === "system") {
				const prefersDark = window.matchMedia(
					"(prefers-color-scheme: dark)",
				).matches;
				applyThemeColors(prefersDark ? "dark" : "light");
			} else {
				applyThemeColors(variantId);
			}

			document.documentElement.setAttribute("data-theme", variantId);
			document.documentElement.setAttribute("data-theme-plugin", "texlyre-mobile");
			
			handleMobileNavigation();
			
			const savedView = localStorage.getItem('texlyre-mobile-view');
			if (savedView) {
				currentView = savedView as typeof currentView;
				updateMobileView(savedView);
			}

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
			document.documentElement.setAttribute("data-layout", layout.id);
			handleMobileNavigation();
		},

		cleanup(): void {
			cleanupMobileNavigation();
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