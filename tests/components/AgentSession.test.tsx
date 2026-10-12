import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { ACPServerConfig } from '@src/types/acp';

const mockService = {
	permissionHandler: null as null | ((configId: string, request: any) => Promise<any>),
	updateListener: null as null | ((configId: string, notification: any) => void),
	setPermissionHandler: jest.fn((handler) => {
		mockService.permissionHandler = handler;
	}),
	setFileSystem: jest.fn(),
	onSessionUpdate: jest.fn((listener) => {
		mockService.updateListener = listener;
		return () => undefined;
	}),
	onStatusChange: jest.fn(() => () => undefined),
	connect: jest.fn(async () => ({ protocolVersion: 1 })),
	newSession: jest.fn(async () => 'session-1'),
	prompt: jest.fn(),
	cancel: jest.fn(),
	disconnect: jest.fn(),
};
jest.mock('@src/services/GenericACPService', () => ({
	genericACPService: mockService,
}));

jest.mock('@src/services/ProjectFileSystem', () => {
	const actual = jest.requireActual('@src/services/ProjectFileSystem');
	return {
		...actual,
		YjsProjectFileSystem: jest.fn().mockImplementation(() => ({
			readTextFile: async (path: string) =>
				path === '/main.tex' ? 'Hello world.\n' : Promise.reject(new Error('missing')),
		})),
	};
});

let mockAgents: ACPServerConfig[] = [];
jest.mock('@src/hooks/useACPConfig', () => ({
	useACPConfig: () => ({ configs: mockAgents }),
}));
jest.mock('@src/hooks/useEditor', () => ({
	useEditor: () => ({ getCollabOptions: () => null }),
}));
jest.mock('@src/hooks/useAuth', () => ({ useAuth: () => ({ user: null }) }));
jest.mock('@src/hooks/useChat', () => ({
	useChat: () => ({ messages: [], isConnected: true, sendMessage: jest.fn() }),
}));
jest.mock('@src/hooks/useOffline', () => ({
	useOffline: () => ({ isCollabOfflineMode: false }),
}));

import AgentPanel from '@src/components/agent/AgentPanel';
import AgentPermissionModal from '@src/components/agent/AgentPermissionModal';
import ChatPanel from '@src/components/chat/ChatPanel';
import { AgentSessionProvider } from '@src/contexts/AgentSessionContext';

const AGENT: ACPServerConfig = {
	id: 'claude',
	name: 'Claude Agent',
	enabled: true,
	transportConfig: { type: 'websocket', url: 'ws://localhost:7060' },
};

// jsdom does not implement scrolling.
beforeAll(() => {
	Element.prototype.scrollIntoView = jest.fn();
});

const renderAgent = () =>
	render(
		<AgentSessionProvider>
			<AgentPanel />
			<AgentPermissionModal />
		</AgentSessionProvider>,
	);

describe('agent session UI', () => {
	beforeEach(() => {
		mockAgents = [AGENT];
		jest.clearAllMocks();
	});

	it('connects on first prompt and streams the reply', async () => {
		let finishPrompt: (value: unknown) => void = () => undefined;
		mockService.prompt.mockImplementation(
			() => new Promise((resolve) => (finishPrompt = resolve)),
		);
		renderAgent();

		await userEvent.type(screen.getByPlaceholderText('Ask the agent...'), 'Fix it{Enter}');

		await waitFor(() =>
			expect(mockService.prompt).toHaveBeenCalledWith('claude', 'session-1', [
				{ type: 'text', text: 'Fix it' },
			]),
		);
		expect(screen.getByText('Fix it')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument();

		act(() => {
			mockService.updateListener?.('claude', {
				sessionId: 'session-1',
				update: {
					sessionUpdate: 'agent_message_chunk',
					content: { type: 'text', text: 'Done.' },
				},
			});
			// Updates for another session are ignored.
			mockService.updateListener?.('claude', {
				sessionId: 'old',
				update: {
					sessionUpdate: 'agent_message_chunk',
					content: { type: 'text', text: 'stale' },
				},
			});
		});
		expect(screen.getByText('Done.')).toBeInTheDocument();
		expect(screen.queryByText('stale')).not.toBeInTheDocument();

		await act(async () => finishPrompt({ stopReason: 'end_turn' }));
		expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument();
	});

	it('shows a diff for proposed edits and returns the chosen option', async () => {
		mockService.prompt.mockImplementation(() => new Promise(() => undefined));
		renderAgent();
		await userEvent.type(screen.getByPlaceholderText('Ask the agent...'), 'Go{Enter}');
		await waitFor(() => expect(mockService.prompt).toHaveBeenCalled());

		let outcome: Promise<any> = Promise.resolve();
		act(() => {
			outcome = mockService.permissionHandler!('claude', {
				sessionId: 'session-1',
				toolCall: {
					toolCallId: 't1',
					title: 'mcp__texlyre__edit_file',
					rawInput: { path: '/main.tex', oldText: 'Hello', newText: 'Hi' },
				},
				options: [
					{ optionId: 'allow', name: 'Allow', kind: 'allow_once' },
					{ optionId: 'reject', name: 'Reject', kind: 'reject_once' },
				],
			});
		});

		expect(await screen.findByText('Agent wants to use edit_file')).toBeInTheDocument();
		expect(await screen.findByText('Changes /main.tex')).toBeInTheDocument();
		expect(screen.getByText('Hello world.')).toBeInTheDocument();
		expect(screen.getByText('Hi world.')).toBeInTheDocument();

		await userEvent.click(screen.getByRole('button', { name: 'Allow' }));
		await expect(outcome).resolves.toEqual({ outcome: 'selected', optionId: 'allow' });
		expect(screen.queryByText('Agent wants to use edit_file')).not.toBeInTheDocument();
	});

	it('refuses permission requests from sessions it does not own', async () => {
		renderAgent();
		await expect(
			mockService.permissionHandler!('claude', {
				sessionId: 'someone-else',
				toolCall: { toolCallId: 't' },
				options: [],
			}),
		).resolves.toEqual({ outcome: 'cancelled' });
	});

	it('disconnects the agent when the project closes', async () => {
		mockService.prompt.mockResolvedValue({ stopReason: 'end_turn' });
		const { unmount } = renderAgent();
		await userEvent.type(screen.getByPlaceholderText('Ask the agent...'), 'Hi{Enter}');
		await waitFor(() => expect(mockService.prompt).toHaveBeenCalled());

		unmount();

		expect(mockService.disconnect).toHaveBeenCalledWith('claude');
		expect(mockService.setPermissionHandler).toHaveBeenLastCalledWith(null);
	});
});

describe('ChatPanel agent tab', () => {
	const renderChat = () =>
		render(
			<AgentSessionProvider>
				<ChatPanel />
			</AgentSessionProvider>,
		);

	it('stays a plain project chat without agents', () => {
		mockAgents = [];
		renderChat();
		expect(screen.getByText('Project Chat')).toBeInTheDocument();
		expect(screen.queryByRole('button', { name: 'Agent' })).not.toBeInTheDocument();
	});

	it('offers an Agent tab when an agent is configured', async () => {
		mockAgents = [AGENT];
		renderChat();

		await userEvent.click(screen.getByRole('button', { name: 'Agent' }));

		expect(screen.getByPlaceholderText('Ask the agent...')).toBeInTheDocument();
		expect(screen.getByText('Claude Agent')).toBeInTheDocument();
	});
});
