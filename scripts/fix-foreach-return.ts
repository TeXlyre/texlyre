// scripts/fix-foreach-return.ts
import { readFile, writeFile } from 'node:fs/promises';
import { argv } from 'node:process';

type Edit =
	| {
			kind: 'replace-line';
			file: string;
			line: number;
			match: string;
			with: string;
	  }
	| { kind: 'insert-above'; file: string; line: number; insert: string }
	| {
			kind: 'replace-in-line';
			file: string;
			line: number;
			from: string;
			to: string;
	  }
	| { kind: 'add-svg-aria-hidden'; file: string; svgStartLine: number }
	| { kind: 'anchor-to-button'; file: string; openLine: number };

const EDITS: Edit[] = [
	{
		kind: 'add-svg-aria-hidden',
		file: 'extras/viewers/drawio/DrawioSplashScreen.tsx',
		svgStartLine: 44,
	},

	{
		kind: 'replace-in-line',
		file: 'extras/viewers/bibtex/styles.css',
		line: 181,
		from: 'left: -var(--space-sd);',
		to: 'left: calc(-1 * var(--space-sm));',
	},

	{
		kind: 'replace-in-line',
		file: 'src/services/GitBackupService.ts',
		line: 1662,
		from: 'this.listeners.forEach((listener) => listener(this.status));',
		to: 'this.listeners.forEach((listener) => { listener(this.status); });',
	},

	{
		kind: 'replace-line',
		file: 'src/hooks/editor/useEditorView.ts',
		line: 600,
		match: 'toolbar: toolbarComp,',
		with: '',
	},

	{
		kind: 'insert-above',
		file: 'src/utils/svgSanitizer.ts',
		line: 212,
		insert:
			'\t// biome-ignore lint/suspicious/noControlCharactersInRegex: SVG content sanitization',
	},
	{
		kind: 'insert-above',
		file: 'src/utils/svgSanitizer.ts',
		line: 302,
		insert:
			'\t\t\t\t// biome-ignore lint/suspicious/noControlCharactersInRegex: SVG content sanitization',
	},
	{
		kind: 'insert-above',
		file: 'src/utils/svgSanitizer.ts',
		line: 327,
		insert:
			'\t\t// biome-ignore lint/suspicious/noControlCharactersInRegex: SVG content sanitization',
	},

	{
		kind: 'anchor-to-button',
		file: 'src/components/app/AuthApp.tsx',
		openLine: 111,
	},
	{
		kind: 'anchor-to-button',
		file: 'src/components/app/EditorApp.tsx',
		openLine: 641,
	},
	{
		kind: 'anchor-to-button',
		file: 'src/components/app/EditorApp.tsx',
		openLine: 668,
	},
	{
		kind: 'anchor-to-button',
		file: 'src/components/app/ProjectApp.tsx',
		openLine: 556,
	},
	{
		kind: 'anchor-to-button',
		file: 'src/components/auth/GuestConsentModal.tsx',
		openLine: 138,
	},
	{
		kind: 'anchor-to-button',
		file: 'src/components/auth/Register.tsx',
		openLine: 198,
	},
	{
		kind: 'anchor-to-button',
		file: 'src/components/common/KeyboardShortcutsModal.tsx',
		openLine: 180,
	},
];

const fileCache = new Map<string, string[]>();
const writes = new Map<string, string[]>();

async function loadFile(path: string): Promise<string[] | null> {
	if (fileCache.has(path)) return fileCache.get(path) ?? null;
	try {
		const content = await readFile(path, 'utf8');
		const lines = content.split('\n');
		fileCache.set(path, lines);
		return lines;
	} catch {
		return null;
	}
}

function queueWrite(path: string, lines: string[]): void {
	writes.set(path, lines);
	fileCache.set(path, lines);
}

function indentOf(line: string): string {
	const m = line.match(/^(\s*)/);
	return m ? m[1] : '';
}

