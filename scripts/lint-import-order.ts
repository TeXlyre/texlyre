// scripts/lint-import-order.ts
import { readFile, writeFile } from 'node:fs/promises';
import { glob } from 'node:fs/promises';
import { argv, exit } from 'node:process';

type ImportLine = { raw: string; source: string; line: number };

const I18N_HEADER = [
    "import { t } from '@/i18n';",
    "import { Trans } from 'react-i18next';",
];

const LOCAL_PREFIXES = ['@/', '@src/', './', '../'];

function parseImports(content: string): {
    imports: ImportLine[];
    lines: string[];
} {
    const lines = content.split('\n');
    const imports: ImportLine[] = [];
    const sourceRe = /from\s+['"]([^'"]+)['"]/;

    let i = 0;
    while (i < lines.length) {
        const line = lines[i];
        const trimmed = line.trimStart();
        if (
            !trimmed.startsWith('import ') &&
            !trimmed.startsWith('import"') &&
            !trimmed.startsWith("import'")
        ) {
            i++;
            continue;
        }

        const startLine = i;
        const buffer: string[] = [line];
        while (!buffer[buffer.length - 1].includes(';') && i + 1 < lines.length) {
            i++;
            buffer.push(lines[i]);
        }

        const raw = buffer.join('\n');
        const match = raw.match(sourceRe);
        if (match) {
            imports.push({ raw, source: match[1], line: startLine });
        } else if (/^import\s+['"]([^'"]+)['"]/.test(raw.trim())) {
            const sideEffect = raw.trim().match(/^import\s+['"]([^'"]+)['"]/);
            if (sideEffect)
                imports.push({ raw, source: sideEffect[1], line: startLine });
        }
        i++;
    }
    return { imports, lines };
}

function classify(source: string): 'local' | 'node_module' {
    return LOCAL_PREFIXES.some((p) => source.startsWith(p))
        ? 'local'
        : 'node_module';
}

function buildExpectedBlock(imports: ImportLine[]): string[] {
    const usesI18n = imports.some((i) => i.source === '@/i18n');
    const usesTrans = imports.some((i) => i.source === 'react-i18next');
    const hasHeader = usesI18n && usesTrans;

    const rest = imports.filter(
        (i) =>
            !(hasHeader && (i.source === '@/i18n' || i.source === 'react-i18next')),
    );
    const nodeModules = rest.filter((i) => classify(i.source) === 'node_module');
    const locals = rest.filter((i) => classify(i.source) === 'local');

    const out: string[] = [];
    if (hasHeader) out.push(I18N_HEADER[0], I18N_HEADER[1]);
    if (nodeModules.length > 0) {
        out.push(...nodeModules.map((i) => i.raw));
        if (locals.length > 0) out.push('');
    }
    out.push(...locals.map((i) => i.raw));
    return out;
}

export function checkFile(path: string, content: string): string[] {
    const errors: string[] = [];
    const { imports, lines } = parseImports(content);
    if (imports.length === 0) return errors;

    const usesI18n = imports.some((i) => i.source === '@/i18n');
    const usesTrans = imports.some((i) => i.source === 'react-i18next');
    const hasHeader = usesI18n && usesTrans;

    if (hasHeader) {
        if (
            imports[0].raw !== I18N_HEADER[0] ||
            imports[1]?.raw !== I18N_HEADER[1]
        ) {
            errors.push(`${path}: expected i18n header as first two import lines.`);
        }
    }

    const headerCount = hasHeader ? 2 : 0;
    const rest = imports.slice(headerCount);
    const nodeModules = rest.filter((i) => classify(i.source) === 'node_module');
    const locals = rest.filter((i) => classify(i.source) === 'local');

    const expectedOrder = [...nodeModules, ...locals];
    for (let i = 0; i < rest.length; i++) {
        if (rest[i].raw !== expectedOrder[i].raw) {
            errors.push(
                `${path}:${rest[i].line + 1}: imports must be ordered as node modules, then local imports.`,
            );
            break;
        }
    }

    if (nodeModules.length > 0 && locals.length > 0) {
        const lastNode = nodeModules[nodeModules.length - 1];
        const blankLine = lines[lastNode.line + 1];
        if (blankLine?.trim() !== '') {
            errors.push(
                `${path}:${lastNode.line + 2}: expected blank line between node modules and local imports.`,
            );
        }
    } else if (hasHeader && nodeModules.length === 0 && locals.length > 0) {
        const lastHeader = imports[headerCount - 1];
        const next = lines[lastHeader.line + 1];
        if (next?.trim() === '') {
            errors.push(
                `${path}:${lastHeader.line + 2}: no blank line expected between i18n header and local imports when no node modules are present.`,
            );
        }
    }

    return errors;
}

