import { renderHook, waitFor } from '@testing-library/react';
import { useStorageQuota } from '@src/hooks/useStorageQuota';
import { storageQuotaService } from '@src/services/StorageQuotaService';
import { useSettings } from '@src/hooks/useSettings';

jest.mock('@src/hooks/useSettings', () => ({
    useSettings: jest.fn(),
}));

const mockedUseSettings = useSettings as jest.MockedFunction<typeof useSettings>;

describe('useStorageQuota', () => {
    const setSettings = (settings: Record<string, unknown>) => {
        mockedUseSettings.mockReturnValue({
            getSetting: (id: string) =>
                id in settings ? { value: settings[id] } : undefined,
        } as unknown as ReturnType<typeof useSettings>);
    };

    const setStatus = (usageBytes: number, quotaBytes: number) => {
        jest.spyOn(storageQuotaService, 'getStatus').mockReturnValue({
            isSupported: true,
            isPersisted: false,
            usageBytes,
            quotaBytes,
            availableBytes: quotaBytes - usageBytes,
            usedRatio: quotaBytes > 0 ? usageBytes / quotaBytes : 0,
            segments: [],
            updatedAt: Date.now(),
        });
    };

    beforeEach(() => {
        jest.restoreAllMocks();
        jest.spyOn(storageQuotaService, 'refresh').mockResolvedValue(
            storageQuotaService.getStatus(),
        );
        setSettings({});
    });

    it('should refresh once on mount and unsubscribe on unmount', async () => {
        const unsubscribe = jest.fn();
        const addStatusListener = jest
            .spyOn(storageQuotaService, 'addStatusListener')
            .mockReturnValue(unsubscribe);

        const { unmount } = renderHook(() => useStorageQuota());

        await waitFor(() => {
            expect(storageQuotaService.refresh).toHaveBeenCalled();
        });
        expect(addStatusListener).toHaveBeenCalled();

        unmount();
        expect(unsubscribe).toHaveBeenCalled();
    });

    it('should not report low storage with plenty of headroom', () => {
        setStatus(1024 * 1024 * 1024, 20 * 1024 * 1024 * 1024);

        const { result } = renderHook(() => useStorageQuota());

        expect(result.current.isLow).toBe(false);
    });

    it('should report low storage above the percentage threshold', () => {
        setStatus(19 * 1024 * 1024 * 1024, 20 * 1024 * 1024 * 1024);
        setSettings({ 'storage-warning-threshold': 85 });

        const { result } = renderHook(() => useStorageQuota());

        expect(result.current.isLow).toBe(true);
    });

    it('should report low storage below the free space floor', () => {
        setStatus(1024 * 1024 * 1024, 1024 * 1024 * 1024 + 1024 * 1024);
        setSettings({ 'storage-warning-threshold': 99, 'storage-minimum-free': 200 });

        const { result } = renderHook(() => useStorageQuota());

        expect(result.current.isLow).toBe(true);
    });

    it('should never report low storage when the browser reports no quota', () => {
        setStatus(0, 0);

        const { result } = renderHook(() => useStorageQuota());

        expect(result.current.isLow).toBe(false);
    });

    it('should expose the banner preference', () => {
        setSettings({ 'storage-hide-banner': true });

        const { result } = renderHook(() => useStorageQuota());

        expect(result.current.hideBanner).toBe(true);
    });
});
