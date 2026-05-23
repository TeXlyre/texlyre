// extras/loggers/typst_visualizer/parser.ts
export interface ParsedDiagnostic {
	type: 'error' | 'warning' | 'info';
	message: string;
	line?: number;
	file?: string;
	hints?: string[];
	fullMessage?: string;
}

const DIAGNOSTIC_PATTERNS: Array<{
	type: ParsedDiagnostic['type'];
	regex: RegExp;
}> = [
	{ type: 'error', regex: /^error(?:\[([^\]]+)\])?\s*:\s*(.+)$/ },
	{ type: 'warning', regex: /^warning(?:\[([^\]]+)\])?\s*:\s*(.+)$/ },
	{ type: 'info', regex: /^info(?:\[([^\]]+)\])?\s*:\s*(.+)$/ },
];

export function parseTypstLog(log: string): ParsedDiagnostic[] {
	const result: ParsedDiagnostic[] = [];
	const lines = log.split('\n');

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i].trim();
		if (!line) continue;

		const diagnostic = matchDiagnosticHeader(line);
		if (!diagnostic) continue;

		const fullMessage = collectFollowupLines(lines, i, diagnostic);
		diagnostic.fullMessage = fullMessage.replace(/\s+/g, ' ').trim();
		result.push(diagnostic);
	}

	return result;
}

function parseLocation(location: string): { file?: string; line?: number } {
	const match = location.match(/^([^:]+)(?::(\d+))?/);
	if (!match) return {};

	return {
		file: match[1],
		line: match[2] ? Number.parseInt(match[2], 10) + 1 : undefined,
	};
}

function matchDiagnosticHeader(line: string): ParsedDiagnostic | null {
	for (const { type, regex } of DIAGNOSTIC_PATTERNS) {
		const match = line.match(regex);
		if (!match) continue;

		const diagnostic: ParsedDiagnostic = {
			type,
			message: match[2].trim(),
			file: undefined,
			line: undefined,
			hints: [],
		};

		if (match[1]) {
			const location = parseLocation(match[1]);
			diagnostic.file = location.file;
			diagnostic.line = location.line;
		}

		return diagnostic;
	}

	return null;
}

function collectFollowupLines(
	lines: string[],
	startIndex: number,
	diagnostic: ParsedDiagnostic,
): string {
	let fullMessage = diagnostic.message;

	for (let j = startIndex + 1; j < lines.length; j++) {
		const nextLine = lines[j].trim();

		if (nextLine.startsWith('hint:')) {
			diagnostic.hints?.push(nextLine.substring(5).trim());
			continue;
		}

		if (nextLine.match(/^(error|warning|info)(?:\[|:)/)) break;

		if (nextLine && !nextLine.startsWith('hint:')) {
			fullMessage += ` ${nextLine}`;
		}
	}

	return fullMessage;
}
