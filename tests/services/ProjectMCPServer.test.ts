import type { ProjectFileSystem } from '@src/services/ProjectFileSystem';
import { ProjectMCPServer } from '@src/services/ProjectMCPServer';

describe('ProjectMCPServer', () => {
	const files: jest.Mocked<ProjectFileSystem> = {
		listFiles: jest.fn(),
		readTextFile: jest.fn(),
		writeTextFile: jest.fn(),
		editTextFile: jest.fn(),
	};
	let server: ProjectMCPServer;

	const call = (name: string, args: Record<string, unknown>) =>
		server.handle({
			jsonrpc: '2.0',
			id: 7,
			method: 'tools/call',
			params: { name, arguments: args },
		});

	beforeEach(() => {
		for (const fn of Object.values(files)) fn.mockReset();
		server = new ProjectMCPServer(files);
	});

	it('negotiates a known protocol version and advertises tools', async () => {
		const known = await server.handle({
			jsonrpc: '2.0',
			id: 1,
			method: 'initialize',
			params: { protocolVersion: '2025-06-18', capabilities: {} },
		});
		expect(known?.result).toMatchObject({
			protocolVersion: '2025-06-18',
			capabilities: { tools: {} },
			serverInfo: { name: 'texlyre' },
		});

		const unknown = await server.handle({
			jsonrpc: '2.0',
			id: 2,
			method: 'initialize',
			params: { protocolVersion: '1999-01-01' },
		});
		expect((unknown?.result as { protocolVersion: string }).protocolVersion).toBe(
			'2025-11-25',
		);
	});

	it('ignores notifications', async () => {
		await expect(
			server.handle({ jsonrpc: '2.0', method: 'notifications/initialized' }),
		).resolves.toBeNull();
	});

	it('lists tools without leaking implementations', async () => {
		const response = await server.handle({
			jsonrpc: '2.0',
			id: 3,
			method: 'tools/list',
		});
		const tools = (response?.result as { tools: Array<Record<string, unknown>> })
			.tools;

		expect(tools.map((tool) => tool.name)).toEqual([
			'list_files',
			'read_file',
			'edit_file',
			'write_file',
		]);
		for (const tool of tools) {
			expect(tool.run).toBeUndefined();
			expect(tool.inputSchema).toMatchObject({ type: 'object' });
		}
	});

	it('reads files with numbered lines', async () => {
		files.readTextFile.mockResolvedValue('a\nb\nc\nd');

		const response = await call('read_file', {
			path: '/main.tex',
			startLine: 2,
			lineCount: 2,
		});

		expect(files.readTextFile).toHaveBeenCalledWith('/main.tex');
		expect(response?.result).toEqual({
			content: [{ type: 'text', text: '2\tb\n3\tc\n[lines 2-3 of 4]' }],
		});
	});

	it('routes edits and writes to the file system', async () => {
		files.editTextFile.mockResolvedValue();
		files.writeTextFile.mockResolvedValue();

		await call('edit_file', { path: '/a.tex', oldText: 'x', newText: 'y' });
		await call('write_file', { path: '/b.tex', content: 'z' });

		expect(files.editTextFile).toHaveBeenCalledWith('/a.tex', 'x', 'y');
		expect(files.writeTextFile).toHaveBeenCalledWith('/b.tex', 'z');
	});

	it('reports tool failures as error results the model can read', async () => {
		files.editTextFile.mockRejectedValue(new Error('oldText was not found'));

		const failed = await call('edit_file', {
			path: '/a.tex',
			oldText: 'x',
			newText: 'y',
		});
		expect(failed?.result).toEqual({
			content: [{ type: 'text', text: 'oldText was not found' }],
			isError: true,
		});

		const traversal = await call('read_file', { path: '/../etc/passwd' });
		expect(traversal?.result).toMatchObject({ isError: true });
		expect(files.readTextFile).not.toHaveBeenCalled();
	});

	it('answers unknown tools and methods with protocol errors', async () => {
		expect((await call('rm_rf', {}))?.error?.code).toBe(-32602);
		expect(
			(await server.handle({ jsonrpc: '2.0', id: 9, method: 'resources/list' }))
				?.error?.code,
		).toBe(-32601);
	});
});
