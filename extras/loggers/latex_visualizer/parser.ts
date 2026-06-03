// extras/loggers/latex_visualizer/parser.ts
import { t } from '@/i18n';

export interface ParsedError {
	type: 'error' | 'warning' | 'info';
	message: string;
	line?: number;
	file?: string;
	lineContent?: string;
	fullMessage?: string;
}

const DEFAULT_FILE = 'main.tex';
const LOG_WRAP_LIMIT = 79;

export function parseLatexLog(log: string): ParsedError[] {
	const transcript = extractCompilerOutput(log);
	const lines = preprocessLogLines(transcript).split('\n');

	const result: ParsedError[] = [];

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const contextFile = getFileFromContext(lines, i);

		const parsed =
			extractLatexError(lines, i, contextFile) ??
			extractRunawayArgument(lines, i, contextFile) ??
			extractGenericError(lines, i, contextFile) ??
			extractLatexWarning(lines, i, contextFile) ??
			extractPackageWarning(lines, i, contextFile) ??
			extractBoxWarning(line, contextFile) ??
			extractSimpleDiagnostic(line, contextFile);

		if (parsed) result.push(parsed);
	}

	return dedupeErrors(result);
}

function extractCompilerOutput(log: string): string {
	if (!log.includes('======') && !/^\$ /m.test(log)) {
		return log;
	}

	const blocks = log.split(/^======\s*$/m);
	const transcripts: string[] = [];

	for (const block of blocks) {
		if (!/^\$ (?:pdflatex|xelatex|lualatex)/m.test(block)) continue;

		const logSection = sliceSection(block, 'LOG:');
		const stdoutSection = sliceSection(block, 'STDOUT:');
		const chosen = logSection && logSection.trim() ? logSection : stdoutSection;
		if (chosen?.trim()) transcripts.push(chosen);
	}

	return transcripts.length > 0 ? transcripts.join('\n') : log;
}

function sliceSection(block: string, header: string): string | null {
	const match = block.match(new RegExp(`(?:^|\\n)${header}\\n`));
	if (match?.index === undefined) return null;
	const start = match.index + match[0].length;
	const after = block.slice(start);
	const end = after.search(
		/^(?:==|TEXMFLOG:|MISSFONTLOG:|STDOUT:|STDERR:)\s*$/m,
	);
	return end === -1 ? after : after.slice(0, end);
}

function dedupeErrors(errors: ParsedError[]): ParsedError[] {
	const seen = new Set<string>();
	const result: ParsedError[] = [];

	for (const error of errors) {
		const key = `${error.type}|${error.message}|${error.line ?? ''}|${error.file ?? ''}`;
		if (seen.has(key)) continue;
		seen.add(key);
		result.push(error);
	}

	return result;
}

function shouldJoinLines(currentLine: string, nextLine: string): boolean {
	if (!currentLine || !nextLine) return false;

	const trimmedNext = nextLine.trim();

	if (trimmedNext.match(/^l\.\d+/)) return false;

	if (currentLine.includes('bef') && trimmedNext.startsWith('ore ')) {
		return true;
	}

	if (
		currentLine.match(/[a-zA-Z]-?\s*$/) &&
		trimmedNext.match(/^[a-zA-Z]/) &&
		trimmedNext.length < 60 &&
		!trimmedNext.includes(':') &&
		!trimmedNext.startsWith('!') &&
		!trimmedNext.startsWith('Package') &&
		!trimmedNext.startsWith('LaTeX')
	) {
		return true;
	}

	return false;
}

function joinSplitLine(currentLine: string, nextLine: string): string {
	const trimmedNext = nextLine.trim();

	if (currentLine.includes('bef') && trimmedNext.startsWith('ore ')) {
		return currentLine.replace(/bef\s*$/, 'before ') + trimmedNext.substring(4);
	}

	if (currentLine.endsWith('-')) {
		return currentLine.slice(0, -1) + trimmedNext;
	}

	return currentLine.replace(/\s*$/, '') + trimmedNext;
}

