type StorageQuotaModule = typeof import('@src/services/QuotaService');

describe('QuotaService', () => {
    let module: StorageQuotaModule;
    let estimate: jest.Mock;
    let persisted: jest.Mock;
    let persist: jest.Mock;

    const loadModule = async (storage?: unknown) => {
        Object.defineProperty(global.navigator, 'storage', {
            value: storage,
            configurable: true,
        });

        jest.resetModules();
        module = await import('@src/services/QuotaService');
    };

    beforeEach(async () => {
        estimate = jest.fn().mockResolvedValue({
            usage: 400,
            quota: 1000,
            usageDetails: { indexedDB: 300, caches: 80, fileSystem: 20 },
        });
        persisted = jest.fn().mockResolvedValue(false);
        persist = jest.fn().mockResolvedValue(true);

        await loadModule({ estimate, persisted, persist });
    });

    describe('refresh', () => {
        it('should map the browser estimate onto the status', async () => {
            const status = await module.quotaService.refresh();

            expect(status.isSupported).toBe(true);
            expect(status.usageBytes).toBe(400);
            expect(status.quotaBytes).toBe(1000);
            expect(status.availableBytes).toBe(600);
            expect(status.usedRatio).toBeCloseTo(0.4);
        });

        it('should group unknown usage details into a single segment', async () => {
            const { segments } = await module.quotaService.refresh();

            expect(segments.map((segment) => segment.id)).toEqual([
                'indexedDB',
                'caches',
                'other',
            ]);
            expect(segments[2].bytes).toBe(20);
        });

        it('should omit segments when the browser reports no breakdown', async () => {
            estimate.mockResolvedValue({ usage: 10, quota: 100 });

            const { segments } = await module.quotaService.refresh(true);

            expect(segments).toEqual([]);
        });

        it('should reuse the cached snapshot until it expires', async () => {
            await module.quotaService.refresh();
            await module.quotaService.refresh();

            expect(estimate).toHaveBeenCalledTimes(1);
        });

        it('should read again when forced', async () => {
            await module.quotaService.refresh();
            await module.quotaService.refresh(true);

            expect(estimate).toHaveBeenCalledTimes(2);
        });

        it('should share a single read across concurrent callers', async () => {
            await Promise.all([
                module.quotaService.refresh(),
                module.quotaService.refresh(),
            ]);

            expect(estimate).toHaveBeenCalledTimes(1);
        });

        it('should keep the previous status when the estimate fails', async () => {
            await module.quotaService.refresh();
            estimate.mockRejectedValue(new Error('unavailable'));

            const status = await module.quotaService.refresh(true);

            expect(status.usageBytes).toBe(400);
        });

        it('should notify listeners', async () => {
            const listener = jest.fn();
            const unsubscribe =
                module.quotaService.addStatusListener(listener);

            await module.quotaService.refresh();
            unsubscribe();
            await module.quotaService.refresh(true);

            expect(listener).toHaveBeenCalledTimes(1);
        });
    });

    describe('unsupported browsers', () => {
        beforeEach(async () => {
            await loadModule(undefined);
        });

        it('should report itself as unsupported', () => {
            expect(module.quotaService.getStatus().isSupported).toBe(false);
        });

        it('should not block writes', async () => {
            await expect(
                module.quotaService.ensureSpace(1024),
            ).resolves.toBeUndefined();
        });
    });

    describe('ensureSpace', () => {
        it('should resolve when the requested space is available', async () => {
            await expect(
                module.quotaService.ensureSpace(100),
            ).resolves.toBeUndefined();
        });

        it('should throw when the requested space exceeds what is left', async () => {
            await expect(module.quotaService.ensureSpace(900)).rejects.toThrow(
                module.StorageQuotaError,
            );
        });

        it('should ignore empty writes without reading the estimate', async () => {
            await module.quotaService.ensureSpace(0);

            expect(estimate).not.toHaveBeenCalled();
        });

        it('should skip the estimate when the cached headroom is comfortable', async () => {
            await module.quotaService.refresh();
            estimate.mockClear();

            await module.quotaService.ensureSpace(10);

            expect(estimate).not.toHaveBeenCalled();
        });

        it('should verify against a fresh estimate before refusing', async () => {
            await module.quotaService.refresh();
            estimate.mockResolvedValue({ usage: 100, quota: 1000 });

            await expect(
                module.quotaService.ensureSpace(700),
            ).resolves.toBeUndefined();
        });

        it('should allow writes when the browser reports no quota', async () => {
            estimate.mockResolvedValue({ usage: 0, quota: 0 });

            await expect(
                module.quotaService.ensureSpace(900),
            ).resolves.toBeUndefined();
        });
    });

    describe('requestPersistence', () => {
        it('should update the status when persistence is granted', async () => {
            await expect(
                module.quotaService.requestPersistence(),
            ).resolves.toBe(true);
            expect(module.quotaService.getStatus().isPersisted).toBe(true);
        });

        it('should report a denied request', async () => {
            persist.mockResolvedValue(false);

            await expect(
                module.quotaService.requestPersistence(),
            ).resolves.toBe(false);
        });

        it('should report a failed request', async () => {
            persist.mockRejectedValue(new Error('denied'));

            await expect(
                module.quotaService.requestPersistence(),
            ).resolves.toBe(false);
        });
    });

    describe('isQuotaExceededError', () => {
        it('should detect the standard error name', () => {
            expect(
                module.isQuotaExceededError({ name: 'QuotaExceededError' }),
            ).toBe(true);
        });

        it('should detect the legacy exception code', () => {
            expect(module.isQuotaExceededError({ code: 22 })).toBe(true);
        });

        it('should detect the Gecko error name', () => {
            expect(
                module.isQuotaExceededError({ name: 'NS_ERROR_DOM_QUOTA_REACHED' }),
            ).toBe(true);
        });

        it('should detect a wrapped cause', () => {
            expect(
                module.isQuotaExceededError({
                    name: 'AbortError',
                    cause: { name: 'QuotaExceededError' },
                }),
            ).toBe(true);
        });

        it('should ignore unrelated errors', () => {
            expect(module.isQuotaExceededError(new Error('nope'))).toBe(false);
            expect(module.isQuotaExceededError(null)).toBe(false);
        });
    });
});
