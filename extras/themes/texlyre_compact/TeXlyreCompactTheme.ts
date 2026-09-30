import type {
	ThemeLayout,
	ThemePlugin,
	ThemeVariant,
} from '@/plugins/PluginInterface';
import { isThemeColorId, themes } from '../shared/colors';
import './styles/index.css';

const createTeXlyreCompactTheme = (): ThemePlugin => {
	let currentThemeId = 'dark';

	let dockObserver: MutationObserver | null = null;
	let chatResizeObserver: ResizeObserver | null = null;
	let observedChat: HTMLElement | null = null;
	let resizeHandler: (() => void) | null = null;
	let dockFrame = 0;

	const clearFooterDock = () => {
		if (dockFrame) {
			cancelAnimationFrame(dockFrame);
			dockFrame = 0;
		}
		dockObserver?.disconnect();
		dockObserver = null;
		chatResizeObserver?.disconnect();
		chatResizeObserver = null;
		observedChat = null;
		if (resizeHandler) {
			window.removeEventListener('resize', resizeHandler);
			resizeHandler = null;
		}
		document
			.querySelectorAll<HTMLElement>('.compact-footer-docked')
			.forEach((element) => {
				element.classList.remove('compact-footer-docked');
				['left', 'right', 'bottom', 'position', 'width'].forEach((property) => {
					element.style.removeProperty(property);
				});
			});
		document
			.querySelectorAll<HTMLElement>('.app-container > footer')
			.forEach((footer) => {
				footer.style.removeProperty('padding-inline-end');
			});
	};

	const getCompactPx = (name: string, fallback: number) => {
		const value = Number.parseFloat(
			getComputedStyle(document.documentElement).getPropertyValue(name),
		);
		return Number.isFinite(value) ? value : fallback;
	};

	const dockElement = (element: HTMLElement, left: number, width: number) => {
		element.classList.add('compact-footer-docked');
		element.style.setProperty('position', 'fixed', 'important');
		element.style.setProperty('left', `${Math.round(left)}px`, 'important');
		element.style.setProperty('right', 'auto', 'important');
		element.style.setProperty('bottom', '0', 'important');
		element.style.setProperty('width', `${width}px`, 'important');
	};

	const getDockWidth = (element: HTMLElement | null) => {
		if (!element) return 0;
		const minWidth = getCompactPx('--compact-footer-service-min-width', 88);
		const maxWidth = getCompactPx('--compact-footer-service-max-width', 160);
		element.style.setProperty('width', 'max-content', 'important');
		const group = element.querySelector<HTMLElement>(
			'.ui-button-group[data-role="status"]',
		);
		const measuredWidth = Math.max(
			element.getBoundingClientRect().width,
			element.scrollWidth,
			group?.scrollWidth ?? 0,
		);
		return Math.min(maxWidth, Math.max(minWidth, Math.ceil(measuredWidth)));
	};

	const scheduleFooterDock = () => {
		if (dockFrame) cancelAnimationFrame(dockFrame);
		dockFrame = requestAnimationFrame(updateFooterDock);
	};

	const updateFooterDock = () => {
		dockFrame = 0;
		if (
			document.documentElement.getAttribute('data-layout') !== 'texlyre-compact'
		)
			return;
		const app = document.querySelector<HTMLElement>('.app-container');
		const footer = app?.querySelector<HTMLElement>(':scope > footer');
		const header = app?.querySelector<HTMLElement>(':scope > header');
		if (!app || !footer || !header) return;
		const backup = header.querySelector<HTMLElement>(
			'.backup-status-dropdown-container',
		);
		const collab = header.querySelector<HTMLElement>(
			'.collab-status-dropdown-container',
		);
		const chat = footer.querySelector<HTMLElement>('.footer-chat');
		const isRtl = document.documentElement.dir === 'rtl';
		if (window.innerWidth < 760 || (!backup && !collab)) {
			[backup, collab].forEach((element) => {
				if (!element) return;
				element.classList.remove('compact-footer-docked');
				['left', 'right', 'bottom', 'position', 'width'].forEach((property) => {
					element.style.removeProperty(property);
				});
			});
			footer.style.removeProperty('padding-inline-end');
			return;
		}
		const edge = getCompactPx('--compact-footer-controls-right', 12);
		const gap = getCompactPx('--compact-footer-service-gap', 4);
		const backupWidth = getDockWidth(backup);
		const collabWidth = getDockWidth(collab);
		if (chat) {
			if (observedChat !== chat) {
				chatResizeObserver?.disconnect();
				observedChat = chat;
				chatResizeObserver = new ResizeObserver(scheduleFooterDock);
				chatResizeObserver.observe(chat);
			}
			const chatRect = chat.getBoundingClientRect();
			let collabLeft: number;
			let backupLeft: number;

			if (isRtl) {
				collabLeft = collab
					? Math.min(
							window.innerWidth - edge - collabWidth,
							chatRect.right + gap,
						)
					: chatRect.right;
				backupLeft = backup
					? Math.min(
							window.innerWidth - edge - backupWidth,
							(collab ? collabLeft + collabWidth : chatRect.right) + gap,
						)
					: chatRect.right;
			} else {
				collabLeft = collab
					? Math.max(edge, chatRect.left - gap - collabWidth)
					: chatRect.left;
				backupLeft = backup
					? Math.max(
							edge,
							(collab ? collabLeft : chatRect.left) - gap - backupWidth,
						)
					: chatRect.left;
			}

			if (backup) dockElement(backup, backupLeft, backupWidth);
			if (collab) dockElement(collab, collabLeft, collabWidth);
			const footerReserve = isRtl
				? (backup
						? backupLeft + backupWidth
						: collab
							? collabLeft + collabWidth
							: chatRect.right) + edge
				: Math.max(
						0,
						window.innerWidth -
							(backup ? backupLeft : collab ? collabLeft : chatRect.left) +
							edge,
					);
			footer.style.setProperty(
				'padding-inline-end',
				`${Math.ceil(footerReserve)}px`,
				'important',
			);
		} else {
			chatResizeObserver?.disconnect();
			chatResizeObserver = null;
			observedChat = null;
			const primary = backup ?? collab;
			const primaryWidth = backup ? backupWidth : collabWidth;
			if (primary) {
				dockElement(
					primary,
					isRtl
						? edge
						: Math.max(edge, window.innerWidth - edge - primaryWidth),
					primaryWidth,
				);
			}
			const secondary = primary === backup ? collab : backup;
			if (secondary) {
				secondary.classList.remove('compact-footer-docked');
				['left', 'right', 'bottom', 'position', 'width'].forEach((property) => {
					secondary.style.removeProperty(property);
				});
			}
			footer.style.setProperty(
				'padding-inline-end',
				`${edge + primaryWidth + 8}px`,
				'important',
			);
		}
	};

	const setupFooterDock = () => {
		clearFooterDock();
		scheduleFooterDock();
		dockObserver = new MutationObserver(() => {
			if (
				document.documentElement.getAttribute('data-layout') !==
				'texlyre-compact'
			) {
				clearFooterDock();
				return;
			}
			scheduleFooterDock();
		});
		dockObserver.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ['data-layout', 'dir'],
		});
		if (document.body) {
			dockObserver.observe(document.body, {
				childList: true,
				subtree: true,
				attributes: true,
				attributeFilter: ['class'],
			});
		}
		resizeHandler = scheduleFooterDock;
		window.addEventListener('resize', resizeHandler);
		setTimeout(scheduleFooterDock, 0);
		setTimeout(scheduleFooterDock, 100);
	};

	const layout: ThemeLayout = {
		id: 'texlyre-compact',
		name: 'TeXlyre Compact Theme',
		containerClass: 'texlyre-compact',
		defaultFileExplorerWidth: 240,
		minFileExplorerWidth: 180,
		maxFileExplorerWidth: 700,
		stylesheetPath: './styles/layout.css',
	};

	const applyThemeColors = (themeId: string) => {
		if (!isThemeColorId(themeId)) return;
		const colors = themes[themeId];

		Object.entries(colors).forEach(([key, value]) => {
			document.documentElement.style.setProperty(
				`--pico-${key}`,
				value as string,
			);
		});
		document.documentElement.style.setProperty('color', colors.color);
		document.documentElement.style.setProperty('--text-color', colors.color);
	};

	const variants: ThemeVariant[] = [
		{ id: 'light', name: 'Light', isDark: false },
		{ id: 'dark', name: 'Dark', isDark: true },
		{ id: 'system', name: 'System', isDark: false },
		{ id: 'monokai', name: 'Monokai', isDark: true },
		{ id: 'tomorrow_night_blue', name: 'Tomorrow Night Blue', isDark: true },
		{ id: 'nord', name: 'Nord', isDark: true },
		{ id: 'deuteranopia', name: 'Deuteranopia', isDark: true },
		{ id: 'protanopia', name: 'Protanopia', isDark: false },
		{ id: 'tritanopia', name: 'Tritanopia', isDark: false },
		{ id: 'solarized_light', name: 'Solarized Light', isDark: false },
		{ id: 'atom_light', name: 'Atom Light', isDark: false },
	];

	return {
		id: 'texlyre-compact-theme',
		name: 'TeXlyre Compact Theme',
		version: '1.0.15',
		type: 'theme',
		themes: variants,

		applyTheme(variantId: string): boolean {
			const theme = variants.find((item) => item.id === variantId);
			if (!theme || variantId === 'system') return false;

			currentThemeId = variantId;
			applyThemeColors(variantId);
			document.documentElement.setAttribute('data-theme', variantId);
			// Reuse the wide theme's palette tokens/variant rules intentionally.
			document.documentElement.setAttribute('data-theme-plugin', 'texlyre');
			document.documentElement.setAttribute(
				'data-theme-mode',
				theme.isDark ? 'dark' : 'light',
			);
			return true;
		},

		getThemeVariants(): ThemeVariant[] {
			return variants;
		},

		getCurrentTheme(): ThemeVariant {
			return variants.find((item) => item.id === currentThemeId) || variants[0];
		},

		getLayout(): ThemeLayout {
			return layout;
		},

		applyLayout(): void {
			document.documentElement.setAttribute('data-layout', layout.id);
			setupFooterDock();
		},

		cleanup(): void {
			clearFooterDock();
		},
	};
};

export default createTeXlyreCompactTheme();
