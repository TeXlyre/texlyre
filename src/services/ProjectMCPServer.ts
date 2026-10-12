// src/services/ProjectMCPServer.ts
import { createNamedLogger } from '@/logging';
import type { ProjectCompileReport, ProjectCompiler } from './ProjectCompiler';
import type { ProjectFileSystem } from './ProjectFileSystem';

const moduleLog = createNamedLogger('ProjectMCPServer');

// Newest first; the first entry is offered when the client asks for a
// version this server does not know.
const SUPPORTED_PROTOCOL_VERSIONS = [
	'2025-11-25',
	'2025-06-18',
	'2025-03-26',
	'2024-11-05',
];

const SERVER_INFO = { name: 'texlyre', title: 'TeXlyre project', version: '1' };

const INSTRUCTIONS =
	'These tools are the only way to reach the TeXlyre project the user has open. ' +
	'Project files live in the browser, not on disk: paths are project paths such ' +
	'as "/main.tex". Prefer edit_file for changes so collaborators editing the same ' +
	'document keep their work; use write_file only to create files or replace one wholesale. ' +
	'After editing, run compile (when offered) and fix the errors it reports.';

const JSON_RPC_METHOD_NOT_FOUND = -32601;
const JSON_RPC_INVALID_PARAMS = -32602;

class McpError extends Error {
	constructor(
		readonly code: number,
		message: string,
	) {
		super(message);
	}
}

interface JsonRpcRequest {
	jsonrpc: '2.0';
	id?: string | number;
	method?: string;
	params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
	jsonrpc: '2.0';
	id: string | number;
	result?: unknown;
	error?: { code: number; message: string };
}

interface ToolResult {
	content: Array<{ type: 'text'; text: string }>;
	isError?: boolean;
}

interface ToolDefinition {
	name: string;
	title: string;
	description: string;
	inputSchema: Record<string, unknown>;
	annotations?: Record<string, boolean>;
	run: (args: Record<string, unknown>) => Promise<string>;
}

const text = (value: string): ToolResult => ({
	content: [{ type: 'text', text: value }],
});

const requireString = (args: Record<string, unknown>, key: string): string => {
	const value = args[key];
	if (typeof value !== 'string') throw new Error(`"${key}" must be a string`);
	return value;
};

const optionalInteger = (
	args: Record<string, unknown>,
	key: string,
): number | undefined => {
	const value = args[key];
	if (value === undefined || value === null) return undefined;
	if (!Number.isInteger(value) || (value as number) < 1) {
		throw new Error(`"${key}" must be a positive integer`);
	}
	return value as number;
};

const projectPath = (args: Record<string, unknown>, key = 'path'): string => {
	const path = requireString(args, key);
	if (!path.startsWith('/')) throw new Error(`"${key}" must start with "/"`);
	if (path.split('/').some((part) => part === '..' || part === '.')) {
		throw new Error(`"${key}" must not contain "." or ".." segments`);
	}
	return path;
};

const optionalBoolean = (
	args: Record<string, unknown>,
	key: string,
): boolean | undefined => {
	const value = args[key];
	if (value === undefined || value === null) return undefined;
	if (typeof value !== 'boolean') throw new Error(`"${key}" must be a boolean`);
	return value;
};

const numbered = (content: string, startLine: number, count?: number) => {
	const lines = content.split('\n');
	const slice = lines.slice(
		startLine - 1,
		count ? startLine - 1 + count : undefined,
	);
	const width = String(startLine + slice.length - 1).length;
	const body = slice
		.map(
			(line, index) => `${String(startLine + index).padStart(width)}\t${line}`,
		)
		.join('\n');
	return `${body}\n[lines ${startLine}-${startLine + slice.length - 1} of ${lines.length}]`;
};

const MAX_DIAGNOSTICS = 40;
const LOG_TAIL_LINES = 40;

