import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act } from 'react';
import ProjectCard from '@src/components/project/ProjectCard';
import type { Project } from '@src/types/projects';

describe('ProjectCard Component', () => {
    const mockProject: Project = {
        id: 'project-123',
        name: 'Test Project',
        description: 'A test project description',
        type: 'latex',
        docUrl: 'yjs:project-123',
        createdAt: Date.now() - 86400000,
        updatedAt: Date.now(),
        ownerId: 'user-1',
        tags: ['test', 'sample'],
        isFavorite: false,
    };

    const mockHandlers = {
        onOpen: jest.fn(),
        onOpenDefault: jest.fn(),
        onEdit: jest.fn(),
        onDelete: jest.fn(),
        onToggleFavorite: jest.fn(),
    };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should render project information', () => {
        render(<ProjectCard project={mockProject} {...mockHandlers} />);

        expect(screen.getByText('Test Project')).toBeInTheDocument();
        expect(screen.getByText('A test project description')).toBeInTheDocument();
        expect(screen.getByText('test')).toBeInTheDocument();
        expect(screen.getByText('sample')).toBeInTheDocument();
    });

    it('should call onOpenDefault when clicking title', async () => {
        const user = userEvent.setup();
        render(<ProjectCard project={mockProject} {...mockHandlers} />);

        await act(async () => {
            await user.click(screen.getByText('Test Project'));
        });

        expect(mockHandlers.onOpenDefault).toHaveBeenCalledWith(mockProject);
    });

    it('should call onEdit when clicking edit button', async () => {
        const user = userEvent.setup();
        render(<ProjectCard project={mockProject} {...mockHandlers} />);

        const editBtn = screen.getByTitle('Edit Project');

        await act(async () => {
            await user.click(editBtn);
        });

        expect(mockHandlers.onEdit).toHaveBeenCalledWith(mockProject);
    });

    it('should call onDelete when clicking delete button', async () => {
        const user = userEvent.setup();
        render(<ProjectCard project={mockProject} {...mockHandlers} />);

        const deleteBtn = screen.getByTitle('Delete Project');

        await act(async () => {
            await user.click(deleteBtn);
        });

        expect(mockHandlers.onDelete).toHaveBeenCalledWith(mockProject);
    });

    it('should toggle favorite status', async () => {
        const user = userEvent.setup();
        render(<ProjectCard project={mockProject} {...mockHandlers} />);

        const favoriteBtn = screen.getByTitle('Add to favorites');

        await act(async () => {
            await user.click(favoriteBtn);
        });

        expect(mockHandlers.onToggleFavorite).toHaveBeenCalledWith('project-123');
    });

    it('should show favorited state', () => {
        const favoritedProject = { ...mockProject, isFavorite: true };
        render(<ProjectCard project={favoritedProject} {...mockHandlers} />);

        expect(screen.getByTitle('Remove from favorites')).toBeInTheDocument();
    });

    it('should handle selection mode', async () => {
        const user = userEvent.setup();
        const onSelectionChange = jest.fn();

        render(
            <ProjectCard
                project={mockProject}
                {...mockHandlers}
                isSelectionMode={true}
                isSelected={false}
                onSelectionChange={onSelectionChange}
            />
        );

        const checkbox = screen.getByRole('checkbox');

        await act(async () => {
            await user.click(checkbox);
        });

        expect(onSelectionChange).toHaveBeenCalledWith('project-123', true);
    });

    it('should display last opened file info', () => {
        const projectWithLastOpened = {
            ...mockProject,
            lastOpenedFilePath: '/chapters/intro.tex',
        };

        render(<ProjectCard project={projectWithLastOpened} {...mockHandlers} />);

        expect(screen.getByTitle('Last: intro.tex')).toBeInTheDocument();
    });

    it('should handle Typst project type', () => {
        const typstProject = { ...mockProject, type: 'typst' as const };
        render(<ProjectCard project={typstProject} {...mockHandlers} />);

        expect(screen.getByText('Test Project')).toBeInTheDocument();
    });
});