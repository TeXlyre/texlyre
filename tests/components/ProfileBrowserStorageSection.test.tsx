import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import BrowserStorageSection from '@src/components/profile/ProfileBrowserStorageSection';
import { useStorageQuota } from '@src/hooks/useStorageQuota';
import {
    deleteProjectTypesetterCaches,
    deleteDatabases,
    deleteTypstPackageCache,
    hasProjectTypesetterCache,
    hasTypstPackageCache,
    listReclaimableDatabases,
} from '@src/utils/dbDeleteUtils';
import { estimateDetailedStorageUsage } from '@src/utils/storageUsageUtils';

jest.mock('@src/hooks/useStorageQuota', () => ({
    useStorageQuota: jest.fn(),
}));

jest.mock('@src/services/AuthService', () => ({
    authService: {
        getAllProjects: jest.fn().mockResolvedValue([]),
    },
}));

jest.mock('@src/utils/dbDeleteUtils', () => ({
    deleteProjectTypesetterCaches: jest.fn().mockResolvedValue(0),
    deleteDatabases: jest.fn().mockResolvedValue(0),
    deleteTypstPackageCache: jest.fn().mockResolvedValue(0),
    hasProjectTypesetterCache: jest.fn().mockResolvedValue(false),
    hasTypstPackageCache: jest.fn().mockResolvedValue(false),
    listReclaimableDatabases: jest.fn().mockResolvedValue([]),
}));

jest.mock('@src/utils/storageUsageUtils', () => ({
    estimateDetailedStorageUsage: jest.fn().mockResolvedValue([]),
}));

jest.mock('@src/utils/fileUtils', () => ({
    formatFileSize: (bytes: number) => {
        const rounded = Math.round(bytes);
        if (rounded < 1024) return `${rounded} bytes`;
        if (rounded < 1024 * 1024) return `${(rounded / 1024).toFixed(1)} KB`;
        if (rounded < 1024 * 1024 * 1024)
            return `${(rounded / (1024 * 1024)).toFixed(1)} MB`;
        return `${(rounded / (1024 * 1024 * 1024)).toFixed(1)} GB`;
    },
}));

const mockedUseStorageQuota = useStorageQuota as jest.MockedFunction<
    typeof useStorageQuota
>;
const mockedDeleteProjectTypesetterCaches =
    deleteProjectTypesetterCaches as jest.MockedFunction<
        typeof deleteProjectTypesetterCaches
    >;
const mockedDeleteDatabases = deleteDatabases as jest.MockedFunction<
    typeof deleteDatabases
>;
const mockedDeleteTypstPackageCache =
    deleteTypstPackageCache as jest.MockedFunction<typeof deleteTypstPackageCache>;
const mockedHasProjectTypesetterCache =
    hasProjectTypesetterCache as jest.MockedFunction<
        typeof hasProjectTypesetterCache
    >;
const mockedHasTypstPackageCache =
    hasTypstPackageCache as jest.MockedFunction<typeof hasTypstPackageCache>;
const mockedListReclaimableDatabases =
    listReclaimableDatabases as jest.MockedFunction<
        typeof listReclaimableDatabases
    >;
const mockedEstimateDetailedStorageUsage =
    estimateDetailedStorageUsage as jest.MockedFunction<
        typeof estimateDetailedStorageUsage
    >;

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

