// scripts/translate-pages.cjs
const path = require('node:path');
const { extractTranslations } = require('./i18n/extract-translations.cjs');
const { processDirectory } = require('./i18n/apply-translations.cjs');
const { detectDynamicContent } = require('./i18n/detect-dynamic-content.cjs');
const { detectMissingKeys } = require('./i18n/detect-missing-keys.cjs');
const {
	detectMissingPluralizations,
} = require('./i18n/detect-missing-plurals.cjs');
const {
	processDirectory: processSettingsDirectory,
} = require('./i18n/apply-settings-translations.cjs');

function inferLanguage(localeFile) {
	return path.basename(localeFile, path.extname(localeFile));
}

function main() {
	const args = process.argv.slice(2);
	const command = args[0];

	if (command === 'detect') {
		const sourceDir = args[1] || './src';
		const outputFile = args[2] || './translations/dynamic-patterns.json';

		console.log('=== Detecting dynamic content ===\n');
		detectDynamicContent(sourceDir, outputFile);
	} else if (command === 'missing') {
		const sourceDir = args[1] || './src';
		const localeFile = args[2] || './translations/locales/en.json';
		const outputFile = args[3] || './translations/missing-keys.json';
		const language = args[4] || inferLanguage(localeFile);
		const pluralOutputFile =
			args[5] || `./translations/missing-plurals-${language}.json`;

		console.log('=== Detecting missing translation keys ===');
		console.log(`Locale: ${language}`);
		console.log(`Plural patch: ${pluralOutputFile}\n`);

		detectMissingKeys(
			sourceDir,
			localeFile,
			outputFile,
			language,
			pluralOutputFile,
		);
	} else if (command === 'plurals') {
		const localeFile = args[1] || './translations/locales/en.json';
		const language = args[2] || inferLanguage(localeFile);
		const outputFile =
			args[3] || `./translations/missing-plurals-${language}.json`;
		const apply = args.includes('--apply');

		console.log('=== Detecting missing pluralizations ===');
		console.log(`Locale: ${language}`);
		console.log(`Mode: ${apply ? 'GENERATE + APPLY' : 'GENERATE PATCH'}\n`);

		detectMissingPluralizations(localeFile, language, outputFile, { apply });
	} else if (command === 'extract') {
		const sourceDir = args[1] || './src';
		const outputFile = args[2] || './translations/locales/en.json';

		console.log('=== Extracting translations ===\n');
		extractTranslations(sourceDir, outputFile);
	} else if (command === 'apply') {
		const sourceDir = args[1] || './src';
		const dryRun = args.includes('--dry-run');
		const noBackup = args.includes('--no-backup');

		console.log('=== Applying translations ===');
		console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);
		console.log(`Backups: ${noBackup ? 'DISABLED' : 'ENABLED'}\n`);

		const startTime = Date.now();
		const stats = processDirectory(sourceDir, {
			dryRun,
			createBackups: !noBackup,
		});
		const duration = ((Date.now() - startTime) / 1000).toFixed(2);

		console.log('\n===== Translation Application Complete =====');
		console.log(`⏱️  Time taken: ${duration} seconds`);
		console.log(`📁 Files processed: ${stats.processed}`);
		console.log(`✅ Files modified: ${stats.modified}`);
		console.log(`🔄 Total transformations: ${stats.totalTransforms}`);
		console.log(`⏩ Files skipped: ${stats.skipped}`);
		console.log(`❌ Errors: ${stats.errors}`);

		if (!dryRun && !noBackup && stats.modified > 0) {
			console.log("\n⚠️  Backup files with '.bak' extension have been created");
		}
	} else if (command === 'apply-settings') {
		const sourceDir = args[1] || './src';
		const dryRun = args.includes('--dry-run');
		const noBackup = args.includes('--no-backup');

		console.log('=== Applying Settings Translations ===');
		console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);
		console.log(`Backups: ${noBackup ? 'DISABLED' : 'ENABLED'}\n`);

		const startTime = Date.now();
		const stats = processSettingsDirectory(sourceDir, {
			dryRun,
			createBackups: !noBackup,
		});
		const duration = ((Date.now() - startTime) / 1000).toFixed(2);

		console.log('\n===== Settings Translation Application Complete =====');
		console.log(`⏱️  Time taken: ${duration} seconds`);
		console.log(`📁 Files processed: ${stats.processed}`);
		console.log(`✅ Files modified: ${stats.modified}`);
		console.log(`🔄 Total transformations: ${stats.totalTransforms}`);
		console.log(`⏩ Files skipped: ${stats.skipped}`);
		console.log(`❌ Errors: ${stats.errors}`);

		if (!dryRun && !noBackup && stats.modified > 0) {
			console.log("\n⚠️  Backup files with '.bak' extension have been created");
		}
	} else {
		console.log(`
TeXlyre Translation Tool

Usage:
  node scripts/translate-pages.cjs detect [sourceDir] [outputFile]
    Detect dynamic content (counts, variables) that should be converted to i18n
    This will generate translations/dynamic-patterns.json which can be viewed for hints of possible modifications

  node scripts/translate-pages.cjs missing [sourceDir] [localeFile] [outputFile] [language] [pluralOutputFile]
    Report t() keys used in the source that have no entry in the locale file
    Also detect pluralized t() calls and generate all missing plural forms supported by the locale
    Language defaults to the locale filename (for example en.json -> en)
    Plural output defaults to translations/missing-plurals-<language>.json

  node scripts/translate-pages.cjs plurals [localeFile] [language] [outputFile] [--apply]
    Audit a locale JSON for incomplete plural families using Intl.PluralRules/CLDR
    Generate only plural categories supported by the specified locale
    --apply merges generated seed entries into the locale file; review them linguistically afterwards

  node scripts/translate-pages.cjs extract [sourceDir] [outputFile]
    Extract all translatable strings to a JSON file
    
  node scripts/translate-pages.cjs apply [sourceDir] [--dry-run] [--no-backup]
    Apply t() function calls to all translatable strings
    
  node scripts/translate-pages.cjs apply-settings [sourceDir] [--dry-run] [--no-backup]
    Apply t() function calls to registerSetting() calls
    
Options:
  --apply      Apply generated plural seed entries to the locale file (plurals command only)
  --dry-run    Preview changes without modifying files
  --no-backup  Don't create .bak backup files

Examples:
  node scripts/translate-pages.cjs detect ./src ./translations/dynamic-patterns.json
  node scripts/translate-pages.cjs missing ./src ./translations/locales/en.json
  node scripts/translate-pages.cjs missing ./src ./translations/locales/ar.json ./translations/missing-keys-ar.json ar
  node scripts/translate-pages.cjs plurals ./translations/locales/ar.json ar
  node scripts/translate-pages.cjs plurals ./translations/locales/it.json it ./translations/missing-plurals-it.json
  node scripts/translate-pages.cjs plurals ./translations/locales/de.json de ./translations/missing-plurals-de.json --apply
  node scripts/translate-pages.cjs extract ./src ./translations/locales/en.json
  node scripts/translate-pages.cjs apply ./src --dry-run
  node scripts/translate-pages.cjs apply ./src
  node scripts/translate-pages.cjs apply-settings ./src --dry-run
  node scripts/translate-pages.cjs apply-settings ./src
        `);
	}
}

if (require.main === module) {
	main();
}
