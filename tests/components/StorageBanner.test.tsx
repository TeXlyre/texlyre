import { render, screen } from '@testing-library/react';
import StorageBanner from '@src/components/common/StorageBanner';
import { useStorageQuota } from '@src/hooks/useStorageQuota';

jest.mock('@src/hooks/useStorageQuota', () => ({
    useStorageQuota: jest.fn(),
}));

const mockedUseStorageQuota = useStorageQuota as jest.MockedFunction<
    typeof useStorageQuota
>;

describe('StorageBanner Component', () => {
    const buildState = (overrides: Record<string, unknown> = {}) =>
        ({
            isSupported: true,
            isPersisted: false,
            usageBytes: 900,
            quotaBytes: 1000,
            availableBytes: 100 * 1024 * 1024,
            usedRatio: 0.9,
            segments: [],
            updatedAt: Date.now(),
            isLow: true,
            hideBanner: false,
            refresh: jest.fn(),
            requestPersistence: jest.fn(),
            ...overrides,
        }) as unknown as ReturnType<typeof useStorageQuota>;

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should warn when storage is low', () => {
        mockedUseStorageQuota.mockReturnValue(buildState());

        render(<StorageBanner />);

        expect(screen.getByText('Browser storage is almost full')).toBeInTheDocument();
        expect(screen.getByText(/100.0 MB left/)).toBeInTheDocument();
    });

    it('should render nothing when storage is not low', () => {
        mockedUseStorageQuota.mockReturnValue(buildState({ isLow: false }));

        const { container } = render(<StorageBanner />);

        expect(container).toBeEmptyDOMElement();
    });

    it('should render nothing when the banner is hidden by settings', () => {
        mockedUseStorageQuota.mockReturnValue(buildState({ hideBanner: true }));

        const { container } = render(<StorageBanner />);

        expect(container).toBeEmptyDOMElement();
    });

    it('should report an exhausted quota without a size', () => {
        mockedUseStorageQuota.mockReturnValue(buildState({ availableBytes: 0 }));

        render(<StorageBanner />);

        expect(
            screen.getByText('No space left. Saving files and compiling will fail.'),
        ).toBeInTheDocument();
    });
});
