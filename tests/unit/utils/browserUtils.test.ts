import {
	BROWSER_DEFINITIONS,
	canRequestPersistentStorage,
	detectBrowser,
	detectBrowserAsync,
	getBrowserName,
	isBrowserKey,
	isBraveBrowser,
	isStandaloneApp,
} from '@src/utils/browserUtils';

const setBrowser = (
	userAgent: string,
	brands: Array<{ brand: string }> = [],
) => {
	Object.defineProperty(navigator, 'userAgent', {
		configurable: true,
		value: userAgent,
	});
	Object.defineProperty(navigator, 'userAgentData', {
		configurable: true,
		value: { brands },
	});
};

const setStandalone = (standalone: boolean) => {
	Object.defineProperty(window, 'matchMedia', {
		configurable: true,
		writable: true,
		value: jest.fn().mockImplementation((query: string) => ({
			matches: query === '(display-mode: standalone)' && standalone,
			media: query,
			onchange: null,
			addListener: jest.fn(),
			removeListener: jest.fn(),
			addEventListener: jest.fn(),
			removeEventListener: jest.fn(),
			dispatchEvent: jest.fn(),
		})),
	});

	Object.defineProperty(navigator, 'standalone', {
		configurable: true,
		value: false,
	});
};

describe('browserUtils', () => {
	beforeEach(() => {
		setBrowser('Mozilla/5.0 Chrome/150.0.0.0 Safari/537.36');
		setStandalone(false);
		Object.defineProperty(navigator, 'brave', {
			configurable: true,
			value: undefined,
		});
		Object.defineProperty(navigator, 'storage', {
			configurable: true,
			value: { persist: jest.fn() },
		});
	});

	const browserDetectionCases: Array<[
		string,
		string,
		Array<{ brand: string }>,
		keyof typeof BROWSER_DEFINITIONS,
	]> = [
		[
			'Microsoft Edge',
			'Mozilla/5.0 AppleWebKit/537.36 Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0',
			[],
			'edge',
		],
		[
			'Opera',
			'Mozilla/5.0 AppleWebKit/537.36 Chrome/150.0.0.0 Safari/537.36 OPR/135.0.0.0',
			[],
			'opera',
		],
		[
			'Opera on iOS',
			'Mozilla/5.0 AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1 OPT/6.0.0',
			[],
			'opera',
		],
		[
			'Samsung Internet',
			'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 SamsungBrowser/28.0 Chrome/150.0.0.0 Mobile Safari/537.36',
			[],
			'samsung',
		],
		[
			'Vivaldi',
			'Mozilla/5.0 AppleWebKit/537.36 Chrome/150.0.0.0 Safari/537.36 Vivaldi/8.0.0.0',
			[],
			'vivaldi',
		],
		[
			'Yandex Browser',
			'Mozilla/5.0 AppleWebKit/537.36 Chrome/150.0.0.0 Safari/537.36 YaBrowser/26.8.0.0',
			[],
			'yandex',
		],
		[
			'NAVER Whale',
			'Mozilla/5.0 AppleWebKit/537.36 Chrome/150.0.0.0 Whale/4.0.0.0 Safari/537.36',
			[{ brand: 'Chromium' }],
			'whale',
		],
		[
			'QQ Browser',
			'Mozilla/5.0 AppleWebKit/537.36 Chrome/116.0.0.0 Safari/537.36 QQBrowser/19.0.0.0',
			[{ brand: 'Chromium' }],
			'qq',
		],
		[
			'QQ Browser on mobile',
			'Mozilla/5.0 AppleWebKit/537.36 Version/4.0 Chrome/120.0.0.0 MQQBrowser/16.3 Mobile Safari/537.36',
			[],
			'qq',
		],
		[
			'UC Browser',
			'Mozilla/5.0 AppleWebKit/537.36 Chrome/123.0.0.0 UCBrowser/15.2.0.1396 Mobile Safari/537.36',
			[{ brand: 'Chromium' }],
			'uc',
		],
		[
			'Huawei Browser',
			'Mozilla/5.0 AppleWebKit/537.36 Chrome/114.0.0.0 Mobile Safari/537.36 HuaweiBrowser/14.0.0.0',
			[],
			'huawei',
		],
		[
			'Mi Browser',
			'Mozilla/5.0 AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36 XiaoMi/MiuiBrowser/18.0.0',
			[],
			'xiaomi',
		],
		[
			'Vivo Browser',
			'Mozilla/5.0 AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36 VivoBrowser/20.0.0.0',
			[],
			'vivo',
		],
		[
			'HeyTap Browser',
			'Mozilla/5.0 AppleWebKit/537.36 Chrome/115.0.0.0 Mobile Safari/537.36 HeyTapBrowser/40.10.6.0',
			[],
			'heytap',
		],
		[
			'Cốc Cốc',
			'Mozilla/5.0 AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36 coc_coc_browser/125.0.0',
			[],
			'coccoc',
		],
		[
			'Ecosia Browser',
			'Mozilla/5.0 AppleWebKit/537.36 Chrome/144.0.0.0 Mobile Safari/537.36 (Ecosia android@144.0.0.0)',
			[],
			'ecosia',
		],
		[
			'Maxthon',
			'Mozilla/5.0 AppleWebKit/599.0+ Maxthon/7.5.2 Chrome/151.0.0.0 Safari/537.48',
			[],
			'maxthon',
		],
		[
			'DuckDuckGo from Client Hints',
			'Mozilla/5.0 AppleWebKit/537.36 Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0',
			[{ brand: 'DuckDuckGo' }],
			'duckduckgo',
		],
		[
			'Firefox Focus',
			'Mozilla/5.0 AppleWebKit/537.36 Focus/150.0 Chrome/150.0.0.0 Mobile Safari/537.36',
			[],
			'firefoxFocus',
		],
		[
			'Firefox',
			'Mozilla/5.0 Firefox/150.0',
			[],
			'firefox',
		],
		[
			'Firefox on iOS',
			'Mozilla/5.0 AppleWebKit/605.1.15 FxiOS/150.0 Mobile/15E148 Safari/605.1.15',
			[],
			'firefox',
		],
		[
			'Google Chrome',
			'Mozilla/5.0 AppleWebKit/537.36 Chrome/150.0.0.0 Safari/537.36',
			[],
			'chrome',
		],
		[
			'Chrome on iOS',
			'Mozilla/5.0 AppleWebKit/605.1.15 CriOS/150.0 Mobile/15E148 Safari/604.1',
			[],
			'chrome',
		],
		[
			'Chromium from Client Hints',
			'Mozilla/5.0 AppleWebKit/537.36 Chrome/150.0.0.0 Safari/537.36',
			[{ brand: 'Chromium' }],
			'chromium',
		],
		[
			'GNOME Web / WebKitGTK',
			'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15',
			[],
			'webkitgtk',
		],
		[
			'Safari',
			'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15',
			[],
			'safari',
		],
	];

	it.each(browserDetectionCases)(
		'detects %s',
		(_label, userAgent, brands, expectedBrowser) => {
			setBrowser(userAgent, brands);
			expect(detectBrowser()).toBe(expectedBrowser);
			expect(getBrowserName(expectedBrowser)).toBe(
				BROWSER_DEFINITIONS[expectedBrowser].name,
			);
		},
	);

	it('does not pretend to distinguish Comet from Chrome', () => {
		setBrowser(
			'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/142.0.0.0 Safari/537.36',
			[
				{ brand: 'Chromium' },
				{ brand: 'Google Chrome' },
				{ brand: 'Not_A Brand' },
			],
		);

		expect(detectBrowser()).toBe('chrome');
	});

	it('uses Brave browser API when available', async () => {
		Object.defineProperty(navigator, 'brave', {
			configurable: true,
			value: { isBrave: jest.fn().mockResolvedValue(true) },
		});

		expect(await isBraveBrowser()).toBe(true);
		expect(await detectBrowserAsync()).toBe('brave');
	});

	it('falls back to normal detection when Brave API fails', async () => {
		Object.defineProperty(navigator, 'brave', {
			configurable: true,
			value: { isBrave: jest.fn().mockRejectedValue(new Error('blocked')) },
		});
		setBrowser('Mozilla/5.0 Firefox/150.0');

		expect(await isBraveBrowser()).toBe(false);
		expect(await detectBrowserAsync()).toBe('firefox');
	});

	it('validates browser keys', () => {
		expect(isBrowserKey('edge')).toBe(true);
		expect(isBrowserKey('other')).toBe(true);
		expect(isBrowserKey('netscape')).toBe(false);
		expect(isBrowserKey(null)).toBe(false);
	});

	it('detects standalone app mode', () => {
		setStandalone(true);
		expect(isStandaloneApp()).toBe(true);
	});

	it('detects persistent storage request support', () => {
		expect(canRequestPersistentStorage()).toBe(true);

		Object.defineProperty(navigator, 'storage', {
			configurable: true,
			value: {},
		});
		expect(canRequestPersistentStorage()).toBe(false);
	});
});
