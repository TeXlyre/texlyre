import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import SharedToolsModal from '@src/components/collab/SharedToolsModal';
import type { SharedByMeTool, SharedToolOffer } from '@src/types/sharedTools';

const offer = (overrides: Partial<SharedToolOffer> = {}): SharedToolOffer => ({
	identity: 'typesetter:alice:sile',
	kind: 'typesetter',
	ownerId: 'alice',
	ownerName: 'Alice',
	toolId: 'sile',
	name: 'SILE',
	revision: 'r1',
	config: {
		id: 'sile',
		name: 'SILE',
		enabled: true,
		projectType: 'sile',
		inputExtensions: ['sil'],
		outputFormats: [],
		transportConfig: { type: 'webrtc', roomId: 'shared-sile' },
		capabilities: {},
	},
	advertiserId: 'alice',
	advertiserName: 'Alice',
	conflict: { kind: 'none' },
	status: 'new',
	...overrides,
});

const sharedByMe: SharedByMeTool[] = [
	{
		kind: 'typesetter',
		config: offer().config,
		shareable: true,
		sharedWithAll: true,
		usedByProject: false,
		scope: 'all',
	},
];

describe('SharedToolsModal', () => {
	const handlers = {
		onClose: jest.fn(),
		onProjectShareChange: jest.fn(),
		onAccept: jest.fn(),
		onIgnore: jest.fn(),
	};

	beforeEach(() => {
		jest.clearAllMocks();
	});

	it('shows collaborator offers and accepts or ignores them', async () => {
		const user = userEvent.setup();
		const pending = offer();

		render(
			<SharedToolsModal
				isOpen={true}
				offers={[pending]}
				sharedByMe={sharedByMe}
				projectShareEnabled={false}
				{...handlers}
			/>,
		);

		expect(screen.getByText(/Alice/)).toBeInTheDocument();
		expect(screen.getByText('All collaborators')).toBeInTheDocument();

		await user.click(screen.getByRole('button', { name: 'Use' }));
		expect(handlers.onAccept).toHaveBeenCalledWith(pending);

		await user.click(screen.getByRole('button', { name: 'Ignore' }));
		expect(handlers.onIgnore).toHaveBeenCalledWith(pending);
	});

	it('uses conflict-specific actions instead of silently overwriting a local tool', () => {
		render(
			<SharedToolsModal
				isOpen={true}
				offers={[
					offer({
						conflict: { kind: 'same-id-different-config', localId: 'sile' },
					}),
				]}
				sharedByMe={[]}
				projectShareEnabled={false}
				{...handlers}
			/>,
		);

		expect(
			screen.getByRole('button', { name: 'Replace mine' }),
		).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Keep mine' })).toBeInTheDocument();
	});

	it('changes project tool sharing from the collaboration UI', async () => {
		const user = userEvent.setup();
		render(
			<SharedToolsModal
				isOpen={true}
				offers={[]}
				sharedByMe={[]}
				projectShareEnabled={false}
				{...handlers}
			/>,
		);

		await user.click(
			screen.getByRole('checkbox', {
				name: 'Share tools used in this project',
			}),
		);
		expect(handlers.onProjectShareChange).toHaveBeenCalledWith(true);
	});

	it('shares agents one by one and says whose computer an offered agent runs on', async () => {
		const user = userEvent.setup();
		const onAgentShareChange = jest.fn();
		const agentConfig = {
			id: 'claude',
			name: 'Claude Agent',
			enabled: true,
			transportConfig: { type: 'webrtc' as const, roomId: 'claude-room' },
		};
		render(
			<SharedToolsModal
				isOpen={true}
				offers={[
					offer({
						identity: 'agent:alice:claude',
						kind: 'agent',
						toolId: 'claude',
						name: 'Claude Agent',
						config: agentConfig,
					}),
				]}
				sharedByMe={[]}
				projectShareEnabled={true}
				agents={[
					{
						kind: 'agent',
						config: agentConfig,
						shareable: true,
						sharedWithAll: false,
						usedByProject: false,
						sharedInProject: false,
					},
					{
						kind: 'agent',
						config: {
							...agentConfig,
							id: 'local',
							name: 'Local Agent',
							transportConfig: { type: 'websocket', url: 'ws://localhost:7060' },
						},
						shareable: false,
						shareMessage: 'The server URL resolves only on this machine.',
						sharedWithAll: false,
						usedByProject: false,
						sharedInProject: false,
					},
				]}
				onAgentShareChange={onAgentShareChange}
				{...handlers}
			/>,
		);

		expect(
			screen.getByText("Runs on Alice's computer with their account, while they share it."),
		).toBeInTheDocument();

		// Sharing the project's tools doesn't share an agent.
		const claude = screen.getByRole('checkbox', {
			name: 'Share Claude Agent in this project',
		});
		expect(claude).not.toBeChecked();
		await user.click(claude);
		expect(onAgentShareChange).toHaveBeenCalledWith('claude', true);

		expect(
			screen.getByRole('checkbox', { name: 'Share Local Agent in this project' }),
		).toBeDisabled();
		expect(
			screen.getByText('The server URL resolves only on this machine.'),
		).toBeInTheDocument();
	});
});
