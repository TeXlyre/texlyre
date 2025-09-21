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

	const layout: ThemeLayout = {
		id: "texlyre-mobile",
		name: "TeXlyre Mobile Theme",
		containerClass: "texlyre-mobile",
		fileExplorerPosition: "left",
		defaultFileExplorerWidth: 100, // Mobile uses full width
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

	const handleMobileNavigation = () => {
		// Set up mobile navigation handling
		const setupNav = () => {
			setupMobileNavigation();
		};

		if (document.readyState === 'loading') {
			document.addEventListener('DOMContentLoaded', setupNav);
		} else {
			setupNav();
		}
	};

	const setupMobileNavigation = () => {
		// Create mobile navigation if it doesn't exist
		if (!document.querySelector('.mobile-bottom-nav')) {
			createMobileNavigation();
		}

		// Handle view switching
		const handleViewChange = (view: string) => {
			currentView = view as typeof currentView;
			updateMobileView(view);
			
			// Force layout adjustments after view change
			setTimeout(() => {
				if (view === 'explorer') {
					// Force file explorer to full width
					const sidebar = document.querySelector('.sidebar-container');
					const explorer = document.querySelector('.file-explorer');
					const explorerContainer = document.querySelector('.explorer-container');
					
					if (sidebar) {
						(sidebar as HTMLElement).style.width = '100vw';
						(sidebar as HTMLElement).style.maxWidth = '100vw';
						(sidebar as HTMLElement).style.minWidth = '100vw';
					}
					if (explorer) {
						(explorer as HTMLElement).style.width = '100%';
						(explorer as HTMLElement).style.maxWidth = '100%';
						(explorer as HTMLElement).style.minWidth = '100%';
					}
					if (explorerContainer) {
						(explorerContainer as HTMLElement).style.width = '100%';
						(explorerContainer as HTMLElement).style.maxWidth = '100%';
						(explorerContainer as HTMLElement).style.minWidth = '100%';
					}
				} else if (view === 'output') {
					// Ensure the LaTeX output container is visible
					const latexOutput = document.querySelector('.latex-output-container');
					if (latexOutput) {
						(latexOutput as HTMLElement).style.display = 'flex';
						(latexOutput as HTMLElement).style.width = '100vw';
						(latexOutput as HTMLElement).style.height = '100%';
					}
					
					// Force PDF viewer to be visible
					const pdfViewer = document.querySelector('.pdf-viewer');
					if (pdfViewer) {
						(pdfViewer as HTMLElement).style.display = 'flex';
						(pdfViewer as HTMLElement).style.width = '100%';
						(pdfViewer as HTMLElement).style.height = '100%';
					}
					
					// Force embed to be visible
					const embed = document.querySelector('.pdf-viewer embed');
					if (embed) {
						(embed as HTMLElement).style.display = 'block';
						(embed as HTMLElement).style.width = '100%';
						(embed as HTMLElement).style.height = '100%';
					}
				} else if (view === 'chat') {
					// Force existing chat panel to be visible
					const chatPanel = document.querySelector('.chat-panel');
					if (chatPanel) {
						(chatPanel as HTMLElement).style.display = 'flex';
						(chatPanel as HTMLElement).style.position = 'static';
						(chatPanel as HTMLElement).style.width = '100vw';
						(chatPanel as HTMLElement).style.height = '100%';
						(chatPanel as HTMLElement).style.transform = 'none';
						(chatPanel as HTMLElement).style.flexDirection = 'column';
						(chatPanel as HTMLElement).style.borderRadius = '0';
						(chatPanel as HTMLElement).style.border = 'none';
					}
				}
				
				// Hide footer elements but preserve chat panel
				const footers = document.querySelectorAll('footer');
				footers.forEach(footer => {
					// Hide footer children except chat panel
					const children = footer.children;
					for (let i = 0; i < children.length; i++) {
						const child = children[i] as HTMLElement;
						if (!child.classList.contains('chat-panel')) {
							child.style.display = 'none';
							child.style.visibility = 'hidden';
						}
					}
					// Make footer transparent but keep structure
					(footer as HTMLElement).style.background = 'transparent';
					(footer as HTMLElement).style.border = 'none';
					(footer as HTMLElement).style.padding = '0';
					(footer as HTMLElement).style.margin = '0';
				});
				
				// Also hide .footer-chat if it's not the chat panel itself
				const footerChats = document.querySelectorAll('.footer-chat');
				footerChats.forEach(footerChat => {
					if (!footerChat.classList.contains('chat-panel')) {
						(footerChat as HTMLElement).style.display = 'none';
						(footerChat as HTMLElement).style.visibility = 'hidden';
					}
				});
			}, 100);
		};

		// Add event listeners for mobile navigation
		document.addEventListener('click', (e) => {
			const target = e.target as HTMLElement;
			const navButton = target.closest('.mobile-nav-button');
			if (navButton) {
				const view = navButton.getAttribute('data-view');
				if (view) {
					handleViewChange(view);
				}
			}
		});
	};

	const createMobileNavigation = () => {
		const existingNav = document.querySelector('.mobile-bottom-nav');
		if (existingNav) return;

		const nav = document.createElement('div');
		nav.className = 'mobile-bottom-nav';
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

		document.body.appendChild(nav);
	};

	const updateMobileView = (view: string) => {
		// Update active navigation button
		document.querySelectorAll('.mobile-nav-button').forEach(btn => {
			btn.classList.toggle('active', btn.getAttribute('data-view') === view);
		});

		// Update view classes on body
		document.body.className = document.body.className.replace(/mobile-view-\w+/g, '');
		document.body.classList.add(`mobile-view-${view}`);

		// Store current view for persistence
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
			
			// Set up mobile navigation
			handleMobileNavigation();
			
			// Restore saved view
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
	};
};

const teXlyreMobileTheme = createTeXlyreMobileTheme();

export default teXlyreMobileTheme;