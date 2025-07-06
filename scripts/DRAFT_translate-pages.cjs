// scripts/DRAFT_translate-pages.cjs

/* WARNING: This script is a work-in-progress and should not be used just yet.
This is a standalone script that traverses all files in a directory and its subdirectories,
* and transforms JSX text content and specific attributes into t() function calls for translation.
*
* It uses Babel to parse and transform the code, and can be run as a Node.js script.
* Install:
* ```
* npm install @babel/core @babel/parser @babel/traverse @babel/generator @babel/types
* ```
*
* Run:
* ```
*  node scripts/DRAFT_translate-pages.cjs [sourceDir]
* ```
* */

const fs = require("node:fs");
const path = require("node:path");
const babel = require("@babel/core");
const parser = require("@babel/parser");
const traverse = require("@babel/traverse").default;
const generate = require("@babel/generator").default;
const t = require("@babel/types");

/**
 * Configuration options
 */
const CONFIG = {
	// File extensions to process
	extensions: [".tsx", ".jsx"],
	// Directories to exclude
	excludeDirs: ["node_modules", "dist", "build", ".git"],
	// Files to exclude
	excludeFiles: ["i18n.ts", "i18n.js"],
	// Minimum length for text to be translated
	minTextLength: 2,
	// Whether to process text inside these JSX attributes
	processAttributes: ["placeholder", "title", "alt", "aria-label"],
	// Text patterns to ignore (regex strings)
	ignorePatterns: [
		// Code blocks, variables, URLs, emails, etc.
		"^\\{.*\\}$",
		"^https?://",
		"^[\\w.-]+@[\\w.-]+\\.[a-zA-Z]{2,}$",
		"^\\d+(\\.\\d+)?$",
	],
	// Whether to create backup files
	createBackups: false,
};

/**
 * Checks if a string should be translated
 */
function shouldTranslate(text) {
	// Ignore empty/whitespace text
	if (!text || text.trim().length < CONFIG.minTextLength) return false;

	// Check against ignore patterns
	for (const pattern of CONFIG.ignorePatterns) {
		if (new RegExp(pattern).test(text.trim())) return false;
	}

	return true;
}

/**
 * Checks if a file should be processed
 */
function shouldProcessFile(filePath) {
	const ext = path.extname(filePath);
	const fileName = path.basename(filePath);

	return (
		CONFIG.extensions.includes(ext) && !CONFIG.excludeFiles.includes(fileName)
	);
}

/**
 * Creates a t() function call expression
 */
function createTranslationCall(text) {
	// Normalize and clean the text
	const cleanText = text.trim().replace(/\s+/g, " ");

	// Create t('text') expression
	return t.callExpression(t.identifier("t"), [t.stringLiteral(cleanText)]);
}

/**
 * Process a single file
 */
function processFile(filePath) {
	console.log(`Processing ${filePath}...`);

	try {
		const code = fs.readFileSync(filePath, "utf8");

		// Parse the file
		const ast = parser.parse(code, {
			sourceType: "module",
			plugins: ["jsx", "typescript", "decorators-legacy", "classProperties"],
			tokens: true,
		});

		let modified = false;

		// Traverse and transform the AST
		traverse(ast, {
			// Handle JSX text content
			JSXText(path) {
				const text = path.node.value.trim();
				if (shouldTranslate(text)) {
					path.replaceWith(
						t.jsxExpressionContainer(createTranslationCall(text)),
					);
					modified = true;
				}
			},

			// Handle string literals in JSX attributes
			JSXAttribute(path) {
				// Only process specific attributes that we want to translate
				if (
					CONFIG.processAttributes.includes(path.node.name.name) &&
					t.isStringLiteral(path.node.value)
				) {
					const text = path.node.value.value;
					if (shouldTranslate(text)) {
						path.node.value = t.jsxExpressionContainer(
							createTranslationCall(text),
						);
						modified = true;
					}
				}
			},

			// Avoid transforming code inside i() calls (ignore function)
			CallExpression(path) {
				if (t.isIdentifier(path.node.callee) && path.node.callee.name === "i") {
					path.skip();
				}
			},
		});

		// Only write back if changes were made
		if (modified) {
			const output = generate(
				ast,
				{
					retainLines: true,
					compact: false,
					jsescOption: { quotes: "single" },
				},
				code,
			);

			// Create backup if enabled
			if (CONFIG.createBackups) {
				fs.writeFileSync(`${filePath}.bak`, code);
			}

			// Write modified file
			fs.writeFileSync(filePath, output.code);
			console.log(`✅ Transformed ${filePath}`);
			return true;
		}
		console.log(`⏩ No changes needed in ${filePath}`);
		return false;
	} catch (error) {
		console.error(`❌ Error processing ${filePath}:`, error);
		return false;
	}
}

/**
 * Process a directory recursively
 */
function processDirectory(
	directory,
	stats = { processed: 0, modified: 0, skipped: 0, errors: 0 },
) {
	try {
		const entries = fs.readdirSync(directory, { withFileTypes: true });

		for (const entry of entries) {
			const fullPath = path.join(directory, entry.name);

			if (entry.isDirectory()) {
				// Skip excluded directories
				if (!CONFIG.excludeDirs.includes(entry.name)) {
					processDirectory(fullPath, stats);
				} else {
					console.log(`⏩ Skipping excluded directory: ${fullPath}`);
				}
			} else if (entry.isFile()) {
				if (shouldProcessFile(fullPath)) {
					stats.processed++;
					try {
						const modified = processFile(fullPath);
						if (modified) stats.modified++;
					} catch (error) {
						console.error(`❌ Failed to process ${fullPath}:`, error);
						stats.errors++;
					}
				} else {
					stats.skipped++;
				}
			}
		}

		return stats;
	} catch (error) {
		console.error(`❌ Error reading directory ${directory}:`, error);
		stats.errors++;
		return stats;
	}
}

/**
 * Main function
 */
function main() {
	const sourceDir = process.argv[2] || "./src";
	console.log(`Starting translation transformation in ${sourceDir}`);

	const startTime = Date.now();
	const stats = processDirectory(sourceDir);
	const duration = ((Date.now() - startTime) / 1000).toFixed(2);

	console.log("\n===== Translation Transformation Complete =====");
	console.log(`⏱️  Time taken: ${duration} seconds`);
	console.log(`📁 Files processed: ${stats.processed}`);
	console.log(`✅ Files modified: ${stats.modified}`);
	console.log(`⏩ Files skipped: ${stats.skipped}`);
	console.log(`❌ Errors: ${stats.errors}`);

	if (CONFIG.createBackups && stats.modified > 0) {
		console.log(
			"\n⚠️  Backup files with '.bak' extension have been created for all modified files",
		);
		console.log("   Please review the changes before deleting the backups");
	}
}

// Run the script
main();