function unwrapHardWrappedLines(log: string): string {
	const lines = log.split('\n');
	if (lines.length === 0) return log;

	const unwrapped = [lines[0]];
	for (let i = 1; i < lines.length; i++) {
		const prev = unwrapped[unwrapped.length - 1];
		if (prev.length === LOG_WRAP_LIMIT && !prev.endsWith('...')) {
			unwrapped[unwrapped.length - 1] = prev + lines[i];
		} else {
			unwrapped.push(lines[i]);
		}
	}

	return unwrapped.join('\n');
}

function preprocessLogLines(log: string): string {
	const lines = unwrapHardWrappedLines(log).split('\n');
	const processedLines: string[] = [];

	for (let i = 0; i < lines.length; i++) {
		const currentLine = lines[i];
		const nextLine = lines[i + 1];

		if (nextLine && shouldJoinLines(currentLine, nextLine)) {
			processedLines.push(joinSplitLine(currentLine, nextLine));
			i++;
		} else {
			processedLines.push(currentLine);
		}
	}

	return processedLines.join('\n');
}

function getFileFromContext(lines: string[], lineIndex: number): string {
	const fileStack: string[] = [];
	const scanned = lines.slice(0, lineIndex + 1).join(' ');

	for (let j = 0; j < scanned.length; j++) {
		const char = scanned[j];

		if (char === '(') {
			const remaining = scanned.substring(j + 1);
			const fileMatch = remaining.match(
				/^(_?[^()\s]*\.(?:tex|sty|cls|def|fd|cfg|clo|ltx|bbl))/,
			);
			if (fileMatch) {
				const filePath = fileMatch[1];
				const fileName = filePath.split('/').pop() || filePath;
				fileStack.push(fileName);
			}
		} else if (char === ')') {
			if (fileStack.length > 0) fileStack.pop();
		}
	}

	return fileStack.length > 0 ? fileStack[fileStack.length - 1] : DEFAULT_FILE;
}

function extractLatexError(
	lines: string[],
	i: number,
	contextFile: string,
): ParsedError | null {
	const line = lines[i];
	if (
		!line.startsWith('! LaTeX Error:') &&
		!line.startsWith('! Fatal Package') &&
		!line.startsWith('! Critical Package')
	) {
		return null;
	}

	const errorMessage = line.startsWith('! LaTeX Error:')
		? line.substring(14).trim()
		: line.substring(2).trim();
	let lineNumber: number | undefined;
	let lineContent: string | undefined;
	let fullMessage = errorMessage;

	for (let j = i + 1; j < Math.min(i + 30, lines.length); j++) {
		const nextLine = lines[j];

		const lineMatch = nextLine.match(/^l\.(\d+)\s*(.*)/);
		if (lineMatch) {
			lineNumber = Number.parseInt(lineMatch[1], 10);
			const content = lineMatch[2].trim();
			lineContent = content && content.length > 1 ? content : undefined;
			continue;
		}

		if (nextLine.startsWith('!  ==>')) {
			fullMessage += ` ${nextLine.substring(6).trim()}`;
			continue;
		}

		if (nextLine.startsWith('Type <return>')) continue;

		if (nextLine.startsWith('See ') || nextLine.startsWith('Transcript ')) {
			break;
		}

		if (nextLine.match(/^\s*\.{3,}\s*$/) || nextLine.trim() === '') {
			if (j > i + 5) break;
			continue;
		}

		if (nextLine.match(/^\([^)]+\)\s+(.*)$/)) {
			const messageContent = nextLine.replace(/^\([^)]+\)\s+/, '').trim();
			if (messageContent) fullMessage += ` ${messageContent}`;
		} else if (
			nextLine.trim() &&
			!nextLine.startsWith('Type ') &&
			nextLine.trim() !== '}'
		) {
			const cleanLine = nextLine.trim();
			if (cleanLine.length > 0 && !cleanLine.match(/^[a-z]\.\d+/)) {
				fullMessage += ` ${cleanLine}`;
			}
		}
	}

	return {
		type: 'error',
		message: errorMessage,
		line: lineNumber,
		file: contextFile,
		lineContent,
		fullMessage: fullMessage.replace(/\s+/g, ' ').trim(),
	};
}