describe('ProfileBrowserStorageSection Component', () => {
    const requestPersistence = jest.fn();

    const buildState = (overrides: Record<string, unknown> = {}) =>
        ({
            isSupported: true,
            isPersisted: false,
            usageBytes: 100,
            quotaBytes: 1000,
            availableBytes: 900,
            usedRatio: 0.1,
            segments: [],
            updatedAt: Date.now(),
            isLow: false,
            hideBanner: false,
            refresh: jest.fn(),
            requestPersistence,
            ...overrides,
        }) as unknown as ReturnType<typeof useStorageQuota>;

    const renderSection = (onSuccess = jest.fn(), onError = jest.fn()) => {
        render(
            <BrowserStorageSection
                isSubmitting={false}
                setIsSubmitting={jest.fn()}
                onError={onError}
                onSuccess={onSuccess}
            />,
        );

        return { onSuccess, onError };
    };

    beforeEach(() => {
        jest.clearAllMocks();
        setStandalone(false);
        setBrowser('Mozilla/5.0 Chrome/150.0.0.0 Safari/537.36');
        Object.defineProperty(navigator, 'brave', {
            configurable: true,
            value: undefined,
        });
        requestPersistence.mockResolvedValue(true);
        mockedUseStorageQuota.mockReturnValue(buildState());
        mockedListReclaimableDatabases.mockResolvedValue([]);
        mockedEstimateDetailedStorageUsage.mockResolvedValue([]);
        mockedHasProjectTypesetterCache.mockResolvedValue(false);
        mockedHasTypstPackageCache.mockResolvedValue(false);
        mockedDeleteDatabases.mockResolvedValue(0);
        mockedDeleteProjectTypesetterCaches.mockResolvedValue(0);
        mockedDeleteTypstPackageCache.mockResolvedValue(0);

        Object.defineProperty(navigator, 'storage', {
            configurable: true,
            value: {
                persist: jest.fn(),
            },
        });
    });

    it('should disable Keep my data outside the installed app', () => {
        renderSection();

        expect(screen.getByRole('button', { name: 'Keep my data' })).toBeDisabled();
    });

    it('should explain why Keep my data is disabled outside the installed app', () => {
        renderSection();

        const infoButton = document.querySelector('.info-tooltip-trigger');
        expect(infoButton).not.toBeNull();

        fireEvent.click(infoButton as HTMLButtonElement);

        expect(
            screen.getByText(
                'Install TeXlyre as an app to enable this option. Your projects are still saved locally in this browser.',
            ),
        ).toBeInTheDocument();
    });

    it('should enable Keep my data in the installed app', () => {
        setStandalone(true);
        renderSection();

        expect(screen.getByRole('button', { name: 'Keep my data' })).toBeEnabled();
    });

    it('should request persistence in the installed app', async () => {
        setStandalone(true);
        const { onSuccess } = renderSection();

        fireEvent.click(screen.getByRole('button', { name: 'Keep my data' }));

        await waitFor(() => expect(requestPersistence).toHaveBeenCalledTimes(1));
        expect(onSuccess).toHaveBeenCalledWith(
            'Your data is now protected from automatic deletion',
        );
    });

    it('should not show a fake undo action after persistence is granted', () => {
        mockedUseStorageQuota.mockReturnValue(buildState({ isPersisted: true }));
        renderSection();

        expect(
            screen.queryByRole('button', { name: 'Undo protection...' }),
        ).not.toBeInTheDocument();
    });

    it('should show the former undo guidance in an info tooltip when protected', () => {
        setStandalone(true);
        mockedUseStorageQuota.mockReturnValue(buildState({ isPersisted: true }));
        renderSection();

        const infoButton = document.querySelector(
            '.browser-storage-persistence-actions .info-tooltip-trigger',
        );
        expect(infoButton).not.toBeNull();

        fireEvent.click(infoButton as HTMLButtonElement);

        expect(screen.getByText('Storage protection')).toBeInTheDocument();
        expect(
            screen.getByText(
                'TeXlyre cannot disable persistent storage after your browser grants it.',
            ),
        ).toBeInTheDocument();
        expect(screen.getByText(/Detected browser:/)).toHaveTextContent(
            'Detected browser: Google Chrome',
        );
        expect(
            screen.getByText(
                'Use your browser settings to clear TeXlyre site data. This deletes local projects and other local TeXlyre data, so export anything you need first.',
            ),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('link', {
                name: 'Open Google Chrome site-data instructions',
            }),
        ).toBeInTheDocument();
        expect(
            screen.getByText(/Installed Chromium apps may receive persistent storage again/),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('link', { name: 'Open app uninstall instructions' }),
        ).toBeInTheDocument();
    });

    it('should keep the persistence action vertically aligned with its text', () => {
        renderSection();

        const button = screen.getByRole('button', { name: 'Keep my data' });
        const actions = button.closest('.browser-storage-persistence-actions');

        expect(actions).not.toBeNull();
        expect((actions as HTMLElement).style.alignItems).toBe('center');
        expect((button as HTMLButtonElement).style.margin).toBe('0px');
    });

    it('should always show detected browser data-management instructions', () => {
        setStandalone(true);
        setBrowser(
            'Mozilla/5.0 AppleWebKit/537.36 Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0',
        );
        mockedUseStorageQuota.mockReturnValue(buildState({ isPersisted: true }));
        renderSection();

        expect(screen.getByText(/Browser:/)).toHaveTextContent(
            'Browser: Microsoft Edge',
        );
        expect(
            screen.getByRole('link', {
                name: 'Learn more about managing site data in Microsoft Edge',
            }),
        ).toHaveAttribute(
            'href',
            'https://support.microsoft.com/en-us/edge/manage-cookies-in-microsoft-edge-view-allow-block-delete-and-use',
        );
        expect(
            screen.getByRole('link', {
                name: 'Learn more about installed apps in Microsoft Edge',
            }),
        ).toHaveAttribute(
            'href',
            'https://learn.microsoft.com/en-us/microsoft-edge/progressive-web-apps/ux#managing-pwas',
        );
    });

    it('should show browser data-management instructions even without persistence', () => {
        setBrowser('Mozilla/5.0 Firefox/150.0');
        renderSection();

        expect(screen.getByText(/Browser:/)).toHaveTextContent('Browser: Firefox');
        expect(
            screen.getByRole('link', {
                name: 'Learn more about managing site data in Firefox',
            }),
        ).toBeInTheDocument();
    });

    it.each([
        [
            'NAVER Whale',
            'Mozilla/5.0 Chrome/150.0.0.0 Whale/4.0.0.0 Safari/537.36',
            'https://help.whale.naver.com/en/desktop/tips/clearhistory/',
        ],
        [
            'QQ Browser',
            'Mozilla/5.0 Chrome/116.0.0.0 Safari/537.36 QQBrowser/19.0.0.0',
            'https://privacy.tencent.com/document/priview/2491347092a64d7fa00cbc2bf68fbbbb?addressbar=hide',
        ],
        [
            'UC Browser',
            'Mozilla/5.0 Chrome/123.0.0.0 UCBrowser/15.2.0.1396 Mobile Safari/537.36',
            'https://img.ucweb.com/s/uae/g/3o/ucwebptc/suit_bu1_uc202007241608_71682_04.html',
        ],
        [
            'Huawei Browser',
            'Mozilla/5.0 Chrome/114.0.0.0 Mobile Safari/537.36 HuaweiBrowser/14.0.0.0',
            'https://consumer.huawei.com/uk/support/content/en-gb00706921/',
        ],
        [
            'Mi Browser',
            'Mozilla/5.0 Chrome/120.0.0.0 Mobile Safari/537.36 XiaoMi/MiuiBrowser/18.0.0',
            'https://trust.mi.com/docs/miui-privacy-white-paper-global/3/3',
        ],
        [
            'Vivo Browser',
            'Mozilla/5.0 Chrome/120.0.0.0 Mobile Safari/537.36 VivoBrowser/20.0.0.0',
            'https://h5.vivo.com.cn/browser/privacyPolicy/index.html',
        ],
        [
            'HeyTap Browser',
            'Mozilla/5.0 Chrome/115.0.0.0 Mobile Safari/537.36 HeyTapBrowser/40.10.6.0',
            'https://muc.heytap.com/document/heytap/oversea/privacyPolicy/privacyPolicy_en-US.html?target=_blank',
        ],
        [
            'Cốc Cốc',
            'Mozilla/5.0 Chrome/125.0.0.0 Safari/537.36 coc_coc_browser/125.0.0',
            'https://blog.coccoc.com/cache-la-gi-cach-xoa-cache-tren-trinh-duyet-web-coc-coc/',
        ],
        [
            'Ecosia Browser',
            'Mozilla/5.0 Chrome/144.0.0.0 Mobile Safari/537.36 (Ecosia android@144.0.0.0)',
            'https://support.ecosia.org/article/629-troubleshooting-guide',
        ],
        [
            'Maxthon',
            'Mozilla/5.0 Maxthon/7.5.2 Chrome/151.0.0.0 Safari/537.48',
            'https://www.maxthon.com/en/feature/data-cleaning/',
        ],
    ])('should show verified storage help for %s', (browser, userAgent, href) => {
        setBrowser(userAgent);
        renderSection();

        expect(screen.getByText(/Browser:/)).toHaveTextContent(`Browser: ${browser}`);
        expect(
            screen.getByRole('link', {
                name: `Learn more about managing site data in ${browser}`,
            }),
        ).toHaveAttribute('href', href);
    });

    it('should show GNOME Web storage and web-app removal guidance for WebKitGTK', () => {
        setStandalone(true);
        setBrowser(
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15',
        );
        renderSection();

        expect(screen.getByText(/Browser:/)).toHaveTextContent(
            'Browser: GNOME Web / WebKitGTK',
        );
        expect(
            screen.getByRole('link', {
                name: 'Learn more about managing site data in GNOME Web / WebKitGTK',
            }),
        ).toHaveAttribute(
            'href',
            'https://help.gnome.org/epiphany/data-personal-data.html',
        );
        expect(
            screen.getByRole('link', {
                name: 'Learn more about installed apps in GNOME Web / WebKitGTK',
            }),
        ).toHaveAttribute(
            'href',
            'https://help.gnome.org/epiphany/browse-webapps-del.html',
        );
    });

    it('should show generic PWA uninstall guidance for Chromium-derived regional browsers', () => {
        setStandalone(true);
        setBrowser(
            'Mozilla/5.0 Chrome/150.0.0.0 Whale/4.0.0.0 Safari/537.36',
        );
        renderSection();

        expect(
            screen.getByRole('link', {
                name: 'Learn more about installed apps in NAVER Whale',
            }),
        ).toHaveAttribute(
            'href',
            'https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Installing#uninstalling',
        );
    });

    it('should enable the typesetter cache action for BusyTeX preload data', async () => {
        mockedListReclaimableDatabases.mockResolvedValue([
            { name: 'EM_PRELOAD_CACHE', kind: 'typesetter-cache' },
        ]);
        renderSection();

        expect(
            await screen.findByRole('button', { name: 'Clear Typesetter cache' }),
        ).toBeEnabled();
    });

    it('should enable the typesetter cache action for current-project cache files', async () => {
        mockedHasProjectTypesetterCache.mockResolvedValue(true);
        renderSection();

        expect(
            await screen.findByRole('button', { name: 'Clear Typesetter cache' }),
        ).toBeEnabled();
    });

    it('should enable the typesetter cache action for Typst package cache', async () => {
        mockedHasTypstPackageCache.mockResolvedValue(true);
        renderSection();

        expect(
            await screen.findByRole('button', { name: 'Clear Typesetter cache' }),
        ).toBeEnabled();
    });



    it('should separate detailed browser storage categories in the legend', async () => {
        mockedUseStorageQuota.mockReturnValue(
            buildState({
                usageBytes: 7 * 1024,
                quotaBytes: 100 * 1024,
                availableBytes: 93 * 1024,
                segments: [
                    { id: 'indexedDB', label: 'Projects and documents', bytes: 6 * 1024 },
                    { id: 'caches', label: 'Offline app cache', bytes: 1024 },
                ],
            }),
        );
        mockedEstimateDetailedStorageUsage.mockResolvedValue([
            { id: 'projects-documents', bytes: 3 * 1024 },
            { id: 'typesetter-cache', bytes: 2 * 1024 },
            { id: 'leftover-projects', bytes: 1024 },
            { id: 'app-data', bytes: 823.0946953858277 },
            { id: 'offline-cache', bytes: 512 },
            { id: 'storage-overhead', bytes: 256 },
        ]);

        renderSection();

        expect(await screen.findByText(/Projects and documents 3.0 KB/)).toBeInTheDocument();
        expect(screen.getByText(/Typesetter cache 2.0 KB/)).toBeInTheDocument();
        expect(screen.getByText(/Leftover project data 1.0 KB/)).toBeInTheDocument();
        expect(screen.getByText(/Account and app data 823 bytes/)).toBeInTheDocument();
        expect(screen.getByText(/Offline app cache 512 bytes/)).toBeInTheDocument();
        expect(screen.getByText(/Browser storage overhead 256 bytes/)).toBeInTheDocument();
        expect(screen.queryByText(/Projects and documents 6.0 KB/)).not.toBeInTheDocument();
    });
    it('should clear IndexedDB, project, and Typst typesetter caches', async () => {
        mockedListReclaimableDatabases.mockResolvedValue([
            { name: 'EM_PRELOAD_CACHE', kind: 'typesetter-cache' },
            { name: 'EM_FS_/texlyre/', kind: 'typesetter-cache' },
        ]);
        mockedHasProjectTypesetterCache.mockResolvedValue(true);
        mockedHasTypstPackageCache.mockResolvedValue(true);
        renderSection();

        const clearTypesetterCacheButton = screen.getByRole('button', {
            name: 'Clear Typesetter cache',
        });

        await waitFor(() => {
            expect(clearTypesetterCacheButton).toBeEnabled();
        });

        fireEvent.click(clearTypesetterCacheButton);

        const confirmButton = await screen.findByRole('button', {
            name: 'Clear',
        });

        fireEvent.click(confirmButton);

        await waitFor(() =>
            expect(mockedDeleteDatabases).toHaveBeenCalledWith([
                'EM_PRELOAD_CACHE',
                'EM_FS_/texlyre/',
            ]),
        );
        expect(mockedDeleteProjectTypesetterCaches).toHaveBeenCalledTimes(1);
        expect(mockedDeleteTypstPackageCache).toHaveBeenCalledTimes(1);
    });
});
