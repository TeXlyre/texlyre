// src/utils/agentSessionUtils.ts
import { nanoid } from 'nanoid';

import type { ProjectFileSystem } from '../services/ProjectFileSystem';
import type { ACPSessionNotification } from '../types/acp';
import type { AgentEntry, AgentFileChange } from '../types/agentSession';

// The fields of session/update payloads the transcript reads; the rest pass
// through untouched.
interface SessionUpdateFields {
	sessionUpdate: string;
	content?: { type?: string; text?: unknown };
	toolCallId?: unknown;
	title?: unknown;
	status?: unknown;
	entries?: Array<Record<string, unknown>>;
}

export type EntryAction =
	| { type: 'reset' }
	| { type: 'load'; entries: AgentEntry[] }
	| { type: 'add'; entry: AgentEntry }
	| { type: 'update'; notification: ACPSessionNotification };

const appendText = (
	entries: AgentEntry[],
	kind: 'agent' | 'thought',
	text: string,
): AgentEntry[] => {
	const last = entries[entries.length - 1];
	if (last?.kind === kind) {
		return [...entries.slice(0, -1), { ...last, text: last.text + text }];
	}
	return [...entries, { id: nanoid(), kind, text }];
};

export const entriesReducer = (
	entries: AgentEntry[],
	action: EntryAction,
): AgentEntry[] => {
	if (action.type === 'reset') return [];
	if (action.type === 'load') return action.entries;
	if (action.type === 'add') return [...entries, action.entry];

	const update = action.notification.update as SessionUpdateFields;
	switch (update.sessionUpdate) {
		case 'agent_message_chunk':
		case 'agent_thought_chunk': {
			if (update.content?.type !== 'text') return entries;
			return appendText(
				entries,
				update.sessionUpdate === 'agent_message_chunk' ? 'agent' : 'thought',
				String(update.content.text ?? ''),
			);
		}
		case 'tool_call':
			return [
				...entries,
				{
					id: nanoid(),
					kind: 'tool',
					toolCallId: String(update.toolCallId),
					title: String(update.title ?? update.toolCallId),
					status: String(update.status ?? 'pending'),
				},
			];
		case 'tool_call_update':
			return entries.map((entry) =>
				entry.kind === 'tool' && entry.toolCallId === update.toolCallId
					? {
							...entry,
							...(update.title ? { title: String(update.title) } : {}),
							...(update.status ? { status: String(update.status) } : {}),
						}
					: entry,
			);
		case 'plan': {
			const items = Array.isArray(update.entries)
				? update.entries.map((item) => ({
						content: String(item.content ?? ''),
						status: String(item.status ?? 'pending'),
					}))
				: [];
			const others = entries.filter((entry) => entry.kind !== 'plan');
			return [...others, { id: nanoid(), kind: 'plan', items }];
		}
		default:
			return entries;
	}
};

// Wraps the project file system so every agent write is recorded with the
// content before and after, for the change log in the panel.
export const recordingFileSystem = (
	base: ProjectFileSystem,
	onChange: (change: AgentFileChange) => void,
): ProjectFileSystem => ({
	listFiles: () => base.listFiles(),
	readTextFile: (path) => base.readTextFile(path),
	writeTextFile: async (path, content) => {
		const before = await base.readTextFile(path).catch(() => null);
		await base.writeTextFile(path, content);
		onChange({ path, before, after: content });
	},
	editTextFile: async (path, oldText, newText) => {
		const before = await base.readTextFile(path);
		await base.editTextFile(path, oldText, newText);
		const after = await base.readTextFile(path).catch(() => before);
		onChange({ path, before, after });
	},
});