function applyAnchorToButton(lines: string[], openLine: number): boolean {
	const start = openLine - 1;
	if (start < 0 || start >= lines.length) return false;

	const baseIndent = indentOf(lines[start]);
	if (!lines[start].trim().startsWith('<a')) return false;

	let closeIdx = -1;
	for (let i = start + 1; i < lines.length; i++) {
		const trimmed = lines[i].trim();
		if (trimmed === '>' || trimmed.endsWith('>')) {
			closeIdx = i;
			break;
		}
	}
	if (closeIdx < 0) return false;

	let closingTagIdx = -1;
	for (let i = closeIdx + 1; i < lines.length; i++) {
		if (lines[i].includes('</a>')) {
			closingTagIdx = i;
			break;
		}
	}
	if (closingTagIdx < 0) return false;

	const attrs: {
		href?: string;
		onClick?: string;
		className?: string;
		rest: string[];
	} = {
		rest: [],
	};

	for (let i = start + 1; i < closeIdx; i++) {
		const line = lines[i];
		const trimmed = line.trim();
		if (trimmed.startsWith('href=')) {
			attrs.href = trimmed;
			continue;
		}
		if (trimmed.startsWith('onClick=')) {
			let collected = line;
			let j = i;
			let parenDepth = 0;
			let braceDepth = 0;
			for (const ch of trimmed) {
				if (ch === '{') braceDepth++;
				else if (ch === '}') braceDepth--;
				else if (ch === '(') parenDepth++;
				else if (ch === ')') parenDepth--;
			}
			while (j + 1 < closeIdx && (braceDepth > 0 || parenDepth > 0)) {
				j++;
				const next = lines[j];
				collected += '\n' + next;
				for (const ch of next) {
					if (ch === '{') braceDepth++;
					else if (ch === '}') braceDepth--;
					else if (ch === '(') parenDepth++;
					else if (ch === ')') parenDepth--;
				}
			}
			i = j;
			attrs.onClick = collected;
			continue;
		}
		if (trimmed.startsWith('className=')) {
			attrs.className = trimmed;
			continue;
		}
		attrs.rest.push(line);
	}

	const newAttrs: string[] = [];
	newAttrs.push(`${baseIndent}\ttype='button'`);
	if (attrs.onClick) newAttrs.push(...attrs.onClick.split('\n'));
	if (attrs.className) newAttrs.push(`${baseIndent}\t${attrs.className}`);
	for (const r of attrs.rest) newAttrs.push(r);

	const finalCloseLine = lines[closeIdx];
	const newOpen = [`${baseIndent}<button`, ...newAttrs, finalCloseLine];

	const beforeClosingTag = lines.slice(closeIdx + 1, closingTagIdx);
	const closingTagLine = lines[closingTagIdx].replace('</a>', '</button>');

	lines.splice(
		start,
		closingTagIdx - start + 1,
		...newOpen,
		...beforeClosingTag,
		closingTagLine,
	);
	return true;
}

function applyAddSvgAriaHidden(lines: string[], svgStartLine: number): boolean {
	const idx = svgStartLine - 1;
	if (idx < 0 || idx >= lines.length) return false;
	if (!lines[idx].trim().startsWith('<svg')) return false;

	for (let i = idx; i < lines.length; i++) {
		if (lines[i].includes('aria-hidden')) return false;
		if (lines[i].includes('>')) break;
	}

	const insertAt = idx + 1;
	const indent = indentOf(lines[insertAt] ?? lines[idx]) || '\t\t\t\t';
	lines.splice(insertAt, 0, `${indent}aria-hidden='true'`);
	return true;
}

