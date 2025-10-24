const { extractTranslations } = require("./i18n/extract-translations.cjs");
const { processDirectory } = require("./i18n/apply-translations.cjs");
const { normalizeTranslations } = require("./i18n/normalize-translations.cjs");
const { detectDynamicContent } = require("./i18n/detect-dynamic-content.cjs");

function main() {
    const args = process.argv.slice(2);
    const command = args[0];

    if (command === "detect") {
        const sourceDir = args[1] || "./src";
        const outputFile = args[2] || "./translations/dynamic-patterns.json";

        console.log("=== Detecting dynamic content ===\n");
        detectDynamicContent(sourceDir, outputFile);

    } else if (command === "extract") {
        const sourceDir = args[1] || "./src";
        const outputFile = args[2] || "./translations/en.json";

        console.log("=== Extracting translations ===\n");
        extractTranslations(sourceDir, outputFile);

        console.log("\n=== Normalizing translations ===\n");
        normalizeTranslations(outputFile);

    } else if (command === "normalize") {
        const inputFile = args[1] || "./translations/en.json";
        const outputFile = args[2];

        console.log("=== Normalizing translations ===\n");
        normalizeTranslations(inputFile, outputFile);

    } else if (command === "apply") {
        const sourceDir = args[1] || "./src";
        const dryRun = args.includes("--dry-run");
        const noBackup = args.includes("--no-backup");

        console.log("=== Applying translations ===");
        console.log(`Mode: ${dryRun ? "DRY RUN" : "LIVE"}`);
        console.log(`Backups: ${noBackup ? "DISABLED" : "ENABLED"}\n`);

        const startTime = Date.now();
        const stats = processDirectory(sourceDir, {
            dryRun,
            createBackups: !noBackup,
        });
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);

        console.log("\n===== Translation Application Complete =====");
        console.log(`⏱️  Time taken: ${duration} seconds`);
        console.log(`📁 Files processed: ${stats.processed}`);
        console.log(`✅ Files modified: ${stats.modified}`);
        console.log(`🔄 Total transformations: ${stats.totalTransforms}`);
        console.log(`⏩ Files skipped: ${stats.skipped}`);
        console.log(`❌ Errors: ${stats.errors}`);

        if (!dryRun && !noBackup && stats.modified > 0) {
            console.log(
                "\n⚠️  Backup files with '.bak' extension have been created",
            );
        }
    } else {
        console.log(`
TeXlyre Translation Tool

Usage:
  node scripts/translate-pages.cjs detect [sourceDir] [outputFile]
    Detect dynamic content (counts, variables) that should be converted to i18n
    
  node scripts/translate-pages.cjs extract [sourceDir] [outputFile]
    Extract all translatable strings to a JSON file and normalize them
    
  node scripts/translate-pages.cjs normalize [inputFile] [outputFile]
    Normalize spacing in existing translation file
    
  node scripts/translate-pages.cjs apply [sourceDir] [--dry-run] [--no-backup]
    Apply t() function calls to all translatable strings
    
Options:
  --dry-run    Preview changes without modifying files
  --no-backup  Don't create .bak backup files

Examples:
  node scripts/translate-pages.cjs detect ./src ./translations/dynamic-patterns.json
  node scripts/translate-pages.cjs extract ./src ./translations/en.json
  node scripts/translate-pages.cjs normalize ./translations/en.json
  node scripts/translate-pages.cjs apply ./src --dry-run
  node scripts/translate-pages.cjs apply ./src
        `);
    }
}

if (require.main === module) {
    main();
}