export function fixFile(content: string): string {
    const { imports, lines } = parseImports(content);
    if (imports.length === 0) return content;

    const importLineSpans = new Set<number>();
    for (const imp of imports) {
        const span = imp.raw.split('\n').length;
        for (let k = 0; k < span; k++) importLineSpans.add(imp.line + k);
    }

    const firstImport = imports[0].line;
    const lastImport = imports[imports.length - 1];
    const lastImportEnd = lastImport.line + lastImport.raw.split('\n').length - 1;

    let blockEnd = lastImportEnd;
    while (
        blockEnd + 1 < lines.length &&
        (lines[blockEnd + 1].trim() === '' || importLineSpans.has(blockEnd + 1))
    ) {
        blockEnd++;
    }

    const expectedBlock = buildExpectedBlock(imports);
    const before = lines.slice(0, firstImport);
    const after = lines.slice(blockEnd + 1);

    const trailing: string[] = [];
    while (after.length > 0 && after[0].trim() === '') {
        trailing.push(after.shift() as string);
    }
    if (after.length > 0) trailing.push('');

    return [...before, ...expectedBlock, ...trailing, ...after].join('\n');
}

async function collectFiles(patterns: string[]): Promise<string[]> {
    const out: string[] = [];
    for (const pattern of patterns) {
        for await (const entry of glob(pattern, { withFileTypes: true })) {
            if (!entry.isFile()) continue;
            const name = entry.name;
            if (!name.endsWith('.ts') && !name.endsWith('.tsx')) continue;
            out.push(`${entry.parentPath}/${name}`);
        }
    }
    return out;
}

async function main(): Promise<void> {
    const args = argv.slice(2);
    const command = args[0];
    const patterns = args.slice(1).filter((a) => !a.startsWith('--'));
    const targets = patterns.length ? patterns : ['src/**/*.ts', 'src/**/*.tsx'];
    const files = await collectFiles(targets);

    if (command === 'fix' || command === 'apply') {
        let changed = 0;
        for (const file of files) {
            const content = await readFile(file, 'utf8');
            const fixed = fixFile(content);
            if (fixed !== content) {
                await writeFile(file, fixed, 'utf8');
                changed++;
                console.log(`fixed: ${file}`);
            }
        }
        console.log(`\n${changed} file(s) fixed.`);
        return;
    }

    if (command === 'preview') {
        let wouldChange = 0;
        for (const file of files) {
            const content = await readFile(file, 'utf8');
            const fixed = fixFile(content);
            if (fixed !== content) {
                wouldChange++;
                console.log(`would fix: ${file}`);
            }
        }
        console.log(`\n${wouldChange} file(s) would be fixed.`);
        return;
    }

    const allErrors: string[] = [];
    for (const file of files) {
        const content = await readFile(file, 'utf8');
        allErrors.push(...checkFile(file, content));
    }
    if (allErrors.length > 0) {
        for (const err of allErrors) console.error(err);
        exit(1);
    }
    console.log(`${files.length} file(s) checked, no issues.`);
}

void main();