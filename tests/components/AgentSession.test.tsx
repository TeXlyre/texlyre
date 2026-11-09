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
	loadSession: jest.fn(async () => undefined),
	prompt: jest.fn(),
	cancel: jest.fn(),
	disconnect: jest.fn(),
	registerConfig: jest.fn(),
	updateConfig: jest.fn(),
	unregisterConfig: jest.fn(),
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

jest.mock('@src/services/FileStoreService', () => ({
	fileStoreService: { getCurrentProjectId: () => 'project-1' },
}));

const mockChats = new Map<string, any>();
jest.mock('@src/services/AgentChatStore', () => ({
	...jest.requireActual('@src/services/AgentChatStore'),
	agentChatStore: {
		list: jest.fn(async () =>
			[...mockChats.values()].map(({ id, agentId, title, updatedAt }) => ({
				id,
				agentId,
				title,
				updatedAt,
			})),
		),
		load: jest.fn(async (id: string) => mockChats.get(id) ?? null),
		save: jest.fn(async (chat: any) => {
			mockChats.set(chat.id, chat);
			return true;
		}),
		remove: jest.fn(async (id: string) => {
			mockChats.delete(id);
		}),
	},
}));

let mockAgents: ACPServerConfig[] = [];
jest.mock('@src/hooks/useACPConfig', () => ({
	useACPConfig: () => ({ configs: mockAgents }),
}));
jest.mock('@src/hooks/useEditor', () => ({
	useEditor: () => ({ getCollabOptions: () => null }),
}));
jest.mock('@src/hooks/useFileTree', () => ({
	useFileTree: () => ({ isLoading: false }),
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
import AgentSidePanel from '@src/components/agent/AgentSidePanel';
import ChatPanel from '@src/components/chat/ChatPanel';
import { AgentSessionProvider } from '@src/contexts/AgentSessionContext';
import { PropertiesProvider } from '@src/contexts/PropertiesContext';
import { SharedToolsContext } from '@src/contexts/SharedToolsContext';
import { editorFocusService } from '@src/services/EditorFocusService';

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
		expect(screen.getByText('Fix it', { selector: '.agent-entry' })).toBeInTheDocument();
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

describe('editor context', () => {
	const MAIN_TEX = {
		kind: 'file' as const,
		fileId: 'file-1',
		path: '/chapters/intro.tex',
		binary: false,
	};
	const moveCursor = (detail: Record<string, unknown>) =>
		act(() => {
			document.dispatchEvent(
				new CustomEvent('editor-cursor-update', { detail }),
			);
		});

	beforeEach(() => {
		mockAgents = [AGENT];
		jest.clearAllMocks();
		mockService.prompt.mockResolvedValue({ stopReason: 'end_turn' });
	});

	afterEach(() => {
		act(() => editorFocusService.setFocus(null));
	});

	it('tells the agent which file is open and where the cursor is', async () => {
		act(() => editorFocusService.setFocus(MAIN_TEX));
		renderAgent();
		moveCursor({ line: 12, fileId: 'file-1', isEditingFile: true });
		// Another editor (e.g. a viewer for a different file) doesn't count.
		moveCursor({ line: 99, fileId: 'file-2', isEditingFile: true });

		const chip = screen.getByRole('button', { name: 'intro.tex:12' });
		expect(chip).toHaveAttribute('aria-pressed', 'true');

		await userEvent.type(screen.getByPlaceholderText('Ask the agent...'), 'Fix this{Enter}');

		await waitFor(() =>
			expect(mockService.prompt).toHaveBeenCalledWith('claude', 'session-1', [
				{
					type: 'text',
					text: '<editor_context>\nThe user has /chapters/intro.tex open in the TeXlyre editor, with the cursor on line 12.\n</editor_context>',
				},
				{ type: 'text', text: 'Fix this' },
			]),
		);
		expect(
			screen.getByText('intro.tex:12', { selector: '.agent-entry-context' }),
		).toBeInTheDocument();
	});

	it('leaves the open file out when the chip is turned off', async () => {
		act(() => editorFocusService.setFocus(MAIN_TEX));
		renderAgent();
		moveCursor({
			line: 8,
			selection: { fromLine: 3, toLine: 8 },
			fileId: 'file-1',
			isEditingFile: true,
		});

		const chip = screen.getByRole('button', { name: 'intro.tex:3-8' });
		await userEvent.click(chip);
		expect(chip).toHaveAttribute('aria-pressed', 'false');

		await userEvent.type(screen.getByPlaceholderText('Ask the agent...'), 'Hi{Enter}');

		await waitFor(() =>
			expect(mockService.prompt).toHaveBeenCalledWith('claude', 'session-1', [
				{ type: 'text', text: 'Hi' },
			]),
		);
		expect(document.querySelector('.agent-entry-context')).toBeNull();
	});

	it('shows no chip when nothing is open', () => {
		renderAgent();
		expect(document.querySelector('.agent-context-chip')).toBeNull();
	});
});

describe('shared agents', () => {
	const SHARED = {
		identity: 'agent:alice:claude',
		ownerId: 'alice',
		ownerName: 'Alice',
		config: {
			id: 'shared-agent:agent:alice:claude',
			name: 'Claude Agent',
			enabled: true,
			transportConfig: { type: 'webrtc' as const, roomId: 'claude-room' },
		},
	};
	const withShared = (sharedAgents: (typeof SHARED)[]) => (
		<SharedToolsContext.Provider value={{ sharedAgents } as any}>
			<AgentSessionProvider>
				<AgentPanel />
			</AgentSessionProvider>
		</SharedToolsContext.Provider>
	);

	beforeEach(() => {
		mockAgents = [AGENT];
		jest.clearAllMocks();
		mockService.prompt.mockResolvedValue({ stopReason: 'end_turn' });
	});

	it("lists a collaborator's agent with its owner and ends its session when they stop sharing", async () => {
		const { rerender } = render(withShared([SHARED]));
		expect(mockService.registerConfig).toHaveBeenCalledWith(SHARED.config);

		const picker = screen.getByRole('combobox', { name: 'Agent' });
		expect(
			screen.getByRole('option', { name: 'Claude Agent (shared by Alice)' }),
		).toBeInTheDocument();
		await userEvent.selectOptions(picker, SHARED.config.id);
		expect(
			screen.getByText(
				"Alice shares this agent. It runs on their Chelys host and remains available while that host is online.",
			),
		).toBeInTheDocument();

		// The prompt is still running when the owner stops sharing; the
		// disconnect then rejects it.
		let failPrompt: (error: Error) => void = () => undefined;
		mockService.prompt.mockImplementation(
			() => new Promise((_, reject) => (failPrompt = reject)),
		);
		mockService.disconnect.mockImplementation(() =>
			failPrompt(new Error('Agent disconnected')),
		);
		await userEvent.type(screen.getByPlaceholderText('Ask the agent...'), 'Hi{Enter}');
		await waitFor(() =>
			expect(mockService.prompt).toHaveBeenCalledWith(
				SHARED.config.id,
				'session-1',
				[{ type: 'text', text: 'Hi' }],
			),
		);

		rerender(withShared([]));
		await act(async () => undefined);

		expect(mockService.unregisterConfig).toHaveBeenCalledWith(SHARED.config.id);
		expect(
			screen.getByText('Alice stopped sharing Claude Agent, so its session has ended.'),
		).toBeInTheDocument();
		// Ending it on purpose isn't reported as a failure.
		expect(screen.queryByText('Agent disconnected')).not.toBeInTheDocument();
		expect(document.querySelector('.ui-status-dot')).toHaveAttribute(
			'title',
			'disconnected',
		);
		// The chat stays open to read.
		expect(screen.getByText('Hi', { selector: '.agent-entry' })).toBeInTheDocument();
		expect(
			screen.queryByRole('option', { name: 'Claude Agent (shared by Alice)' }),
		).not.toBeInTheDocument();
		mockService.disconnect.mockImplementation(() => undefined);
	});
});

describe('saved agent chats', () => {
	const SAVED = {
		version: 1,
		id: 'chat-1',
		agentId: 'claude',
		sessionId: 'old-session',
		title: 'Earlier question',
		createdAt: 1,
		updatedAt: 2,
		entries: [
			{ id: 'e1', kind: 'user', text: 'Earlier question' },
			{ id: 'e2', kind: 'agent', text: 'Earlier answer' },
		],
	};
	const chatPicker = () => screen.getByRole('combobox', { name: 'Chats' });

	beforeEach(() => {
		mockAgents = [AGENT];
		mockChats.clear();
		jest.clearAllMocks();
		mockService.prompt.mockResolvedValue({ stopReason: 'end_turn' });
		mockService.loadSession.mockResolvedValue(undefined);
	});

	it('saves a chat with its session and lists it', async () => {
		renderAgent();
		await userEvent.type(screen.getByPlaceholderText('Ask the agent...'), 'Fix it{Enter}');

		await waitFor(() => expect(mockChats.size).toBe(1), { timeout: 3000 });
		const [saved] = mockChats.values();
		expect(saved).toMatchObject({
			agentId: 'claude',
			sessionId: 'session-1',
			title: 'Fix it',
		});
		expect(saved.entries[0]).toMatchObject({ kind: 'user', text: 'Fix it' });
		expect(chatPicker()).toHaveValue(saved.id);
	});

	it('reopens a saved chat and resumes its session', async () => {
		mockChats.set(SAVED.id, SAVED);
		renderAgent();
		await waitFor(() =>
			expect(screen.getByRole('option', { name: /Earlier question/ })).toBeInTheDocument(),
		);

		await userEvent.selectOptions(chatPicker(), 'chat-1');
		expect(await screen.findByText('Earlier answer')).toBeInTheDocument();

		await userEvent.type(screen.getByPlaceholderText('Ask the agent...'), 'More{Enter}');

		await waitFor(() =>
			expect(mockService.prompt).toHaveBeenCalledWith('claude', 'old-session', [
				{ type: 'text', text: 'More' },
			]),
		);
		expect(mockService.loadSession).toHaveBeenCalledWith('claude', 'old-session');
		expect(mockService.newSession).not.toHaveBeenCalled();
	});

	it('starts a new agent session when the old one cannot be resumed', async () => {
		mockChats.set(SAVED.id, SAVED);
		mockService.loadSession.mockRejectedValue(new Error('gone'));
		renderAgent();
		await waitFor(() =>
			expect(screen.getByRole('option', { name: /Earlier question/ })).toBeInTheDocument(),
		);
		await userEvent.selectOptions(chatPicker(), 'chat-1');

		await userEvent.type(screen.getByPlaceholderText('Ask the agent...'), 'More{Enter}');

		await waitFor(() =>
			expect(mockService.prompt).toHaveBeenCalledWith('claude', 'session-1', [
				{ type: 'text', text: 'More' },
			]),
		);
		expect(
			screen.getByText(
				'The agent could not resume this chat, so it starts without the earlier messages.',
			),
		).toBeInTheDocument();
		await waitFor(() => expect(mockChats.get('chat-1').sessionId).toBe('session-1'), {
			timeout: 3000,
		});
	});

	it('deletes the open chat after a second click', async () => {
		mockChats.set(SAVED.id, SAVED);
		renderAgent();
		await waitFor(() =>
			expect(screen.getByRole('option', { name: /Earlier question/ })).toBeInTheDocument(),
		);
		await userEvent.selectOptions(chatPicker(), 'chat-1');

		await userEvent.click(screen.getByRole('button', { name: 'Delete this chat' }));
		expect(mockChats.has('chat-1')).toBe(true);
		await userEvent.click(screen.getByRole('button', { name: 'Confirm delete' }));

		await waitFor(() => expect(mockChats.has('chat-1')).toBe(false));
		expect(screen.queryByText('Earlier answer')).not.toBeInTheDocument();
		expect(chatPicker()).toHaveValue('');
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

describe('agent side panel', () => {
	beforeEach(() => {
		mockAgents = [AGENT];
		localStorage.clear();
	});

	it('moves the agent between the chat panel and a docked side panel', async () => {
		const { container } = render(
			<PropertiesProvider>
				<AgentSessionProvider>
					<AgentSidePanel />
					<ChatPanel />
				</AgentSessionProvider>
			</PropertiesProvider>,
		);
		const sidePanel = () => container.querySelector('.agent-side-panel');

		await userEvent.click(screen.getByRole('button', { name: 'Agent' }));
		await userEvent.click(screen.getByRole('button', { name: 'Open in side panel' }));

		expect(sidePanel()).toBeInTheDocument();
		expect(screen.getAllByPlaceholderText('Ask the agent...')).toHaveLength(1);
		expect(screen.queryByRole('button', { name: 'Agent' })).not.toBeInTheDocument();
		expect(localStorage.getItem('texlyre-properties')).toContain(
			'"agent-panel-docked:global":true',
		);

		await userEvent.click(screen.getByRole('button', { name: 'Move to chat panel' }));

		expect(sidePanel()).not.toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Agent' })).toHaveClass('active');
		expect(screen.getAllByPlaceholderText('Ask the agent...')).toHaveLength(1);
	});
});
