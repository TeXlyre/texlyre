const files = new Map<string, any>();
let currentProject = 'project-1';
const mockFileStore = {
	getCurrentProjectId: () => currentProject,
	getFileByPath: jest.fn(async (path: string) => files.get(path)),
	getFilesByPath: jest.fn(async (prefix: string) =>
		[...files.values()].filter(
			(file) => file.path.startsWith(prefix) && file.type === 'file',
		),
	),
	storeFile: jest.fn(async (file: any) => {
		files.set(file.path, file);
		return file.id;
	}),
	deleteFileByPath: jest.fn(async (path: string) => {
		files.delete(path);
	}),
};
jest.mock('@src/services/FileStoreService', () => ({
	fileStoreService: mockFileStore,
}));

import {
	AGENT_CHATS_DIR,
	agentChatStore,
	chatTitle,
} from '@src/services/AgentChatStore';
import type { AgentChat } from '@src/types/agentSession';

const chat = (id: string, updatedAt: number): AgentChat => ({
	version: 1,
	id,
	agentId: 'claude',
	sessionId: 's',
	title: `Chat ${id}`,
	createdAt: 1,
	updatedAt,
	entries: [{ id: 'e', kind: 'user', text: `Question ${id}` }],
});

describe('agentChatStore', () => {
	beforeEach(() => {
		files.clear();
		currentProject = 'project-1';
		jest.clearAllMocks();
	});

	it('stores chats as JSON in its own folder, kept out of sync', async () => {
		await expect(agentChatStore.save(chat('a', 5), 'project-1')).resolves.toBe(
			true,
		);

		expect(files.get(AGENT_CHATS_DIR)).toMatchObject({
			type: 'directory',
			excludeFromSync: true,
		});
		const file = files.get(`${AGENT_CHATS_DIR}/a.json`);
		expect(file).toMatchObject({ type: 'file', excludeFromSync: true });
		expect(AGENT_CHATS_DIR.startsWith('/.texlyre_cache')).toBe(false);
		await expect(agentChatStore.load('a')).resolves.toEqual(chat('a', 5));
	});

	it('keeps the file id when a chat is saved again', async () => {
		await agentChatStore.save(chat('a', 5), 'project-1');
		const firstId = files.get(`${AGENT_CHATS_DIR}/a.json`).id;
		await agentChatStore.save(chat('a', 6), 'project-1');
		expect(files.get(`${AGENT_CHATS_DIR}/a.json`).id).toBe(firstId);
	});

	it('drops a save that lands after the project changed', async () => {
		currentProject = 'project-2';
		await expect(agentChatStore.save(chat('a', 5), 'project-1')).resolves.toBe(
			false,
		);
		expect(mockFileStore.storeFile).not.toHaveBeenCalled();
	});

	it('lists readable chats, newest first', async () => {
		await agentChatStore.save(chat('old', 1), 'project-1');
		await agentChatStore.save(chat('new', 9), 'project-1');
		files.set(`${AGENT_CHATS_DIR}/broken.json`, {
			path: `${AGENT_CHATS_DIR}/broken.json`,
			type: 'file',
			content: '{not json',
		});

		const list = await agentChatStore.list();

		expect(list.map((summary) => summary.id)).toEqual(['new', 'old']);
		expect(list[0]).toEqual({
			id: 'new',
			agentId: 'claude',
			title: 'Chat new',
			updatedAt: 9,
		});
	});

	it('removes chats', async () => {
		await agentChatStore.save(chat('a', 5), 'project-1');
		await agentChatStore.remove('a');
		await expect(agentChatStore.load('a')).resolves.toBeNull();
	});
});

describe('chatTitle', () => {
	it('uses the first message, shortened to one line', () => {
		expect(
			chatTitle([
				{ id: '1', kind: 'agent', text: 'Hi' },
				{ id: '2', kind: 'user', text: 'Fix the\nbibliography' },
			]),
		).toBe('Fix the bibliography');
		expect(
			chatTitle([{ id: '1', kind: 'user', text: 'x'.repeat(100) }]),
		).toHaveLength(60);
	});
});