export const formatCompileReport = (report: ProjectCompileReport): string => {
	const seconds = (report.durationMs / 1000).toFixed(1);
	const lines = [
		report.succeeded
			? `Compilation succeeded in ${seconds}s.`
			: `Compilation failed (status ${report.status}) after ${seconds}s.`,
	];

	if (report.diagnostics) {
		const count = (type: string) =>
			report.diagnostics?.filter((entry) => entry.type === type).length ?? 0;
		lines.push(`${count('error')} errors, ${count('warning')} warnings.`);
		for (const entry of report.diagnostics.slice(0, MAX_DIAGNOSTICS)) {
			const where = entry.file
				? ` ${entry.file}${entry.line ? `:${entry.line}` : ''}`
				: entry.line
					? ` line ${entry.line}`
					: '';
			lines.push(`${entry.type}${where}: ${entry.message}`);
		}
		if (report.diagnostics.length > MAX_DIAGNOSTICS) {
			lines.push(`... ${report.diagnostics.length - MAX_DIAGNOSTICS} more`);
		}
	}

	if (!report.succeeded && !report.diagnostics?.length) {
		const tail = report.log.trimEnd().split('\n').slice(-LOG_TAIL_LINES);
		lines.push('Log tail:', ...tail);
	}

	return lines.join('\n');
};

// A minimal MCP server (tools only) over the open TeXlyre project. Transport
// is the caller's concern: GenericACPService feeds it messages tunnelled from
// the agent host's bridge.
export class ProjectMCPServer {
	private readonly tools: ToolDefinition[];

	constructor(
		private readonly files: ProjectFileSystem,
		private readonly compiler: ProjectCompiler | null = null,
	) {
		this.tools = this.defineTools();
	}

	async handle(message: unknown): Promise<JsonRpcResponse | null> {
		const request = message as JsonRpcRequest;
		if (!request || typeof request !== 'object' || !request.method) {
			return null;
		}
		// Notifications (initialized, cancelled, ...) need no reply.
		if (request.id === undefined) return null;

		try {
			return {
				jsonrpc: '2.0',
				id: request.id,
				result: await this.dispatch(request.method, request.params ?? {}),
			};
		} catch (error) {
			return {
				jsonrpc: '2.0',
				id: request.id,
				error: {
					code:
						error instanceof McpError ? error.code : JSON_RPC_INVALID_PARAMS,
					message: error instanceof Error ? error.message : String(error),
				},
			};
		}
	}

	private async dispatch(
		method: string,
		params: Record<string, unknown>,
	): Promise<unknown> {
		switch (method) {
			case 'initialize': {
				const requested = params.protocolVersion;
				return {
					protocolVersion:
						typeof requested === 'string' &&
						SUPPORTED_PROTOCOL_VERSIONS.includes(requested)
							? requested
							: SUPPORTED_PROTOCOL_VERSIONS[0],
					capabilities: { tools: { listChanged: false } },
					serverInfo: SERVER_INFO,
					instructions: INSTRUCTIONS,
				};
			}
			case 'ping':
				return {};
			case 'tools/list':
				return {
					tools: this.tools.map(({ run: _run, ...tool }) => tool),
				};
			case 'tools/call':
				return this.callTool(params);
			default:
				throw new McpError(
					JSON_RPC_METHOD_NOT_FOUND,
					`Method not found: ${method}`,
				);
		}
	}

	private async callTool(params: Record<string, unknown>): Promise<ToolResult> {
		const tool = this.tools.find((candidate) => candidate.name === params.name);
		if (!tool) {
			throw new McpError(
				JSON_RPC_INVALID_PARAMS,
				`Unknown tool: ${params.name}`,
			);
		}

		const args =
			params.arguments && typeof params.arguments === 'object'
				? (params.arguments as Record<string, unknown>)
				: {};

		// Tool failures are results, not protocol errors, so the model sees them.
		try {
			return text(await tool.run(args));
		} catch (error) {
			moduleLog.debug(`Tool ${tool.name} failed:`, error);
			return {
				...text(error instanceof Error ? error.message : String(error)),
				isError: true,
			};
		}
	}

