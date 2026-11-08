import type { AgentEntry } from '@src/types/agentSession';
import {
	entriesReducer,
	recordingFileSystem,
} from '@src/utils/agentSessionUtils';

jest.mock('@src/services/CollabService', () => ({ collabService: {} }));
jest.mock('@src/services/FileStoreService', () => ({ fileStoreService: {} }));

const update = (sessionUpdate: string, fields: Record<string, unknown>) => ({
	type: 'update' as const,
	notification: { sessionId: 's', update: { sessionUpdate, ...fields } },
});

const run = (actions: Parameters<typeof entriesReducer>[1][]) =>
	actions.reduce<AgentEntry[]>(entriesReducer, []);

describe('entriesReducer', () => {
	it('merges consecutive message chunks and splits on kind changes', () => {
		const entries = run([
			update('agent_thought_chunk', { content: { type: 'text', text: 'hm' } }),
			update('agent_message_chunk', { content: { type: 'text', text: 'Hel' } }),
			update('agent_message_chunk', { content: { type: 'text', text: 'lo' } }),
			update('agent_message_chunk', { content: { type: 'image', data: '' } }),
		]);

		expect(entries.map(({ kind, ...rest }) => [kind, (rest as { text: string }).text])).toEqual([
			['thought', 'hm'],
			['agent', 'Hello'],
		]);
	});

	it('tracks tool calls through their updates', () => {
		const entries = run([
			update('tool_call', { toolCallId: 't1', title: 'mcp__texlyre__read_file' }),
			update('tool_call_update', { toolCallId: 't1', status: 'completed' }),
			update('tool_call_update', { toolCallId: 'other', status: 'failed' }),
		]);

		expect(entries).toEqual([
			expect.objectContaining({
				kind: 'tool',
				toolCallId: 't1',
				title: 'mcp__texlyre__read_file',
				status: 'completed',
			}),
		]);
	});

	it('keeps only the latest plan', () => {
		const entries = run([
			update('plan', { entries: [{ content: 'a', status: 'pending' }] }),
			update('plan', { entries: [{ content: 'a', status: 'completed' }] }),
		]);

		expect(entries).toEqual([
			expect.objectContaining({
				kind: 'plan',
				items: [{ content: 'a', status: 'completed' }],
			}),
		]);
	});

	it('ignores unknown updates and resets', () => {
		const entries = run([update('available_commands_update', {})]);
		expect(entries).toEqual([]);
		expect(
			entriesReducer(
				[{ id: '1', kind: 'user', text: 'x' }],
				{ type: 'reset' },
			),
		).toEqual([]);
	});
});

describe('recordingFileSystem', () => {
	it('records before and after for edits and writes', async () => {
		const files = new Map([['/a.tex', 'old']]);
		const base = {
			listFiles: jest.fn(),
			readTextFile: async (path: string) => {
				const value = files.get(path);
				if (value === undefined) throw new Error('missing');
				return value;
			},
			writeTextFile: async (path: string, content: string) => {
				files.set(path, content);
			},
			editTextFile: async (path: string, oldText: string, newText: string) => {
				files.set(path, (files.get(path) ?? '').replace(oldText, newText));
			},
		};
		const changes: unknown[] = [];
		const fs = recordingFileSystem(base, (change) => changes.push(change));

		await fs.editTextFile('/a.tex', 'old', 'new');
		await fs.writeTextFile('/b.tex', 'created');

		expect(changes).toEqual([
			{ path: '/a.tex', before: 'old', after: 'new' },
			{ path: '/b.tex', before: null, after: 'created' },
		]);
	});
});
