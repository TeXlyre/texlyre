const fs = require('node:fs');
const path = require('node:path');
const { generateMissingPluralizations } = require('./plural-utils.cjs');

function loadJson(filePath) {
	return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
	const outputDir = path.dirname(filePath);
	fs.mkdirSync(outputDir, { recursive: true });
	fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function detectMissingPluralizations(
	localeFile,
	language,
	outputFile,
	{ apply = false } = {},
) {
	const translations = loadJson(localeFile);
	const result = generateMissingPluralizations(translations, language);

	if (outputFile) {
		writeJson(outputFile, result.generated);
	}

	if (apply && Object.keys(result.generated).length > 0) {
		writeJson(localeFile, { ...translations, ...result.generated });
	}

	const missingEntryCount = Object.keys(result.generated).length;
	console.log(`\nPlural audit: ${language}`);
	console.log(`Categories: ${result.categories.join(', ')}`);
	console.log(`Candidate families: ${result.candidates.length}`);
	console.log(`Families with missing forms: ${result.missing.length}`);
	console.log(`Missing plural entries: ${missingEntryCount}`);
	if (outputFile) console.log(`Generated patch: ${outputFile}`);
	if (apply) {
		console.log(`Applied generated seed values to: ${localeFile}`);
		console.log(
			'Review generated values linguistically; missing forms are seeded from the base/_other translation.',
		);
	}

	return result;
}

if (require.main === module) {
	const args = process.argv.slice(2);
	const applyIndex = args.indexOf('--apply');
	const apply = applyIndex !== -1;
	if (apply) args.splice(applyIndex, 1);

	const [localeFile, language, outputFile] = args;
	if (!localeFile || !language) {
		console.error(
			'Usage: node detect-missing-plurals.cjs <locale.json> <language> [missing-plurals.json] [--apply]',
		);
		process.exitCode = 1;
	} else {
		detectMissingPluralizations(localeFile, language, outputFile, { apply });
	}
}

module.exports = { detectMissingPluralizations };
