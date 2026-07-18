// src/logging.ts

export type NamedLogger = {
	debug: (...args: unknown[]) => void;
	info: (...args: unknown[]) => void;
	warn: (...args: unknown[]) => void;
	error: (...args: unknown[]) => void;
	trace: (...args: unknown[]) => void;
};

export function createNamedLogger(scope: string): NamedLogger {
	const prefix = `[${scope}]`;

	return {
		debug: (...args) => console.debug(prefix, ...args),
		info: (...args) => console.info(prefix, ...args),
		warn: (...args) => console.warn(prefix, ...args),
		error: (...args) => console.error(prefix, ...args),
		trace: (...args) => console.trace(prefix, ...args),
	};
}
