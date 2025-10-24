const fs = require("node:fs");
const path = require("node:path");
const parser = require("@babel/parser");
const traverse = require("@babel/traverse").default;
const t = require("@babel/types");

const CONFIG = {
    extensions: [".tsx", ".jsx"],
    excludeDirs: ["node_modules", "dist", "build", ".git"],
    excludeFiles: ["i18n.ts", "i18n.js"],
    minTextLength: 2,
    processAttributes: ["placeholder", "title", "alt", "aria-label"],
    ignorePatterns: [
        "^\\{.*\\}$",
        "^https?://",
        "^[\\w.-]+@[\\w.-]+\\.[a-zA-Z]{2,}$",
        "^\\d+(\\.\\d+)?$",
        "^[A-Z_]+$",
    ],
    excludeComponents: ["style", "script"],
    excludeVariableNames: ["className", "style", "key", "ref"],
};

function shouldTranslate(text) {
    if (!text || text.trim().length < CONFIG.minTextLength) return false;

    for (const pattern of CONFIG.ignorePatterns) {
        if (new RegExp(pattern).test(text.trim())) return false;
    }

    return true;
}

function loadExistingTranslations(outputFile) {
    try {
        if (fs.existsSync(outputFile)) {
            const content = fs.readFileSync(outputFile, "utf8");
            return JSON.parse(content);
        }
    } catch (error) {
        console.warn(`⚠️  Could not load existing translations: ${error.message}`);
    }
    return {};
}

function extractTranslations(sourceDir, outputFile) {
    const existingTranslations = loadExistingTranslations(outputFile);
    const translations = new Map(Object.entries(existingTranslations));

    let fileCount = 0;
    let newCount = 0;
    let existingCount = 0;

    function processFile(filePath) {
        const ext = path.extname(filePath);
        const fileName = path.basename(filePath);

        if (
            !CONFIG.extensions.includes(ext) ||
            CONFIG.excludeFiles.includes(fileName)
        ) {
            return;
        }

        console.log(`Extracting from ${filePath}...`);
        fileCount++;

        try {
            const code = fs.readFileSync(filePath, "utf8");
            const ast = parser.parse(code, {
                sourceType: "module",
                plugins: ["jsx", "typescript", "decorators-legacy", "classProperties"],
            });

            traverse(ast, {
                JSXText(path) {
                    const text = path.node.value.trim();
                    if (shouldTranslate(text)) {
                        if (translations.has(text)) {
                            existingCount++;
                        } else {
                            translations.set(text, text);
                            newCount++;
                        }
                    }
                },

                JSXAttribute(path) {
                    if (
                        CONFIG.processAttributes.includes(path.node.name.name) &&
                        t.isStringLiteral(path.node.value)
                    ) {
                        const text = path.node.value.value;
                        if (shouldTranslate(text)) {
                            if (translations.has(text)) {
                                existingCount++;
                            } else {
                                translations.set(text, text);
                                newCount++;
                            }
                        }
                    }
                },
            });
        } catch (error) {
            console.error(`Error processing ${filePath}:`, error.message);
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
        } catch (error) {
            console.error(`Error reading directory ${directory}:`, error);
        }
    }

    processDirectory(sourceDir);

    const translationObj = Object.fromEntries(
        Array.from(translations.entries()).sort(),
    );

    const outputDir = path.dirname(outputFile);
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    fs.writeFileSync(outputFile, JSON.stringify(translationObj, null, 2));

    console.log(`\n✅ Extraction complete!`);
    console.log(`📁 Files processed: ${fileCount}`);
    console.log(`📝 Total translations: ${translations.size}`);
    console.log(`🆕 New translations: ${newCount}`);
    console.log(`♻️  Existing translations preserved: ${existingCount}`);
    console.log(`💾 Output written to: ${outputFile}`);
}

if (require.main === module) {
    const sourceDir = process.argv[2] || "./src";
    const outputFile = process.argv[3] || "./translations/en.json";

    extractTranslations(sourceDir, outputFile);
}

module.exports = { extractTranslations };