function extractRunawayArgument(
	lines: string[],
	i: number,
	contextFile: string,
): ParsedError | null {
	const line = lines[i];
	if (!line.startsWith('Runaway argument')) return null;

	let lineNumber: number | undefined;
	let lineContent: string | undefined;
	let fullMessage = line.trim();

	for (let j = i + 1; j < Math.min(i + 10, lines.length); j++) {
		const lineMatch = lines[j].match(/^l\.(\d+)\s*(.*)/);
		if (lineMatch) {
			lineNumber = Number.parseInt(lineMatch[1], 10);
			const content = lineMatch[2].trim();
			lineContent = content && content.length > 1 ? content : undefined;
			break;
		}
		const next = lines[j].trim();
		if (next && !next.startsWith('l.')) {
			fullMessage += ` ${next}`;
		}
	}

	return {
		type: 'error',
		message: 'Runaway argument',
		line: lineNumber,
		file: contextFile,
		lineContent,
		fullMessage: fullMessage.replace(/\s+/g, ' ').trim(),
	};
}

function extractGenericError(
	lines: string[],
	i: number,
	contextFile: string,
): ParsedError | null {
	const line = lines[i];
	if (!line.startsWith('! ') || line.startsWith('! LaTeX Error:')) return null;

	const errorMessage = line.substring(2).trim();
	let lineNumber: number | undefined;
	let lineContent: string | undefined;

	for (let j = i + 1; j < Math.min(i + 10, lines.length); j++) {
		const lineMatch = lines[j].match(/^l\.(\d+)\s*(.*)/);
		if (lineMatch) {
			lineNumber = Number.parseInt(lineMatch[1], 10);
			lineContent = lineMatch[2];
			break;
		}
	}

	return {
		type: 'error',
		message: errorMessage,
		line: lineNumber,
		file: contextFile,
		lineContent,
	};
}

function extractLatexWarning(
	lines: string[],
	i: number,
	contextFile: string,
): ParsedError | null {
	const line = lines[i];
	if (!line.includes('LaTeX Warning:') && !line.includes('LaTeX Font Warning:'))
		return null;

	const warningMatch = line.match(/LaTeX(?: Font)? Warning:\s*(.+)/);
	if (!warningMatch) return null;

	let fullMessage = warningMatch[1];
	let lineNumber: number | undefined;

	const fileLineMatch = fullMessage.match(/(.+?)\s+on input line (\d+)/);
	if (fileLineMatch) {
		fullMessage = fileLineMatch[1];
		lineNumber = Number.parseInt(fileLineMatch[2], 10);
	}

	const explicitFileMatch = fullMessage.match(
		/(.+?)\s+on page \d+ undefined on input line (\d+)/,
	);
	if (explicitFileMatch) {
		fullMessage = explicitFileMatch[1];
		lineNumber = Number.parseInt(explicitFileMatch[2], 10);
	}

	for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
		const trimmed = lines[j].trim();
		if (!trimmed) break;

		const contMatch = trimmed.match(/^\(Font\)\s*(.*)$/);
		if (contMatch) {
			const cont = contMatch[1];
			const contLineMatch = cont.match(/(.+?)\s+on input line (\d+)/);
			if (contLineMatch) {
				fullMessage += ` ${contLineMatch[1]}`;
				lineNumber = Number.parseInt(contLineMatch[2], 10);
			} else {
				fullMessage += ` ${cont}`;
			}
			continue;
		}

		if (
			!trimmed.match(/^[A-Z]/) &&
			!trimmed.includes('Warning:') &&
			!trimmed.includes('Error:')
		) {
			fullMessage += ` ${trimmed}`;
		} else {
			break;
		}
	}

	return {
		type: 'warning',
		message: fullMessage.replace(/\s+/g, ' ').trim(),
		line: lineNumber,
		file: contextFile,
	};
}

