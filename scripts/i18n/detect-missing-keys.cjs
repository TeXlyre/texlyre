const fs = require('node:fs');
const path = require('node:path');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const t = require('@babel/types');
const { parserPlugins } = require('./parser-options.cjs');
const {
	getPluralCategories,
	generateMissingPluralizations,
	hasCountPlaceholder,
} = require('./plural-utils.cjs');

const CONFIG = {
	extensions: ['.tsx', '.jsx', '.ts'],
	excludeDirs: ['node_modules', 'dist', 'build', '.git'],
	excludeFiles: ['i18n.ts', 'i18n.js'],
	translationFunctions: ['t'],
	maxReported: 25,
};

function normalizeText(text) {
	return text.replace(/\r?\n/g, ' ').replace(/\t/g, ' ');
}

function isTranslationCall(callee) {
	if (t.isIdentifier(callee)) {
		return CONFIG.translationFunctions.includes(callee.name);
	}

	return (
		t.isMemberExpression(callee) &&
		t.isIdentifier(callee.property) &&
		CONFIG.translationFunctions.includes(callee.property.name)
	);
}

function resolveStaticKey(node) {
	if (t.isStringLiteral(node)) {
		return node.value;
	}

	if (t.isTemplateLiteral(node) && node.expressions.length === 0) {
		return node.quasis.map((quasi) => quasi.value.cooked).join('');
	}

	return null;
}

function hasCountOption(node) {
	if (!t.isObjectExpression(node)) return false;

	return node.properties.some((property) => {
		if (!t.isObjectProperty(property) && !t.isObjectMethod(property))
			return false;
		if (property.computed) return false;

		return (
			(t.isIdentifier(property.key) && property.key.name === 'count') ||
			(t.isStringLiteral(property.key) && property.key.value === 'count')
		);
	});
}

function loadTranslations(localeFile) {
	return JSON.parse(fs.readFileSync(localeFile, 'utf8'));
}

function isDefined(key, translationKeys, pluralCategories) {
	if (translationKeys.has(key)) return true;
	return pluralCategories.some((category) =>
		translationKeys.has(`${key}_${category}`),
	);
}

function writeJson(outputFile, value) {
	const outputDir = path.dirname(outputFile);
	fs.mkdirSync(outputDir, { recursive: true });
	fs.writeFileSync(outputFile, `${JSON.stringify(value, null, 2)}\n`);
}

