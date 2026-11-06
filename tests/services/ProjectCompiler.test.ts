const mockParseLog = jest.fn();
jest.mock('@src/plugins/PluginRegistry', () => ({
	pluginRegistry: {
		getLoggerForType: (type: string) =>
			type === 'latex' ? { parseLog: mockParseLog } : null,
	},
}));

import { compileResultService } from '@src/services/CompileResultService';
import type { QueuedCompileRequest } from '@src/types/compilation';
import { DocumentEventCompiler } from '@src/services/ProjectCompiler';
import {
	formatCompileReport,
	ProjectMCPServer,
} from '@src/services/ProjectMCPServer';

describe('DocumentEventCompiler', () => {
	let triggers: number;
	let onTrigger: () => void;
	let requests: Array<QueuedCompileRequest | null>;
	const handler = (event: CustomEvent<QueuedCompileRequest | null>) => {
		triggers++;
		requests.push(event.detail);
		onTrigger();
	};

	beforeEach(() => {
		triggers = 0;
		requests = [];
		onTrigger = () => undefined;
		mockParseLog.mockReset().mockReturnValue([
			{ type: 'error', message: 'Undefined control sequence.', file: 'main.tex', line: 3 },
		]);
		document.addEventListener('trigger-compile', handler);
	});

	afterEach(() => {
		document.removeEventListener('trigger-compile', handler);
	});

	it('triggers a compile and parses the result with the matching logger', async () => {
		onTrigger = () =>
			compileResultService.publish({
				status: 1,
				log: 'log text',
				logType: 'latex',
				startedAt: Date.now(),
			});

		const report = await new DocumentEventCompiler(1000).compile();

		expect(triggers).toBe(1);
		expect(mockParseLog).toHaveBeenCalledWith('log text');
		expect(report).toMatchObject({
			succeeded: false,
			status: 1,
			diagnostics: [{ type: 'error', line: 3 }],
		});
	});

	it('queues behind a compile already running and skips its result', async () => {
		const compiling = new DocumentEventCompiler(1000).compile();
		// An in-flight compile from before the request finishes first; the
		// queued request then starts the fresh one.
		compileResultService.publish({
			status: 0,
			log: 'stale',
			logType: 'typst',
			startedAt: Date.now() - 5000,
		});
		compileResultService.publish({
			status: 0,
			log: 'fresh',
			logType: 'typst',
			startedAt: Date.now(),
		});

		const report = await compiling;
		expect(triggers).toBe(1);
		expect(requests).toEqual([{ queue: true }]);
		expect(report).toMatchObject({ succeeded: true, log: 'fresh', diagnostics: null });
	});

	it('passes the main file and clean options with the request', async () => {
		onTrigger = () =>
			compileResultService.publish({
				status: 0,
				log: '',
				logType: 'latex',
				startedAt: Date.now(),
			});

		await new DocumentEventCompiler(1000).compile({
			mainFile: '/main2.tex',
			clean: true,
		});
		expect(requests).toEqual([
			{ queue: true, mainFile: '/main2.tex', clean: true },
		]);
	});

	it('times out when nothing compiles', async () => {
		await expect(new DocumentEventCompiler(20).compile()).rejects.toThrow(
			'No compile result arrived',
		);
	});
});

describe('compile tool', () => {
	const files = {
		listFiles: jest.fn(),
		readTextFile: jest.fn(),
		writeTextFile: jest.fn(),
		editTextFile: jest.fn(),
	};

	it('is offered only when a compiler is available', async () => {
		const list = async (server: ProjectMCPServer) =>
			(
				(await server.handle({ jsonrpc: '2.0', id: 1, method: 'tools/list' }))
					?.result as { tools: Array<{ name: string }> }
			).tools.map((tool) => tool.name);

		expect(await list(new ProjectMCPServer(files))).not.toContain('compile');
		expect(
			await list(new ProjectMCPServer(files, { compile: jest.fn() })),
		).toContain('compile');
	});

	it('checks main_file and passes it and clean to the compiler', async () => {
		const compile = jest.fn().mockResolvedValue({
			succeeded: true,
			status: 0,
			durationMs: 10,
			diagnostics: [],
			log: '',
		});
		files.listFiles.mockResolvedValue([
			{ path: '/sections', type: 'directory', binary: false },
			{ path: '/main2.tex', type: 'file', binary: false },
		]);
		const server = new ProjectMCPServer(files, { compile });
		const call = async (args: Record<string, unknown>) =>
			(
				await server.handle({
					jsonrpc: '2.0',
					id: 1,
					method: 'tools/call',
					params: { name: 'compile', arguments: args },
				})
			)?.result as { isError?: boolean; content: Array<{ text: string }> };

		expect((await call({ main_file: '/main2.tex', clean: true })).isError).toBeFalsy();
		expect(compile).toHaveBeenLastCalledWith({ mainFile: '/main2.tex', clean: true });

		await call({});
		expect(compile).toHaveBeenLastCalledWith({ mainFile: undefined, clean: undefined });

		for (const [args, message] of [
			[{ main_file: '/missing.tex' }, 'File not found: /missing.tex'],
			[{ main_file: '/sections' }, 'File not found: /sections'],
			[{ main_file: 'main2.tex' }, '"main_file" must start with "/"'],
			[{ clean: 'yes' }, '"clean" must be a boolean'],
		] as const) {
			const result = await call(args);
			expect(result.isError).toBe(true);
			expect(result.content[0].text).toBe(message);
		}
		expect(compile).toHaveBeenCalledTimes(2);
	});

	it('formats diagnostics, and falls back to the log tail without them', () => {
		expect(
			formatCompileReport({
				succeeded: false,
				status: 1,
				durationMs: 1234,
				diagnostics: [
					{ type: 'error', message: 'Missing $ inserted.', file: 'main.tex', line: 12 },
					{ type: 'warning', message: 'Citation undefined.', line: 30 },
				],
				log: '',
			}),
		).toBe(
			'Compilation failed (status 1) after 1.2s.\n1 errors, 1 warnings.\nerror main.tex:12: Missing $ inserted.\nwarning line 30: Citation undefined.',
		);

		expect(
			formatCompileReport({
				succeeded: false,
				status: -1,
				durationMs: 0,
				diagnostics: null,
				log: 'first\nsecond\n',
			}),
		).toBe('Compilation failed (status -1) after 0.0s.\nLog tail:\nfirst\nsecond');
	});
});
