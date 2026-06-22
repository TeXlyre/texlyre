// extras/loggers/typst_visualizer/parser.ts
export interface ParsedHint {
	text: string;
	items?: string[];
}

export interface ParsedDiagnostic {
	type: 'error' | 'warning' | 'info';
	message: string;
	line?: number;
	file?: string;
	hints?: ParsedHint[];
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

const HEADER_PATTERN = /^(error|warning|info)(?:\[|:)/;
const HINTS_MARKER = /,?\s*hints?:/i;

export function parseTypstLog(log: string): ParsedDiagnostic[] {
	const result: ParsedDiagnostic[] = [];
	const lines = log.split('\n');

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i].trim();
		if (!line) continue;

		const diagnostic = matchDiagnosticHeader(line);
		if (!diagnostic) continue;

		const { message, listItems } = collectFollowupLines(lines, i, diagnostic);
		buildHints(diagnostic, message, listItems);
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
): { message: string; listItems: string[] } {
	let message = diagnostic.message;
	const listItems: string[] = [];

	for (let j = startIndex + 1; j < lines.length; j++) {
		const nextLine = lines[j].trim();

		if (HEADER_PATTERN.test(nextLine)) break;

		if (nextLine.startsWith('-')) {
			listItems.push(nextLine.replace(/^-\s*/, '').trim());
			continue;
		}

		if (nextLine.startsWith('hint:')) {
			diagnostic.hints?.push({ text: nextLine.substring(5).trim() });
			continue;
		}

		if (nextLine) message += ` ${nextLine}`;
	}

	return { message, listItems };
}

function buildHints(
	diagnostic: ParsedDiagnostic,
	fullMessage: string,
	listItems: string[],
): void {
	const marker = fullMessage.search(HINTS_MARKER);

	if (marker === -1) {
		diagnostic.fullMessage = normalize(fullMessage);
		attachListItems(diagnostic, listItems);
		return;
	}

	diagnostic.fullMessage = normalize(fullMessage.slice(0, marker));

	const hintText = fullMessage.slice(marker).replace(HINTS_MARKER, '');
	const inlineHints = hintText
		.split(/\s*,(?=\s*see\b)\s*/)
		.map((hint) => normalize(hint))
		.filter(Boolean)
		.map((text): ParsedHint => ({ text }));

	diagnostic.hints = [...(diagnostic.hints ?? []), ...inlineHints];
	attachListItems(diagnostic, listItems);
}

function attachListItems(
	diagnostic: ParsedDiagnostic,
	listItems: string[],
): void {
	if (listItems.length === 0) return;

	const hints = diagnostic.hints ?? [];
	const last = hints[hints.length - 1];

	if (last && /:\s*$/.test(last.text)) {
		last.text = last.text.replace(/:\s*$/, '');
		last.items = listItems;
	} else {
		hints.push({ text: '', items: listItems });
	}

	diagnostic.hints = hints;
}

function normalize(text: string): string {
	return text.replace(/\s+/g, ' ').trim();
}
