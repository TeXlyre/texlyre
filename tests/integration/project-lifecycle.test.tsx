import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ProjectApp from '@src/components/app/ProjectApp';

describe.skip('Project Lifecycle', () => {
    beforeEach(() => {
        localStorage.clear();
        sessionStorage.clear();
    });

    it('should create and delete a project', async () => {
        const user = userEvent.setup();
        const onOpenProject = jest.fn();
        const onLogout = jest.fn();

        render(<ProjectApp onOpenProject={onOpenProject} onLogout={onLogout} />);

        await waitFor(() => {
            expect(screen.getByText(/all projects/i)).toBeInTheDocument();
        });

        const newProjectBtn = screen.getByTitle('New Project');
        await user.click(newProjectBtn);

        await waitFor(() => {
            expect(screen.getByLabelText(/project name/i)).toBeInTheDocument();
        });

        await user.type(screen.getByLabelText(/project name/i), 'Test Project');
        await user.type(screen.getByLabelText(/description/i), 'Test description');

        await user.click(screen.getByRole('button', { name: /create project/i }));

        await waitFor(() => {
            expect(screen.getByText('Test Project')).toBeInTheDocument();
        }, { timeout: 5000 });

        const projectCard = screen.getByText('Test Project').closest('.project-card');
        const deleteBtn = projectCard?.querySelector('[title="Delete Project"]');

        if (deleteBtn) {
            await user.click(deleteBtn as HTMLElement);
        }

        await waitFor(() => {
            expect(screen.getByText(/are you sure/i)).toBeInTheDocument();
        });

        await user.click(screen.getByRole('button', { name: /delete project/i }));

        await waitFor(() => {
            expect(screen.queryByText('Test Project')).not.toBeInTheDocument();
        });
    });

    it('should search and filter projects', async () => {
        const user = userEvent.setup();

        render(<ProjectApp onOpenProject={jest.fn()} onLogout={jest.fn()} />);

        await waitFor(() => {
            expect(screen.getByPlaceholderText(/search projects/i)).toBeInTheDocument();
        });

        const searchInput = screen.getByPlaceholderText(/search projects/i);
        await user.type(searchInput, 'nonexistent');

        await waitFor(() => {
            expect(screen.getByText(/no projects found/i)).toBeInTheDocument();
        });
    });
});