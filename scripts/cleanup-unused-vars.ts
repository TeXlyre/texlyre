// scripts/cleanup-unused-vars.ts
import { readFile, writeFile } from 'node:fs/promises';
import { argv } from 'node:process';

type Target = {
	file: string;
	kind: 'destructure-name' | 'whole-line' | 'interface-block';
	name?: string;
	line?: number;
};

const TARGETS: Target[] = [
	{
		file: 'src/components/auth/Login.tsx',
		kind: 'whole-line',
		name: 'currentThemePlugin',
	},
	{
		file: 'src/components/app/AuthApp.tsx',
		kind: 'destructure-name',
		name: 'currentVariant',
	},
	{
		file: 'src/components/backup/ProjectBackupControls.tsx',
		kind: 'destructure-name',
		name: 'synchronize',
	},
	{
		file: 'src/components/bibliography/BibliographyPanel.tsx',
		kind: 'destructure-name',
		name: 'citationStyle',
	},
	{
		file: 'src/components/bibliography/BibliographyPanel.tsx',
		kind: 'destructure-name',
		name: 'autoImport',
	},
	{
		file: 'src/components/bibliography/BibliographyPanel.tsx',
		kind: 'destructure-name',
		name: 'handleEntryClick',
	},
	{
		file: 'src/components/comments/CommentButton.tsx',
		kind: 'whole-line',
		name: 'addComment',
	},
	{
		file: 'src/components/settings/SettingsModal.tsx',
		kind: 'destructure-name',
		name: 'getCategories',
	},
	{
		file: 'src/hooks/editor/EditorEvents.ts',
		kind: 'destructure-name',
		name: 'enableComments',
	},
	{
		file: 'src/hooks/editor/useEditorView.ts',
		kind: 'destructure-name',
		name: 'getEnabledLSPPlugins',
	},
	{
		file: 'src/hooks/editor/useEditorView.ts',
		kind: 'destructure-name',
		name: 'editorSettingsVersion',
	},
	{
		file: 'extras/viewers/bibtex/BibtexViewer.tsx',
		kind: 'destructure-name',
		name: 'processedViewRef',
	},
	{
		file: 'src/extensions/swiftlatex/DvipdfmxEngine.ts',
		kind: 'interface-block',
		name: 'DvipdfmxCompileResult',
	},
];

function removeDestructureName(content: string, name: string): string {
	const lines = content.split('\n');
	const identRe = new RegExp(`\\b${name}\\b`);
	let removed = false;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (!identRe.test(line)) continue;

		const justName = new RegExp(
			`^\\s*${name}(\\s*:\\s*[A-Za-z_$][\\w$]*)?\\s*,?\\s*(//.*)?$`,
		);
		if (justName.test(line)) {
			lines.splice(i, 1);
			removed = true;
			break;
		}

		const inlineWithComma = new RegExp(
			`\\s*${name}(\\s*:\\s*[A-Za-z_$][\\w$]*)?\\s*,`,
		);
		if (inlineWithComma.test(line)) {
			lines[i] = line.replace(inlineWithComma, '');
			removed = true;
			break;
		}

		const lastInline = new RegExp(
			`,\\s*${name}(\\s*:\\s*[A-Za-z_$][\\w$]*)?(?=\\s*\\})`,
		);
		if (lastInline.test(line)) {
			lines[i] = line.replace(lastInline, '');
			removed = true;
			break;
		}
	}

	if (!removed) {
		console.warn(`  could not find destructure entry for "${name}"`);
		return content;
	}
	return lines.join('\n');
}

function removeWholeLine(content: string, name: string): string {
	const lines = content.split('\n');
	const re = new RegExp(`\\b${name}\\b`);
	for (let i = 0; i < lines.length; i++) {
		if (lines[i].trim().startsWith('const') && re.test(lines[i])) {
			lines.splice(i, 1);
			return lines.join('\n');
		}
	}
	console.warn(`  could not find whole line containing "${name}"`);
	return content;
}

function removeInterfaceBlock(content: string, name: string): string {
	const lines = content.split('\n');
	const startRe = new RegExp(`^\\s*(export\\s+)?interface\\s+${name}\\b`);
	let start = -1;
	for (let i = 0; i < lines.length; i++) {
		if (startRe.test(lines[i])) {
			start = i;
			break;
		}
	}
	if (start < 0) {
		console.warn(`  could not find interface "${name}"`);
		return content;
	}

	let depth = 0;
	let end = start;
	for (let i = start; i < lines.length; i++) {
		for (const ch of lines[i]) {
			if (ch === '{') depth++;
			else if (ch === '}') depth--;
		}
		if (depth === 0 && i > start) {
			end = i;
			break;
		}
	}

	while (end + 1 < lines.length && lines[end + 1].trim() === '') end++;
	lines.splice(start, end - start + 1);
	return lines.join('\n');
}

function renameToUnderscore(
	content: string,
	name: string,
	line: number,
): string {
	const lines = content.split('\n');
	const idx = line - 1;
	if (idx < 0 || idx >= lines.length) return content;

	const re = new RegExp(`\\b${name}\\b`);
	if (!re.test(lines[idx])) {
		console.warn(`  "${name}" not on line ${line}`);
		return content;
	}
	lines[idx] = lines[idx].replace(
		new RegExp(`\\b${name}\\b`),
		`${name}: _${name}`,
	);
	return lines.join('\n');
}

async function main(): Promise<void> {
	const dryRun = argv.includes('--dry-run');

	for (const t of TARGETS) {
		console.log(`processing ${t.file} (${t.kind}: ${t.name})`);
		let content: string;
		try {
			content = await readFile(t.file, 'utf8');
		} catch {
			console.warn(`  file not found, skipping`);
			continue;
		}

		let next: string;
		if (t.kind === 'destructure-name' && t.name) {
			next = removeDestructureName(content, t.name);
		} else if (t.kind === 'whole-line' && t.name) {
			next = removeWholeLine(content, t.name);
		} else if (t.kind === 'interface-block' && t.name) {
			next = removeInterfaceBlock(content, t.name);
		} else {
			continue;
		}

		if (next === content) continue;
		if (dryRun) {
			console.log(`  would modify`);
		} else {
			await writeFile(t.file, next, 'utf8');
			console.log(`  modified`);
		}
	}

	const collabFile = 'src/services/CollabService.ts';
	console.log(`processing ${collabFile} (rename "doc" → "_doc")`);
	try {
		const content = await readFile(collabFile, 'utf8');
		const next = renameToUnderscore(content, 'doc', 550);
		if (next !== content) {
			if (dryRun) console.log('  would modify');
			else {
				await writeFile(collabFile, next, 'utf8');
				console.log('  modified');
			}
		}
	} catch {
		console.warn('  could not process CollabService.ts');
	}
}

void main();
