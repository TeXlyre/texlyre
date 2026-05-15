// scripts/fix-foreach-return.ts
import { readFile, writeFile } from 'node:fs/promises';
import { argv } from 'node:process';

type Target = { file: string; line: number };

const TARGETS: Target[] = [
    { file: 'extras/bibliography/openalex/OpenAlexService.ts', line: 75 },
    { file: 'extras/bibliography/zotero/ZoteroService.ts', line: 74 },
    { file: 'extras/viewers/bibtex/BibtexTableView.tsx', line: 45 },
    { file: 'scripts/i18n/apply-translations.cjs', line: 164 },
    { file: 'scripts/i18n/validate-json.cjs', line: 116 },
    { file: 'src/components/app/ProjectApp.tsx', line: 127 },
    { file: 'src/components/editor/FileExplorer.tsx', line: 152 },
    { file: 'src/contexts/BibliographyContext.tsx', line: 476 },
    { file: 'src/contexts/BibliographyContext.tsx', line: 968 },
    { file: 'src/contexts/SettingsContext.tsx', line: 203 },
    { file: 'src/extensions/swiftlatex/BaseEngine.ts', line: 57 },
    { file: 'src/extensions/swiftlatex/SwiftLaTeXService.ts', line: 111 },
    { file: 'src/extensions/texlyre-busytex/BusyTeXEngine.ts', line: 63 },
    { file: 'src/extensions/typst.ts/TypstCompilerEngine.ts', line: 67 },
    { file: 'src/services/ConflictResolutionService.ts', line: 65 },
    { file: 'src/services/FileConflictService.ts', line: 179 },
    { file: 'src/services/FileSyncService.ts', line: 810 },
    { file: 'src/services/FileSystemBackupService.ts', line: 503 },
    { file: 'src/services/FileSystemBackupService.ts', line: 507 },
    { file: 'src/services/FileSystemBackupService.ts', line: 511 },
    { file: 'src/services/GenericLSPService.ts', line: 426 },
    { file: 'src/services/GenericLSPService.ts', line: 499 },
    { file: 'src/services/GenericLSPService.ts', line: 594 },
    { file: 'src/services/GitBackupService.ts', line: 1082 },
    { file: 'src/services/GitBackupService.ts', line: 1662 },
    { file: 'src/services/GitBackupService.ts', line: 1666 },
    { file: 'src/services/LaTeXService.ts', line: 458 },
    { file: 'src/services/LaTeXSourceMapService.ts', line: 71 },
    { file: 'src/services/OfflineService.ts', line: 97 },
    { file: 'src/services/PopoutViewerService.ts', line: 34 },
    { file: 'src/services/TypstService.ts', line: 843 },
    { file: 'src/services/TypstSourceMapService.ts', line: 232 },
];

const FOREACH_RE =
    /(\.forEach\s*\(\s*(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>\s*)(?!\{)([^;]+?);(\s*\)?)/;

async function patchLine(file: string, line: number): Promise<boolean> {
    let content: string;
    try {
        content = await readFile(file, 'utf8');
    } catch {
        console.warn(`  ${file}: not found`);
        return false;
    }
    const lines = content.split('\n');
    const idx = line - 1;
    if (idx < 0 || idx >= lines.length) {
        console.warn(`  ${file}:${line}: out of range`);
        return false;
    }

    const original = lines[idx];
    const match = original.match(FOREACH_RE);
    if (!match) {
        console.warn(`  ${file}:${line}: no single-line forEach arrow match`);
        return false;
    }

    const [whole, head, body, tail] = match;
    const replacement = `${head}{ ${body.trim()}; }${tail}`;
    lines[idx] = original.replace(whole, replacement);
    await writeFile(file, lines.join('\n'), 'utf8');
    return true;
}

async function main(): Promise<void> {
    const dryRun = argv.includes('--dry-run');
    let modified = 0;
    let skipped = 0;

    for (const t of TARGETS) {
        const ok = dryRun
            ? (await previewLine(t.file, t.line))
            : await patchLine(t.file, t.line);
        if (ok) {
            console.log(`${dryRun ? 'would modify' : 'modified'} ${t.file}:${t.line}`);
            modified++;
        } else {
            skipped++;
        }
    }

    console.log(`\n${modified} ${dryRun ? 'targeted' : 'modified'}, ${skipped} skipped`);
}

async function previewLine(file: string, line: number): Promise<boolean> {
    try {
        const content = await readFile(file, 'utf8');
        const lines = content.split('\n');
        const idx = line - 1;
        if (idx < 0 || idx >= lines.length) return false;
        return FOREACH_RE.test(lines[idx]);
    } catch {
        return false;
    }
}

void main();