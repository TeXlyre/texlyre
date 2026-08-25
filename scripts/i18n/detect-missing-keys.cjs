const fs = require('node:fs');
const path = require('node:path');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const t = require('@babel/types');
const { parserPlugins } = require('./parser-options.cjs');

const CONFIG = {
	extensions: ['.tsx', '.jsx', '.ts'],
	excludeDirs: ['node_modules', 'dist', 'build', '.git'],
	excludeFiles: ['i18n.ts', 'i18n.js'],
	translationFunctions: ['t'],
	pluralSuffixes: ['_one', '_other'],
	maxReported: 25,
};

function normalizeText(text) {
	return text
		.replace(/\t/g, '')
		.replace(/\n/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
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

function loadTranslationKeys(localeFile) {
	const content = JSON.parse(fs.readFileSync(localeFile, 'utf8'));
	return new Set(Object.keys(content));
}

function isDefined(key, translationKeys) {
	if (translationKeys.has(key)) return true;
	return CONFIG.pluralSuffixes.some((suffix) =>
		translationKeys.has(`${key}${suffix}`),
	);
}

function detectMissingKeys(sourceDir, localeFile, outputFile) {
	const translationKeys = loadTranslationKeys(localeFile);
	const usedKeys = new Map();
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

					const [firstArgument] = nodePath.node.arguments;
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

					recordKey(normalizeText(key), filePath, line);
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
		.filter(([key]) => key.length > 0 && !isDefined(key, translationKeys))
		.map(([key, occurrences]) => ({ key, occurrences }))
		.sort((a, b) => a.key.localeCompare(b.key));

	const outputDir = path.dirname(outputFile);
	if (!fs.existsSync(outputDir)) {
		fs.mkdirSync(outputDir, { recursive: true });
	}

	fs.writeFileSync(
		outputFile,
		JSON.stringify(
			{
				_meta: {
					description:
						'Translation keys used in source but absent from the locale file',
					sourceDir,
					localeFile,
					filesAnalyzed: fileCount,
					keysUsed: usedKeys.size,
					missingKeys: missing.length,
					dynamicKeys: dynamicKeys.length,
				},
				missing,
				dynamic: dynamicKeys,
			},
			null,
			2,
		),
	);

	console.log('\n✅ Analysis complete!');
	console.log(`📁 Files analyzed: ${fileCount}`);
	console.log(`🔍 Keys used: ${usedKeys.size}`);
	console.log(`❌ Missing keys: ${missing.length}`);
	console.log(`🔀 Dynamic keys (not resolvable): ${dynamicKeys.length}`);
	console.log(`💾 Results saved to: ${outputFile}`);

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

	return { missing, dynamic: dynamicKeys };
}

if (require.main === module) {
	const sourceDir = process.argv[2] || './src';
	const localeFile = process.argv[3] || './translations/locales/en.json';
	const outputFile = process.argv[4] || './translations/missing-keys.json';

	detectMissingKeys(sourceDir, localeFile, outputFile);
}

module.exports = { detectMissingKeys };