function detectMissingKeys(
	sourceDir,
	localeFile,
	outputFile,
	language,
	pluralOutputFile,
) {
	const translations = loadTranslations(localeFile);
	const translationKeys = new Set(Object.keys(translations));
	const pluralCategories = getPluralCategories(language);
	const usedKeys = new Map();
	const pluralUsedKeys = new Set();
	const dynamicKeys = [];
	let fileCount = 0;

	function recordKey(key, filePath, line) {
		const occurrence = { file: filePath.replace(process.cwd(), ''), line };
		const existing = usedKeys.get(key);

		if (existing) {
			existing.push(occurrence);
			return;
		}

		usedKeys.set(key, [occurrence]);
	}

	function processFile(filePath) {
		const ext = path.extname(filePath);
		const fileName = path.basename(filePath);

		if (
			!CONFIG.extensions.includes(ext) ||
			CONFIG.excludeFiles.includes(fileName)
		) {
			return;
		}

		fileCount++;

		try {
			const code = fs.readFileSync(filePath, 'utf8');
			const ast = parser.parse(code, {
				sourceType: 'module',
				plugins: parserPlugins(filePath),
			});

			traverse(ast, {
				CallExpression(nodePath) {
					if (!isTranslationCall(nodePath.node.callee)) return;

					const [firstArgument, secondArgument] = nodePath.node.arguments;
					if (!firstArgument) return;

					const line = nodePath.node.loc?.start.line;
					const key = resolveStaticKey(firstArgument);

					if (key === null) {
						dynamicKeys.push({
							file: filePath.replace(process.cwd(), ''),
							line,
							expression: code
								.slice(firstArgument.start, firstArgument.end)
								.replace(/\s+/g, ' '),
						});
						return;
					}

					const normalizedKey = normalizeText(key);
					recordKey(normalizedKey, filePath, line);

					if (
						hasCountPlaceholder(normalizedKey) ||
						hasCountOption(secondArgument)
					) {
						pluralUsedKeys.add(normalizedKey);
					}
				},
			});
		} catch (err) {
			console.error(`Error processing ${filePath}:`, err.message);
		}
	}

	function processDirectory(directory) {
		try {
			const entries = fs.readdirSync(directory, { withFileTypes: true });

			for (const entry of entries) {
				const fullPath = path.join(directory, entry.name);

				if (entry.isDirectory()) {
					if (!CONFIG.excludeDirs.includes(entry.name)) {
						processDirectory(fullPath);
					}
				} else if (entry.isFile()) {
					processFile(fullPath);
				}
			}
		} catch (err) {
			console.error(`Error reading directory ${directory}:`, err);
		}
	}

	processDirectory(sourceDir);

	const missing = [...usedKeys.entries()]
		.filter(
			([key]) =>
				key.length > 0 && !isDefined(key, translationKeys, pluralCategories),
		)
		.map(([key, occurrences]) => ({ key, occurrences }))
		.sort((a, b) => a.key.localeCompare(b.key));

	const pluralAudit = generateMissingPluralizations(translations, language, [
		...pluralUsedKeys,
	]);
	const missingPluralEntries = Object.keys(pluralAudit.generated).length;

	writeJson(outputFile, {
		_meta: {
			description:
				'Translation keys used in source but absent from the locale file',
			sourceDir,
			localeFile,
			language,
			pluralCategories,
			filesAnalyzed: fileCount,
			keysUsed: usedKeys.size,
			pluralKeysUsed: pluralUsedKeys.size,
			missingKeys: missing.length,
			missingPluralFamilies: pluralAudit.missing.length,
			missingPluralEntries,
			dynamicKeys: dynamicKeys.length,
		},
		missing,
		missingPluralizations: pluralAudit.missing,
		dynamic: dynamicKeys,
	});

	if (pluralOutputFile) {
		writeJson(pluralOutputFile, pluralAudit.generated);
	}

	console.log('\n✅ Analysis complete!');
	console.log(`📁 Files analyzed: ${fileCount}`);
	console.log(`🔍 Keys used: ${usedKeys.size}`);
	console.log(`❌ Missing keys: ${missing.length}`);
	console.log(
		`🔢 Plural categories (${language}): ${pluralCategories.join(', ')}`,
	);
	console.log(`🧩 Missing plural families: ${pluralAudit.missing.length}`);
	console.log(`🧩 Missing plural entries: ${missingPluralEntries}`);
	console.log(`🔀 Dynamic keys (not resolvable): ${dynamicKeys.length}`);
	console.log(`💾 Results saved to: ${outputFile}`);
	if (pluralOutputFile)
		console.log(`💾 Generated plural patch: ${pluralOutputFile}`);

	if (missing.length > 0) {
		console.log('\n📋 Missing keys:');
		missing.slice(0, CONFIG.maxReported).forEach(({ key, occurrences }) => {
			console.log(`   "${key}"`);
			console.log(`   → ${occurrences[0].file}:${occurrences[0].line}`);
		});

		if (missing.length > CONFIG.maxReported) {
			console.log(`   ... and ${missing.length - CONFIG.maxReported} more`);
		}
	}

	return {
		missing,
		missingPluralizations: pluralAudit.missing,
		generatedPluralizations: pluralAudit.generated,
		dynamic: dynamicKeys,
	};
}

if (require.main === module) {
	const sourceDir = process.argv[2] || './src';
	const localeFile = process.argv[3] || './translations/locales/en.json';
	const outputFile = process.argv[4] || './translations/missing-keys.json';
	const language =
		process.argv[5] || path.basename(localeFile, path.extname(localeFile));
	const pluralOutputFile = process.argv[6];

	detectMissingKeys(
		sourceDir,
		localeFile,
		outputFile,
		language,
		pluralOutputFile,
	);
}

module.exports = { detectMissingKeys };