function extractPackageWarning(
	lines: string[],
	i: number,
	contextFile: string,
): ParsedError | null {
	const line = lines[i];
	if (!line.includes('Package') || !line.includes('Warning:')) return null;

	const packageWarningMatch = line.match(/Package\s+(\w+)\s+Warning:\s*(.+)/);
	if (!packageWarningMatch) return null;

	const packageName = packageWarningMatch[1];
	const prefixRegex = new RegExp(`(?:\\(${packageName}\\))*\\s*(.*)`, 'i');

	const messageParts = [`${packageName}: ${packageWarningMatch[2]}`];
	let lineNumber: number | undefined;

	const firstLineMatch = line.match(/on input line (\d+)/);
	if (firstLineMatch) lineNumber = Number.parseInt(firstLineMatch[1], 10);

	for (let j = i + 1; j < lines.length; j++) {
		const nextLine = lines[j];
		if (!nextLine.trim()) break;
		if (nextLine.includes('Warning:') || nextLine.includes('Error:')) break;

		const inputLineMatch = nextLine.match(/on input line (\d+)/);
		if (inputLineMatch) lineNumber = Number.parseInt(inputLineMatch[1], 10);

		const cleaned = nextLine.match(prefixRegex);
		if (cleaned?.[1]?.trim()) messageParts.push(cleaned[1].trim());
	}

	return {
		type: 'warning',
		message: messageParts.join(' ').replace(/\s+/g, ' ').trim(),
		line: lineNumber,
		file: contextFile,
	};
}

function extractBoxWarning(
	line: string,
	contextFile: string,
): ParsedError | null {
	const boxMatch = line.match(/(Over|Under)full\s+\\(h|v)box/);
	if (!boxMatch) return null;

	const lineRangeMatch = line.match(/at lines?\s+(\d+)(?:--\d+)?/);

	return {
		type: 'warning',
		message: `${boxMatch[1]}full ${boxMatch[2]}box`,
		line: lineRangeMatch ? Number.parseInt(lineRangeMatch[1], 10) : undefined,
		file: contextFile,
	};
}

function extractSimpleDiagnostic(
	line: string,
	contextFile: string,
): ParsedError | null {
	if (
		line.includes('There were undefined references') ||
		(line.includes('Citation') && line.includes('undefined'))
	) {
		return {
			type: 'warning',
			message: t('Undefined references detected'),
			line: undefined,
			file: contextFile,
		};
	}

	if (line.includes('Missing character:')) {
		const charMatch = line.match(
			/Missing character:\s*(.+?)(?:\s+in font|\s+on input line (\d+))?/,
		);
		if (charMatch) {
			return {
				type: 'warning',
				message: t('Missing character: {missingChar}', {
					missingChar: charMatch[1],
				}),
				line: charMatch[2] ? Number.parseInt(charMatch[2], 10) : undefined,
				file: contextFile,
			};
		}
	}

	if (
		line.includes('Fatal error occurred') ||
		line.includes('Emergency stop')
	) {
		return {
			type: 'error',
			message: t('Fatal compilation error - no output produced'),
			line: undefined,
			file: contextFile,
		};
	}

	if (line.includes('File') && line.includes('not found')) {
		const fileMatch = line.match(/File\s+['`"]([^'"]+)[''"]\s+not found/);
		if (fileMatch) {
			return {
				type: 'error',
				message: t('File not found: {missingFile}', {
					missingFile: fileMatch[1],
				}),
				line: undefined,
				file: contextFile,
			};
		}
	}

	return null;
}
