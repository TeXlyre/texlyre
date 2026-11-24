import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import ProjectPanelSections from '@src/components/project/ProjectPanelSections';
import type { StorageDashboardProject } from '@src/types/storage';

jest.mock('@src/components/common/ResizablePanel', () => ({
    __esModule: true,
    default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    ResizablePanelGroup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

const remoteProject = (
    name: string,
    updatedAt: number,
    remoteOnly: boolean,
): StorageDashboardProject => ({
    providerId: 'provider',
    storageProjectId: name,
    localProjectId: name,
    name,
    description: '',
    type: 'latex',
    createdAt: 1,
    updatedAt,
    tags: [],
    isFavorite: false,
    status: 'stored',
    remoteOnly,
});

const renderPanel = () =>
    render(
        <ProjectPanelSections
            favoriteProjects={[]}
            recentProjects={[]}
            externalProjects={[
                remoteProject('Zulu', 10, true),
                remoteProject('Alpha', 20, false),
            ]}
            localProjects={[]}
            providerNames={{ provider: 'Test' }}
            ownedProviderIds={new Set()}
            busyRemoteIds={new Set()}
            storageLoading={false}
            onRefreshRemote={jest.fn()}
            onOpenLocal={jest.fn()}
            onReconnectRemote={jest.fn()}
            onRestoreMultiple={jest.fn()}
            onDisconnectRemote={jest.fn()}
            onRemoveRemote={jest.fn()}
            sectionSizes={{ favorites: 30, recent: 35, external: 35 }}
            favoritesCollapsed={false}
            recentCollapsed={false}
            externalCollapsed={false}
            onSizesChangeEnd={jest.fn()}
            onToggleFavorites={jest.fn()}
            onToggleRecent={jest.fn()}
            onToggleExternal={jest.fn()}
            onRestoreExternalProject={jest.fn()}
        />,
    );

describe('Remote Projects options menu', () => {
    it('uses the shared popover rather than inserting filter controls into the panel', async () => {
        const user = userEvent.setup();
        const { container } = renderPanel();
        const trigger = screen.getByRole('button', { name: 'Remote project options' });

        expect(screen.queryByRole('combobox', { name: 'Show remote projects' })).not.toBeInTheDocument();
        await user.click(trigger);

        const show = screen.getByRole('combobox', { name: 'Show remote projects' });
        expect(show.closest('.ui-options-dropdown')).toBeInTheDocument();
        expect(container.querySelector('.project-panel-remote-options')).toBeNull();
        expect(trigger).toHaveAttribute('aria-expanded', 'true');

        await user.selectOptions(show, 'remote');
        expect(screen.getByText('Zulu')).toBeInTheDocument();
        expect(screen.queryByText('Alpha')).not.toBeInTheDocument();

        await user.keyboard('{Escape}');
        expect(trigger).toHaveAttribute('aria-expanded', 'false');
    });

    it('sorts by the selected field and direction using the same controls as Files', async () => {
        const user = userEvent.setup();
        const { container } = renderPanel();
        await user.click(screen.getByRole('button', { name: 'Remote project options' }));

        const sort = screen.getByRole('combobox', { name: 'Sort remote projects by' });
        const rows = () => Array.from(container.querySelectorAll('.project-panel-remote-item strong')).map((node) => node.textContent);
        expect(rows()).toEqual(['Alpha', 'Zulu']); // Newest first

        await user.selectOptions(sort, 'name');
        expect(rows()).toEqual(['Zulu', 'Alpha']); // Descending
        await user.click(screen.getByRole('button', { name: 'Descending' }));
        expect(rows()).toEqual(['Alpha', 'Zulu']); // Ascending
        expect(within(sort.closest('.ui-options-dropdown') as HTMLElement).getByText('Sort')).toBeInTheDocument();
    });
});
