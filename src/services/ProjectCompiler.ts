// src/services/ProjectCompiler.ts
import type { LogDiagnostic } from '../plugins/PluginInterface';
import { pluginRegistry } from '../plugins/PluginRegistry';
import {
	type CompileOutcome,
	compileResultService,
} from './CompileResultService';

export interface ProjectCompileReport {
	succeeded: boolean;
	status: number;
	durationMs: number;
	diagnostics: LogDiagnostic[] | null;
	log: string;
}

export interface ProjectCompileOptions {
	// Project path compiled instead of the selected main file, this time only.
	mainFile?: string;
	// Clear the typesetter's caches first.
	clean?: boolean;
}

export interface ProjectCompiler {
	compile(options?: ProjectCompileOptions): Promise<ProjectCompileReport>;
}

const DEFAULT_TIMEOUT_MS = 3 * 60 * 1000;

export const toCompileReport = (
	outcome: CompileOutcome,
	parse: ((log: string) => LogDiagnostic[]) | undefined,
): ProjectCompileReport => {
	let diagnostics: LogDiagnostic[] | null = null;
	if (parse) {
		try {
			diagnostics = parse(outcome.log);
		} catch {
			diagnostics = null;
		}
	}
	return {
		succeeded: outcome.status === 0,
		status: outcome.status,
		durationMs: outcome.finishedAt - outcome.startedAt,
		diagnostics,
		log: outcome.log,
	};
};

// Compiles the way the user does: it fires the same `trigger-compile` event as
// the compile button and shortcut, so the active typesetter, main file and
// engine settings all apply. A compile already running when the request
// arrives may predate the agent's edits, so the request is queued behind it
// and its result is skipped.
export class DocumentEventCompiler implements ProjectCompiler {
	constructor(private readonly timeoutMs = DEFAULT_TIMEOUT_MS) {}

	compile(options: ProjectCompileOptions = {}): Promise<ProjectCompileReport> {
		const since = Date.now();

		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				unsubscribe();
				reject(
					new Error(
						'No compile result arrived. Is a project open with a typesetter selected?',
					),
				);
			}, this.timeoutMs);

			const unsubscribe = compileResultService.subscribe((outcome) => {
				if (outcome.startedAt < since) return;
				clearTimeout(timer);
				unsubscribe();
				resolve(
					toCompileReport(
						outcome,
						pluginRegistry.getLoggerForType(outcome.logType)?.parseLog,
					),
				);
			});

			document.dispatchEvent(
				new CustomEvent('trigger-compile', {
					detail: { queue: true, ...options },
				}),
			);
		});
	}
}