	private defineTools(): ToolDefinition[] {
		const pathProperty = {
			type: 'string',
			description: 'Project path starting with "/", e.g. "/main.tex"',
		};

		return [
			{
				name: 'list_files',
				title: 'List project files',
				description:
					'List every file and directory in the open TeXlyre project.',
				inputSchema: { type: 'object', properties: {} },
				annotations: { readOnlyHint: true },
				run: async () => {
					const entries = await this.files.listFiles();
					if (entries.length === 0) return 'The project is empty.';
					return entries
						.map((entry) =>
							entry.type === 'directory'
								? `${entry.path}/`
								: `${entry.path}${entry.binary ? ' (binary)' : ''}${
										entry.size !== undefined ? ` ${entry.size}B` : ''
									}`,
						)
						.join('\n');
				},
			},
			{
				name: 'read_file',
				title: 'Read a project file',
				description:
					'Read a text file from the project with line numbers. Reflects unsaved and collaborators’ live edits.',
				inputSchema: {
					type: 'object',
					properties: {
						path: pathProperty,
						startLine: { type: 'integer', minimum: 1 },
						lineCount: { type: 'integer', minimum: 1 },
					},
					required: ['path'],
				},
				annotations: { readOnlyHint: true },
				run: async (args) => {
					const content = await this.files.readTextFile(projectPath(args));
					return numbered(
						content,
						optionalInteger(args, 'startLine') ?? 1,
						optionalInteger(args, 'lineCount'),
					);
				},
			},
			{
				name: 'edit_file',
				title: 'Edit a project file',
				description:
					'Replace one exact, unique occurrence of oldText with newText. Copy oldText from read_file output without the line-number prefix.',
				inputSchema: {
					type: 'object',
					properties: {
						path: pathProperty,
						oldText: { type: 'string' },
						newText: { type: 'string' },
					},
					required: ['path', 'oldText', 'newText'],
				},
				annotations: { destructiveHint: false },
				run: async (args) => {
					const path = projectPath(args);
					await this.files.editTextFile(
						path,
						requireString(args, 'oldText'),
						requireString(args, 'newText'),
					);
					return `Edited ${path}.`;
				},
			},
			{
				name: 'write_file',
				title: 'Write a project file',
				description:
					'Create a text file, or replace an existing one entirely with new content.',
				inputSchema: {
					type: 'object',
					properties: {
						path: pathProperty,
						content: { type: 'string' },
					},
					required: ['path', 'content'],
				},
				annotations: { destructiveHint: true },
				run: async (args) => {
					const path = projectPath(args);
					await this.files.writeTextFile(path, requireString(args, 'content'));
					return `Wrote ${path}.`;
				},
			},
			...(this.compiler ? [this.compileTool(this.compiler)] : []),
		];
	}

	private compileTool(compiler: ProjectCompiler): ToolDefinition {
		return {
			name: 'compile',
			title: 'Compile the project',
			description:
				'Compile the project with the typesetter and engine the user has selected, and report errors and warnings with file and line. Uses the selected main file unless main_file is given.',
			inputSchema: {
				type: 'object',
				properties: {
					main_file: {
						type: 'string',
						description:
							'Project path of the file to compile instead of the selected main file, for this compile only, e.g. "/chapter.tex". It must suit the project typesetter.',
					},
					clean: {
						type: 'boolean',
						description:
							"Clear the typesetter's caches first, e.g. when results look stale.",
					},
				},
			},
			annotations: { readOnlyHint: true },
			run: async (args) => {
				const mainFile =
					args.main_file === undefined || args.main_file === null
						? undefined
						: projectPath(args, 'main_file');
				if (mainFile) {
					const entry = (await this.files.listFiles()).find(
						(file) => file.path === mainFile,
					);
					if (entry?.type !== 'file') {
						throw new Error(`File not found: ${mainFile}`);
					}
				}
				return formatCompileReport(
					await compiler.compile({
						mainFile,
						clean: optionalBoolean(args, 'clean'),
					}),
				);
			},
		};
	}
}
