import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FileExplorer from '@src/components/editor/FileExplorer';
import { FileTreeProvider } from '@src/contexts/FileTreeContext';

const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <FileTreeProvider docUrl="yjs:test-project">
        {children}
    </FileTreeProvider>
);

describe('File Operations', () => {
    const mockOnFileSelect = jest.fn();
    const mockOnCreateDocument = jest.fn(() => 'doc-123');

    beforeEach(() => {
        jest.clearAllMocks();
        sessionStorage.clear();
    });

    it('should create and rename a file', async () => {
        const user = userEvent.setup();

        render(
            <FileExplorer
                onFileSelect={mockOnFileSelect}
                onCreateDocument={mockOnCreateDocument}
                documents={[]}
                projectType="latex"
            />,
            { wrapper: TestWrapper }
        );

        const newFileBtn = screen.getByTitle('New File');
        await user.click(newFileBtn);

        const input = await screen.findByRole('textbox');
        await user.clear(input);
        await user.type(input, 'test.tex');
        await user.keyboard('{Enter}');

        await waitFor(() => {
            expect(screen.getByText('test.tex')).toBeInTheDocument();
        });

        const fileNode = screen.getByText('test.tex').closest('.file-node');
        const moreBtn = fileNode?.querySelector('[title="Options"]');

        if (moreBtn) {
            await user.click(moreBtn as HTMLElement);
        }

        const renameBtn = await screen.findByText('Rename');
        await user.click(renameBtn);

        const renameInput = await screen.findByRole('textbox');
        await user.clear(renameInput);
        await user.type(renameInput, 'renamed.tex');
        await user.keyboard('{Enter}');

        await waitFor(() => {
            expect(screen.getByText('renamed.tex')).toBeInTheDocument();
            expect(screen.queryByText('test.tex')).not.toBeInTheDocument();
        });
    });

    it('should create nested directories', async () => {
        const user = userEvent.setup();

        render(
            <FileExplorer
                onFileSelect={mockOnFileSelect}
                onCreateDocument={mockOnCreateDocument}
                documents={[]}
            />,
            { wrapper: TestWrapper }
        );

        const newFolderBtn = screen.getByTitle('New Folder');
        await user.click(newFolderBtn);

        const input = await screen.findByRole('textbox');
        await user.type(input, 'chapters');
        await user.keyboard('{Enter}');

        await waitFor(() => {
            expect(screen.getByText('chapters')).toBeInTheDocument();
        });
    });
});