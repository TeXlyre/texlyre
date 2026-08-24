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
});
