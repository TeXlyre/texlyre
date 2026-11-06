import type {
	ClientTransport,
	TransportPayload,
} from '@src/chelys/types/transport';
import type { ACPServerConfig } from '@src/types/acp';

jest.mock('@src/services/CollabService', () => ({ collabService: {} }));
jest.mock('@src/services/FileStoreService', () => ({ fileStoreService: {} }));

const mockOpenTransport = jest.fn();
jest.mock('@src/chelys/peer/TransportFactory', () => ({
	openTransport: (...args: unknown[]) => mockOpenTransport(...args),
}));
jest.mock('@src/chelys/peer/TransportResolution', () => ({
	resolveTransportConfig: async (_id: string, config: unknown) => config,
}));

type ServiceModule = typeof import('@src/services/GenericACPService');

interface FakeAgent {
	transport: ClientTransport;
	sent: Array<Record<string, any>>;
	emit: (payload: TransportPayload) => void;
	reply: (id: number, result: unknown) => void;
	close: () => void;
}

const createFakeAgent = (): FakeAgent => {
	const messageHandlers = new Set<(payload: TransportPayload) => void>();
	const closeHandlers = new Set<() => void>();
	const sent: Array<Record<string, any>> = [];
	let open = true;

	const transport: ClientTransport = {
		get isOpen() {
			return open;
		},
		send: (payload) => {
			const text = String(payload);
			expect(text.endsWith('\n')).toBe(true);
			sent.push(JSON.parse(text));
		},
		close: () => {
			if (!open) return;
			open = false;
			for (const handler of closeHandlers) handler();
		},
		onMessage: (handler) => {
			messageHandlers.add(handler);
			return () => messageHandlers.delete(handler);
		},
		onClose: (handler) => {
			closeHandlers.add(handler);
			return () => closeHandlers.delete(handler);
		},
		onError: () => () => undefined,
	};

	const emit = (payload: TransportPayload) => {
		for (const handler of messageHandlers) handler(payload);
	};

	return {
		transport,
		sent,
		emit,
		reply: (id, result) => emit(JSON.stringify({ jsonrpc: '2.0', id, result })),
		close: () => transport.close(),
	};
};

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const CONFIG: ACPServerConfig = {
	id: 'agent',
	name: 'Agent',
	enabled: true,
	transportConfig: { type: 'websocket', url: 'ws://localhost:7060' },
};

