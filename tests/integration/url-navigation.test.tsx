import { render, waitFor } from '@testing-library/react';
import AppRouter from '@src/components/app/AppRouter';

describe('URL Navigation', () => {
    beforeEach(() => {
        window.location.hash = '';
        localStorage.clear();
        sessionStorage.clear();
    });

    it('should handle project URL hash', async () => {
        window.location.hash = 'yjs:test-project-123';

        render(<AppRouter />);

        await waitFor(() => {
            expect(window.location.hash).toContain('yjs:test-project-123');
        }, { timeout: 3000 });
    });

    it('should handle document navigation', async () => {
        window.location.hash = 'yjs:test-project&docId:doc-456';

        render(<AppRouter />);

        await waitFor(() => {
            expect(window.location.hash).toContain('docId:doc-456');
        });
    });

    it('should handle file path navigation', async () => {
        window.location.hash = 'yjs:test-project&filePath:%2Fmain.tex';

        render(<AppRouter />);

        await waitFor(() => {
            expect(window.location.hash).toContain('filePath');
        });
    });

    it('should handle privacy policy modal', async () => {
        window.location.hash = 'privacy-policy';

        const { container } = render(<AppRouter />);

        await waitFor(() => {
            expect(container.querySelector('.modal')).toBeInTheDocument();
        });
    });
});