function previewEdit(
	edit: Edit,
	beforeLines: string[],
	afterLines: string[],
): void {
	const targetLine =
		'line' in edit
			? edit.line
			: 'svgStartLine' in edit
				? edit.svgStartLine
				: 'openLine' in edit
					? edit.openLine
					: 1;

	const ctx = 3;
	const beforeStart = Math.max(0, targetLine - 1 - ctx);
	const beforeEnd = Math.min(beforeLines.length, targetLine - 1 + ctx + 4);
	const afterStart = beforeStart;
	const drift = afterLines.length - beforeLines.length;
	const afterEnd = Math.min(afterLines.length, beforeEnd + drift);

	console.log('  --- before ---');
	for (let i = beforeStart; i < beforeEnd; i++) {
		console.log(`    ${String(i + 1).padStart(5)}  ${beforeLines[i]}`);
	}
	console.log('  --- after ---');
	for (let i = afterStart; i < afterEnd; i++) {
		console.log(`    ${String(i + 1).padStart(5)}  ${afterLines[i]}`);
	}
	console.log('');
}

async function main(): Promise<void> {
	const dryRun = argv.includes('--dry-run');
	const verbose = argv.includes('--verbose') || dryRun;
	let applied = 0;
	let skipped = 0;

	for (const edit of EDITS) {
		const before = await loadFile(edit.file);
		if (!before) {
			console.warn(`skip ${edit.file}: not found`);
			skipped++;
			continue;
		}

		const working = [...before];
		let ok = false;
		switch (edit.kind) {
			case 'replace-line': {
				const idx = edit.line - 1;
				if (
					idx >= 0 &&
					idx < working.length &&
					working[idx].includes(edit.match)
				) {
					if (edit.with === '') {
						working.splice(idx, 1);
					} else {
						working[idx] = working[idx].replace(edit.match, edit.with);
					}
					ok = true;
				}
				break;
			}
			case 'replace-in-line': {
				const idx = edit.line - 1;
				if (
					idx >= 0 &&
					idx < working.length &&
					working[idx].includes(edit.from)
				) {
					working[idx] = working[idx].replace(edit.from, edit.to);
					ok = true;
				}
				break;
			}
			case 'insert-above': {
				const idx = edit.line - 1;
				if (idx >= 0 && idx <= working.length) {
					const prev = working[idx - 1] ?? '';
					if (!prev.includes('biome-ignore')) {
						working.splice(idx, 0, edit.insert);
						ok = true;
					}
				}
				break;
			}
			case 'add-svg-aria-hidden':
				ok = applyAddSvgAriaHidden(working, edit.svgStartLine);
				break;
			case 'anchor-to-button':
				ok = applyAnchorToButton(working, edit.openLine);
				break;
		}

		const locHint =
			'line' in edit
				? `:${edit.line}`
				: 'svgStartLine' in edit
					? `:${edit.svgStartLine}`
					: 'openLine' in edit
						? `:${edit.openLine}`
						: '';
		const label = `${edit.kind} ${edit.file}${locHint}`;

		if (ok) {
			queueWrite(edit.file, working);
			console.log(`${dryRun ? '✓ would apply' : '✓ applied'}  ${label}`);
			if (verbose) previewEdit(edit, before, working);
			applied++;
		} else {
			console.warn(`✗ skip          ${label}`);
			if (verbose) {
				const ln =
					'line' in edit
						? edit.line
						: 'svgStartLine' in edit
							? edit.svgStartLine
							: 'openLine' in edit
								? edit.openLine
								: 1;
				const ctx = 3;
				const s = Math.max(0, ln - 1 - ctx);
				const e = Math.min(before.length, ln - 1 + ctx + 4);
				console.log('  --- context (no change) ---');
				for (let i = s; i < e; i++) {
					console.log(`    ${String(i + 1).padStart(5)}  ${before[i]}`);
				}
				console.log('');
			}
			skipped++;
		}
	}

	if (!dryRun) {
		for (const [path, lines] of writes) {
			await writeFile(path, lines.join('\n'), 'utf8');
		}
	}

	console.log(
		`\n${applied} ${dryRun ? 'targeted' : 'applied'}, ${skipped} skipped`,
	);
}

void main();
