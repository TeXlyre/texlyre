// src/services/AgentChatStore.ts
import { nanoid } from 'nanoid';

import { createNamedLogger } from '@/logging';
import type {
	AgentChat,
	AgentChatSummary,
	AgentEntry,
} from '../types/agentSession';
import type { FileNode } from '../types/files';
import { fileStoreService } from './FileStoreService';

const moduleLog = createNamedLogger('AgentChatStore');

// Not under /.texlyre_cache, which clearing the typesetter cache empties.
// Like the other /.texlyre_* folders it is hidden from the agent and skipped
// by collaborator sync, the local folder mirror, and git backup.
export const AGENT_CHATS_DIR = '/.texlyre_chats';

const TITLE_LENGTH = 60;

const chatPath = (id: string): string => `${AGENT_CHATS_DIR}/${id}.json`;

export const chatTitle = (entries: AgentEntry[]): string => {
	const first = entries.find((entry) => entry.kind === 'user');
	const text = first?.kind === 'user' ? first.text.replace(/\s+/g, ' ') : '';
	return text.length > TITLE_LENGTH
		? `${text.slice(0, TITLE_LENGTH - 1)}…`
		: text;
};

const isChat = (value: unknown): value is AgentChat => {
	const chat = value as Partial<AgentChat> | null;
	return (
		chat?.version === 1 &&
		typeof chat.id === 'string' &&
		typeof chat.agentId === 'string' &&
		Array.isArray(chat.entries)
	);
};

const parseChat = (file: FileNode): AgentChat | null => {
	if (typeof file.content !== 'string') return null;
	try {
		const parsed = JSON.parse(file.content);
		return isChat(parsed) ? parsed : null;
	} catch (error) {
		moduleLog.warn(`Ignoring unreadable chat ${file.path}:`, error);
		return null;
	}
};

const ensureDirectory = async (): Promise<void> => {
	const existing = await fileStoreService.getFileByPath(AGENT_CHATS_DIR);
	if (existing?.type === 'directory') return;
	await fileStoreService.storeFile(
		{
			id: existing?.id ?? nanoid(),
			name: AGENT_CHATS_DIR.slice(1),
			path: AGENT_CHATS_DIR,
			type: 'directory',
			lastModified: Date.now(),
			excludeFromSync: true,
		},
		{ showConflictDialog: false },
	);
};

// Chats of the project that is open in fileStoreService. Callers pass the
// project id they started with, so a save that lands after the user switched
// projects is dropped rather than written into the other project.
export const agentChatStore = {
	async list(): Promise<AgentChatSummary[]> {
		const files = await fileStoreService.getFilesByPath(
			`${AGENT_CHATS_DIR}/`,
			false,
			{ fileExtension: '.json', excludeDirectories: true },
		);
		return files
			.map(parseChat)
			.filter((chat): chat is AgentChat => chat !== null)
			.map(({ id, agentId, title, updatedAt }) => ({
				id,
				agentId,
				title,
				updatedAt,
			}))
			.sort((left, right) => right.updatedAt - left.updatedAt);
	},

	async load(id: string): Promise<AgentChat | null> {
		const file = await fileStoreService.getFileByPath(chatPath(id));
		return file ? parseChat(file) : null;
	},

	async save(chat: AgentChat, projectId: string): Promise<boolean> {
		if (fileStoreService.getCurrentProjectId() !== projectId) return false;
		await ensureDirectory();
		const path = chatPath(chat.id);
		const existing = await fileStoreService.getFileByPath(path, true);
		await fileStoreService.storeFile(
			{
				id: existing?.id ?? nanoid(),
				name: `${chat.id}.json`,
				path,
				type: 'file',
				content: JSON.stringify(chat),
				mimeType: 'application/json',
				isBinary: false,
				lastModified: chat.updatedAt,
				excludeFromSync: true,
			},
			{ showConflictDialog: false },
		);
		return true;
	},

	async remove(id: string): Promise<void> {
		await fileStoreService.deleteFileByPath(chatPath(id), {
			showDeleteDialog: false,
			hardDelete: true,
		});
	},
};
