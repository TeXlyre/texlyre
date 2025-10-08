import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ProjectForm from '@src/components/project/ProjectForm';

describe('ProjectForm Component', () => {
    const mockHandlers = {
        onSubmit: jest.fn(),
        onCancel: jest.fn(),
    };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should render create form', () => {
        render(<ProjectForm {...mockHandlers} />);

        expect(screen.getByLabelText(/project name/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/description/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/typesetter type/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /create project/i })).toBeInTheDocument();
    });

    it('should submit form with valid data', async () => {
        const user = userEvent.setup();
        render(<ProjectForm {...mockHandlers} />);

        const nameInput = screen.getByLabelText(/project name/i);
        const descInput = screen.getByLabelText(/description/i);
        const typeSelect = screen.getByLabelText(/typesetter type/i);

        await user.type(nameInput, 'New Project');
        await user.type(descInput, 'Project description');
        await user.selectOptions(typeSelect, 'latex');

        const submitButton = screen.getByRole('button', { name: /create project/i });
        await user.click(submitButton);

        await waitFor(() => {
            expect(mockHandlers.onSubmit).toHaveBeenCalledWith({
                name: 'New Project',
                description: 'Project description',
                type: 'latex',
                tags: [],
                isFavorite: false,
            });
        });
    });

    it('should show error for empty name', async () => {
        const user = userEvent.setup();
        render(<ProjectForm {...mockHandlers} />);

        const submitButton = screen.getByRole('button', { name: /create project/i });
        await user.click(submitButton);

        expect(mockHandlers.onSubmit).not.toHaveBeenCalled();
    });

    it('should handle cancel', async () => {
        const user = userEvent.setup();
        render(<ProjectForm {...mockHandlers} />);

        const cancelButton = screen.getByRole('button', { name: /cancel/i });
        await user.click(cancelButton);

        expect(mockHandlers.onCancel).toHaveBeenCalled();
    });

    it('should add and remove tags', async () => {
        const user = userEvent.setup();
        render(<ProjectForm {...mockHandlers} />);

        const tagInput = screen.getByPlaceholderText(/add tags/i);
        const addButton = screen.getByRole('button', { name: /add/i });

        await user.type(tagInput, 'test-tag');
        await user.click(addButton);

        await waitFor(() => {
            expect(screen.getByText('test-tag')).toBeInTheDocument();
        });

        const removeButton = screen.getByText('×');
        await user.click(removeButton);

        await waitFor(() => {
            expect(screen.queryByText('test-tag')).not.toBeInTheDocument();
        });
    });

    it('should populate form in edit mode', () => {
        const mockProject = {
            id: '1',
            name: 'Existing Project',
            description: 'Existing description',
            type: 'typst' as const,
            tags: ['tag1', 'tag2'],
            docUrl: 'yjs:test',
            createdAt: Date.now(),
            updatedAt: Date.now(),
            ownerId: 'user-1',
            isFavorite: true,
        };

        render(<ProjectForm {...mockHandlers} project={mockProject} />);

        expect(screen.getByDisplayValue('Existing Project')).toBeInTheDocument();
        expect(screen.getByDisplayValue('Existing description')).toBeInTheDocument();
        expect(screen.getByText('tag1')).toBeInTheDocument();
        expect(screen.getByText('tag2')).toBeInTheDocument();
    });

    it('should disable fields in simple mode', () => {
        render(<ProjectForm {...mockHandlers} simpleMode={true} />);

        expect(screen.queryByLabelText(/tags/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/add to favorites/i)).not.toBeInTheDocument();
    });
});