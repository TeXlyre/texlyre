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

export function parseLatexLog(log: string): ParsedError[] {
	const result: ParsedError[] = [];
	const lines = preprocessLogLines(log).split('\n');

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const contextFile = getFileFromContext(lines, i);

		const parsed =
			extractLatexError(lines, i, contextFile) ??
			extractGenericError(lines, i, contextFile) ??
			extractLatexWarning(lines, i, contextFile) ??
			extractPackageWarning(lines, i, contextFile) ??
			extractBoxWarning(line, contextFile) ??
			extractSimpleDiagnostic(line, contextFile);

		if (parsed) result.push(parsed);
	}

	return result;
}

function shouldJoinLines(currentLine: string, nextLine: string): boolean {
	if (!currentLine || !nextLine) return false;

	const trimmedNext = nextLine.trim();

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

function preprocessLogLines(log: string): string {
	const lines = log.split('\n');
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

	for (let i = 0; i <= lineIndex; i++) {
		const line = lines[i];
		if (!line) continue;

		for (let j = 0; j < line.length; j++) {
			const char = line[j];

			if (char === '(') {
				const remaining = line.substring(j + 1);
				const fileMatch = remaining.match(
					/^([^()]*\.(?:tex|sty|cls|def|fd|cfg))/,
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
	if (!line.includes('LaTeX Warning:')) return null;

	const warningMatch = line.match(/LaTeX Warning:\s*(.+)/);
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
		const nextLine = lines[j].trim();
		if (
			nextLine &&
			!nextLine.match(/^[A-Z]/) &&
			!nextLine.includes('Warning:') &&
			!nextLine.includes('Error:')
		) {
			fullMessage += ` ${nextLine}`;
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

	let fullMessage = `${packageWarningMatch[1]}: ${packageWarningMatch[2]}`;
	let lineNumber: number | undefined;

	const lineMatch = fullMessage.match(/(.+?)\s+on input line (\d+)/);
	if (lineMatch) {
		fullMessage = lineMatch[1];
		lineNumber = Number.parseInt(lineMatch[2], 10);
	}

	for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
		const nextLine = lines[j].trim();
		if (
			nextLine &&
			!nextLine.match(/^[A-Z]/) &&
			!nextLine.includes('Warning:') &&
			!nextLine.includes('Error:') &&
			!nextLine.startsWith('(')
		) {
			fullMessage += ` ${nextLine}`;
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

function extractBoxWarning(
	line: string,
	contextFile: string,
): ParsedError | null {
	if (!line.match(/(Over|Under)full\s+\\(h|v)box/)) return null;

	const boxMatch = line.match(
		/(Over|Under)full\s+\\(h|v)box.*?(?:at lines?\s+(\d+)(?:--(\d+))?)/,
	);
	if (!boxMatch) return null;

	return {
		type: 'warning',
		message: `${boxMatch[1]}full ${boxMatch[2]}box`,
		line: Number.parseInt(boxMatch[3], 10),
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