describe('GenericACPService', () => {
	let module: ServiceModule;
	let service: InstanceType<ServiceModule['GenericACPService']>;
	let agent: FakeAgent;
	const fileSystem = {
		listFiles: jest.fn(),
		readTextFile: jest.fn(),
		writeTextFile: jest.fn(),
		editTextFile: jest.fn(),
	};

	const startSession = async (
		sessionResult: Record<string, unknown> = { sessionId: 'session-1' },
	): Promise<string> => {
		const sessionPromise = service.newSession('agent');
		await flush();
		agent.reply(1, { protocolVersion: 1, agentInfo: { name: 'fake', version: '0' } });
		await flush();
		agent.reply(2, sessionResult);
		return sessionPromise;
	};

	const agentRequest = async (id: number, method: string, params: unknown) => {
		agent.emit(JSON.stringify({ jsonrpc: '2.0', id, method, params }));
		await flush();
		await flush();
		return agent.sent.find((message) => message.id === id && !message.method);
	};

	beforeEach(async () => {
		jest.resetModules();
		module = await import('@src/services/GenericACPService');
		service = new module.GenericACPService();
		agent = createFakeAgent();
		mockOpenTransport.mockReset().mockResolvedValue(agent.transport);
		fileSystem.readTextFile.mockReset();
		fileSystem.writeTextFile.mockReset().mockResolvedValue(undefined);
		service.setFileSystem(fileSystem);
		service.registerConfig(CONFIG);
	});

	it('initializes with fs capabilities and opens a session at the default cwd', async () => {
		await expect(startSession()).resolves.toBe('session-1');

		expect(agent.sent[0]).toMatchObject({
			id: 1,
			method: 'initialize',
			params: {
				protocolVersion: 1,
				clientCapabilities: {
					fs: { readTextFile: true, writeTextFile: true },
					terminal: false,
				},
			},
		});
		expect(agent.sent[1]).toMatchObject({
			id: 2,
			method: 'session/new',
			params: { cwd: '/texlyre', mcpServers: [] },
		});
		expect(service.getAgentInfo('agent')?.agentInfo?.name).toBe('fake');
	});

	it('passes recipe sessionMeta through as _meta on session/new', async () => {
		service.updateConfig('agent', {
			...CONFIG,
			sessionMeta: '{"claudeCode":{"options":{"tools":[]}}}',
		});

		await startSession();

		expect(agent.sent[1].params._meta).toEqual({
			claudeCode: { options: { tools: [] } },
		});
	});

	it('maps fs paths beneath the cwd a bridge reports for the session', async () => {
		await startSession({
			sessionId: 'session-1',
			_meta: { texlyre: { cwd: '/home/me/.chelys/workspace' } },
		});
		fileSystem.readTextFile.mockResolvedValue('x');

		const response = await agentRequest(20, 'fs/read_text_file', {
			sessionId: 'session-1',
			path: '/home/me/.chelys/workspace/main.tex',
		});

		expect(fileSystem.readTextFile).toHaveBeenCalledWith('/main.tex');
		expect(response?.result).toEqual({ content: 'x' });
	});

	it('resumes a session with session/load at the cwd the bridge reports', async () => {
		const loading = service.loadSession('agent', 'old-session');
		await flush();
		agent.reply(1, { protocolVersion: 1, agentCapabilities: { loadSession: true } });
		await flush();
		expect(agent.sent[1]).toMatchObject({
			id: 2,
			method: 'session/load',
			params: { sessionId: 'old-session', cwd: '/texlyre', mcpServers: [] },
		});
		agent.reply(2, { _meta: { texlyre: { cwd: '/srv/workspace' } } });
		await loading;
		fileSystem.readTextFile.mockResolvedValue('x');

		const response = await agentRequest(20, 'fs/read_text_file', {
			sessionId: 'old-session',
			path: '/srv/workspace/main.tex',
		});

		expect(fileSystem.readTextFile).toHaveBeenCalledWith('/main.tex');
		expect(response?.result).toEqual({ content: 'x' });
	});

	it('does not ask agents without loadSession to resume', async () => {
		const loading = service.loadSession('agent', 'old-session');
		await flush();
		agent.reply(1, { protocolVersion: 1 });

		await expect(loading).rejects.toThrow('cannot resume');
		expect(agent.sent.map((message) => message.method)).toEqual(['initialize']);
	});

	it('serves tunnelled MCP requests from the project tools', async () => {
		await startSession();
		fileSystem.editTextFile.mockResolvedValue(undefined);

		const response = await agentRequest(21, '_texlyre/mcp', {
			message: {
				jsonrpc: '2.0',
				id: 5,
				method: 'tools/call',
				params: {
					name: 'edit_file',
					arguments: { path: '/main.tex', oldText: 'Hello', newText: 'Hi' },
				},
			},
		});

		expect(fileSystem.editTextFile).toHaveBeenCalledWith('/main.tex', 'Hello', 'Hi');
		expect(response?.result).toEqual({
			message: {
				jsonrpc: '2.0',
				id: 5,
				result: { content: [{ type: 'text', text: 'Edited /main.tex.' }] },
			},
		});

		const notification = await agentRequest(22, '_texlyre/mcp', {
			message: { jsonrpc: '2.0', method: 'notifications/initialized' },
		});
		expect(notification?.result).toEqual({ message: null });
	});

	it('rejects agents speaking another protocol version', async () => {
		const connecting = service.connect('agent');
		await flush();
		agent.reply(1, { protocolVersion: 2 });
		await expect(connecting).rejects.toThrow('ACP v2');
	});

	it('serves fs/read_text_file from project paths with line slicing', async () => {
		await startSession();
		fileSystem.readTextFile.mockResolvedValue('a\nb\nc\nd');

		const response = await agentRequest(10, 'fs/read_text_file', {
			sessionId: 'session-1',
			path: '/texlyre/chapters/intro.tex',
			line: 2,
			limit: 2,
		});

		expect(fileSystem.readTextFile).toHaveBeenCalledWith('/chapters/intro.tex');
		expect(response).toEqual({ jsonrpc: '2.0', id: 10, result: { content: 'b\nc' } });
	});

	it('refuses paths outside the session cwd', async () => {
		await startSession();

		const response = await agentRequest(11, 'fs/read_text_file', {
			sessionId: 'session-1',
			path: '/texlyre/../etc/passwd',
		});

		expect(fileSystem.readTextFile).not.toHaveBeenCalled();
		expect(response?.error.code).toBe(-32602);
	});

	it('refuses file access for unknown sessions', async () => {
		await startSession();

		const response = await agentRequest(12, 'fs/write_text_file', {
			sessionId: 'other',
			path: '/texlyre/main.tex',
			content: 'x',
		});

		expect(fileSystem.writeTextFile).not.toHaveBeenCalled();
		expect(response?.error.message).toBe('Unknown session');
	});

	it('writes files through the file system adapter', async () => {
		await startSession();

		const response = await agentRequest(13, 'fs/write_text_file', {
			sessionId: 'session-1',
			path: '/texlyre/main.tex',
			content: '\\documentclass{article}',
		});

		expect(fileSystem.writeTextFile).toHaveBeenCalledWith(
			'/main.tex',
			'\\documentclass{article}',
		);
		expect(response).toEqual({ jsonrpc: '2.0', id: 13, result: null });
	});

	it('cancels permission requests unless a handler is installed', async () => {
		await startSession();
		const request = {
			sessionId: 'session-1',
			toolCall: { toolCallId: 'call-1', title: 'Edit main.tex' },
			options: [{ optionId: 'ok', name: 'Allow', kind: 'allow_once' }],
		};

		const denied = await agentRequest(14, 'session/request_permission', request);
		expect(denied?.result).toEqual({ outcome: { outcome: 'cancelled' } });

		service.setPermissionHandler(async () => ({
			outcome: 'selected',
			optionId: 'ok',
		}));
		const allowed = await agentRequest(15, 'session/request_permission', request);
		expect(allowed?.result).toEqual({
			outcome: { outcome: 'selected', optionId: 'ok' },
		});
	});

	it('answers unimplemented client methods with method-not-found', async () => {
		await startSession();

		const response = await agentRequest(16, 'terminal/create', {
			sessionId: 'session-1',
			command: 'rm',
		});

		expect(response?.error.code).toBe(-32601);
	});

	it('fans out session updates and reassembles split or batched frames', async () => {
		await startSession();
		const listener = jest.fn();
		service.onSessionUpdate(listener);

		const update = (text: string) =>
			JSON.stringify({
				jsonrpc: '2.0',
				method: 'session/update',
				params: {
					sessionId: 'session-1',
					update: {
						sessionUpdate: 'agent_message_chunk',
						content: { type: 'text', text },
					},
				},
			});

		const first = `${update('one')}\n`;
		agent.emit(first.slice(0, 20));
		agent.emit(first.slice(20) + `${update('two')}\n${update('three')}`);

		expect(listener.mock.calls.map(([, n]) => n.update.content.text)).toEqual([
			'one',
			'two',
			'three',
		]);
	});

	it('sends prompts and cancel notifications for known sessions', async () => {
		const sessionId = await startSession();

		const prompting = service.prompt('agent', sessionId, [
			{ type: 'text', text: 'Fix the introduction' },
		]);
		service.cancel('agent', sessionId);
		agent.reply(3, { stopReason: 'cancelled' });

		await expect(prompting).resolves.toEqual({ stopReason: 'cancelled' });
		expect(agent.sent[2]).toMatchObject({ id: 3, method: 'session/prompt' });
		expect(agent.sent[3]).toEqual({
			jsonrpc: '2.0',
			method: 'session/cancel',
			params: { sessionId },
		});
		expect(() => service.cancel('agent', 'nope')).toThrow('Unknown session');
	});

	it('rejects in-flight requests when the transport closes', async () => {
		const sessionId = await startSession();
		const prompting = service.prompt('agent', sessionId, [
			{ type: 'text', text: 'hello' },
		]);

		agent.close();

		await expect(prompting).rejects.toThrow('Agent connection closed');
		expect(service.getConnectionStatus('agent')).toBe('disconnected');
	});
});

describe('ACP path helpers', () => {
	let module: ServiceModule;

	beforeAll(async () => {
		module = await import('@src/services/GenericACPService');
	});

	it('maps agent paths beneath a custom cwd', () => {
		expect(module.toProjectPath('/home/me/paper/', '/home/me/paper/a/b.tex')).toBe(
			'/a/b.tex',
		);
		expect(() => module.toProjectPath('/home/me/paper', '/home/me/paperx/a')).toThrow();
		expect(() => module.toProjectPath('/home/me/paper', '/home/me/paper/a//b')).toThrow();
	});

	it('slices 1-based line ranges', () => {
		expect(module.sliceLines('a\nb\nc', 3)).toBe('c');
		expect(module.sliceLines('a\nb\nc', null, 1)).toBe('a');
		expect(module.sliceLines('a\nb\nc')).toBe('a\nb\nc');
	});
});
