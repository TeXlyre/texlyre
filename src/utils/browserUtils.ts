// src/utils/browserUtils.ts

export type BrowserDefinition = {
	name: string;
	brands?: readonly string[];
	uaTokens?: readonly string[];
};

export const BROWSER_DEFINITIONS = {
	brave: {
		name: 'Brave',
		brands: ['brave'],
		uaTokens: ['brave'],
	},
	edge: {
		name: 'Microsoft Edge',
		brands: ['microsoft edge'],
		uaTokens: ['edg/', 'edga/', 'edgios/'],
	},
	opera: {
		name: 'Opera',
		brands: ['opera'],
		uaTokens: ['opr/', 'opt/'],
	},
	vivaldi: {
		name: 'Vivaldi',
		brands: ['vivaldi'],
		uaTokens: ['vivaldi/', 'viva-ios/', 'vivaios/'],
	},
	samsung: {
		name: 'Samsung Internet',
		brands: ['samsung internet'],
		uaTokens: ['samsungbrowser/'],
	},
	yandex: {
		name: 'Yandex Browser',
		brands: ['yandex'],
		uaTokens: ['yabrowser/'],
	},
	whale: {
		name: 'NAVER Whale',
		brands: ['naver whale', 'whale'],
		uaTokens: ['whale/'],
	},
	qq: {
		name: 'QQ Browser',
		brands: ['qq browser', 'qqbrowser'],
		uaTokens: ['qqbrowser/', 'mqqbrowser/'],
	},
	uc: {
		name: 'UC Browser',
		brands: ['uc browser', 'ucbrowser'],
		uaTokens: ['ucbrowser/'],
	},
	huawei: {
		name: 'Huawei Browser',
		brands: ['huawei browser'],
		uaTokens: ['huaweibrowser/'],
	},
	xiaomi: {
		name: 'Mi Browser',
		brands: ['mi browser', 'miui browser'],
		uaTokens: ['miuibrowser/'],
	},
	vivo: {
		name: 'Vivo Browser',
		brands: ['vivo browser'],
		uaTokens: ['vivobrowser/'],
	},
	heytap: {
		name: 'HeyTap Browser',
		brands: ['heytap browser', 'heytapbrowser'],
		uaTokens: ['heytapbrowser/'],
	},
	coccoc: {
		name: 'Cốc Cốc',
		brands: ['cốc cốc', 'coc coc', 'coccoc'],
		uaTokens: ['coc_coc_browser/', 'coccocbrowser/'],
	},
	ecosia: {
		name: 'Ecosia Browser',
		brands: ['ecosia'],
		uaTokens: ['(ecosia ', 'ecosia/'],
	},
	maxthon: {
		name: 'Maxthon',
		brands: ['maxthon'],
		uaTokens: ['maxthon/', 'mxbrowser/'],
	},
	duckduckgo: {
		name: 'DuckDuckGo',
		brands: ['duckduckgo'],
		uaTokens: ['duckduckgo'],
	},
	firefoxFocus: {
		name: 'Firefox Focus / Klar',
		brands: ['firefox focus', 'firefox klar'],
		uaTokens: ['focus/'],
	},
	firefox: {
		name: 'Firefox',
		brands: ['firefox'],
		uaTokens: ['firefox/', 'fxios/'],
	},
	chrome: {
		name: 'Google Chrome',
		brands: ['google chrome'],
		uaTokens: ['chrome/', 'crios/'],
	},
	chromium: {
		name: 'Chromium',
		brands: ['chromium'],
		uaTokens: ['chromium/'],
	},
	webkitgtk: {
		name: 'GNOME Web / WebKitGTK',
		brands: ['gnome web', 'webkitgtk'],
	},
	safari: {
		name: 'Safari',
		brands: ['safari'],
		uaTokens: ['safari/'],
	},
	other: {
		name: 'Browser',
	},
} as const satisfies Record<string, BrowserDefinition>;

export type BrowserKey = keyof typeof BROWSER_DEFINITIONS;

export type BrowserNavigator = Navigator & {
	brave?: { isBrave?: () => Promise<boolean> };
	standalone?: boolean;
	userAgentData?: { brands?: Array<{ brand: string }> };
};

const browserEntries = Object.entries(BROWSER_DEFINITIONS) as Array<
	[BrowserKey, BrowserDefinition]
>;
const genericBrandKeys = new Set<BrowserKey>(['chrome', 'chromium', 'safari']);

function findBrowser(
	matches: (key: BrowserKey, definition: BrowserDefinition) => boolean,
): BrowserKey | undefined {
	return browserEntries.find(([key, definition]) =>
		matches(key, definition),
	)?.[0];
}

export function isBrowserKey(value: unknown): value is BrowserKey {
	return typeof value === 'string' && Object.hasOwn(BROWSER_DEFINITIONS, value);
}

export function getBrowserName(browser: BrowserKey): string {
	return BROWSER_DEFINITIONS[browser].name;
}

function isWebKitGtkUserAgent(ua: string): boolean {
	return (
		ua.includes('linux') &&
		ua.includes('applewebkit/') &&
		ua.includes('safari/') &&
		!ua.includes('chrome/') &&
		!ua.includes('chromium/') &&
		!ua.includes('crios/')
	);
}

export function detectBrowser(): BrowserKey {
	if (typeof navigator === 'undefined') return 'other';

	const browserNavigator = navigator as BrowserNavigator;
	const ua = browserNavigator.userAgent.toLowerCase();
	const brands =
		browserNavigator.userAgentData?.brands?.map(({ brand }) =>
			brand.toLowerCase(),
		) ?? [];
	const matchesBrand = ({ brands: knownBrands }: BrowserDefinition) =>
		knownBrands?.some((brand) => brands.includes(brand)) === true;

	return (
		findBrowser(
			(key, definition) =>
				!genericBrandKeys.has(key) && matchesBrand(definition),
		) ??
		(isWebKitGtkUserAgent(ua) ? 'webkitgtk' : undefined) ??
		findBrowser(
			(key, { uaTokens }) =>
				!genericBrandKeys.has(key) &&
				uaTokens?.some((token) => ua.includes(token)) === true,
		) ??
		findBrowser((_key, definition) => matchesBrand(definition)) ??
		findBrowser(
			(_key, { uaTokens }) =>
				uaTokens?.some((token) => ua.includes(token)) === true,
		) ??
		'other'
	);
}

export async function isBraveBrowser(): Promise<boolean> {
	if (typeof navigator === 'undefined') return false;

	const brave = (navigator as BrowserNavigator).brave;
	if (!brave?.isBrave) return false;

	try {
		return await brave.isBrave();
	} catch {
		return false;
	}
}

export async function detectBrowserAsync(): Promise<BrowserKey> {
	return (await isBraveBrowser()) ? 'brave' : detectBrowser();
}

export function isStandaloneApp(): boolean {
	if (typeof window === 'undefined' || typeof navigator === 'undefined') {
		return false;
	}

	return (
		window.matchMedia?.('(display-mode: standalone)').matches === true ||
		(navigator as BrowserNavigator).standalone === true
	);
}

export function canRequestPersistentStorage(): boolean {
	return (
		typeof navigator !== 'undefined' &&
		typeof navigator.storage?.persist === 'function'
	);
}
