// src/services/CompileResultService.ts
import { createNamedLogger } from '@/logging';

const moduleLog = createNamedLogger('CompileResultService');

export interface CompileOutcome {
	// 0 on success, the compiler's status otherwise, -1 when it threw.
	status: number;
	log: string;
	// Key for pluginRegistry.getLoggerForType(), e.g. "latex" or "typst".
	logType: string;
	startedAt: number;
	finishedAt: number;
}

type CompileOutcomeListener = (outcome: CompileOutcome) => void;

// Every compile path (LaTeX, Typst, Chelys typesetters) publishes here once a
// compile ends, successful or not, so non-UI callers can await results.
class CompileResultService {
	private readonly listeners = new Set<CompileOutcomeListener>();

	publish(outcome: Omit<CompileOutcome, 'finishedAt'>): void {
		const complete = { ...outcome, finishedAt: Date.now() };
		for (const listener of this.listeners) {
			try {
				listener(complete);
			} catch (error) {
				moduleLog.error('Compile outcome listener error:', error);
			}
		}
	}

	subscribe(listener: CompileOutcomeListener): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}
}

export const compileResultService = new CompileResultService();
