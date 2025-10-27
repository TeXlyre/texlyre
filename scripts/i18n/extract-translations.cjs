const fs = require("node:fs");
const path = require("node:path");
const parser = require("@babel/parser");
const traverse = require("@babel/traverse").default;
const t = require("@babel/types");

const CONFIG = {
    extensions: [".tsx", ".jsx", ".ts"],
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

function normalizeText(text) {
    return text.replace(/\t/g, '').replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
}

function shouldTranslate(text) {
    if (!text || text.trim().length < CONFIG.minTextLength) return false;

    const normalizedText = normalizeText(text);

    if (normalizedText.length < CONFIG.minTextLength) return false;

    for (const pattern of CONFIG.ignorePatterns) {
        if (new RegExp(pattern).test(normalizedText)) return false;
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

function detectPluralPattern(text) {
    const patterns = [
        /\{count\}\s*(?:item|file|document|page|chat|message|user|project|folder|task|element|entry)s?/i,
        /(?:item|file|document|page|chat|message|user|project|folder|task|element|entry)s?\s*\{count\}/i,
    ];

    return patterns.some(pattern => pattern.test(text));
}

function extractOptionsLabels(optionsNode, translations, pluralKeys) {
    if (t.isArrayExpression(optionsNode)) {
        optionsNode.elements.forEach((option) => {
            if (t.isObjectExpression(option)) {
                option.properties.forEach((optProp) => {
                    if (t.isObjectProperty(optProp) &&
                        optProp.key.name === 'label' &&
                        t.isStringLiteral(optProp.value)) {

                        const text = optProp.value.value;
                        if (shouldTranslate(text)) {
                            const normalizedText = normalizeText(text);
                            if (detectPluralPattern(normalizedText)) {
                                pluralKeys.add(normalizedText);
                            }
                            if (!translations.has(normalizedText)) {
                                translations.set(normalizedText, normalizedText);
                            }
                        }
                    }
                });
            }
        });
    }
}

function extractFromRegisterSetting(path, translations, pluralKeys) {
    if (
        t.isIdentifier(path.node.callee) &&
        path.node.callee.name === "registerSetting" &&
        path.node.arguments.length > 0
    ) {
        const arg = path.node.arguments[0];

        if (t.isObjectExpression(arg)) {
            arg.properties.forEach((prop) => {
                if (!t.isObjectProperty(prop)) return;

                const key = prop.key.name;

                if (key === 'category' || key === 'subcategory' ||
                    key === 'label' || key === 'description') {

                    if (t.isStringLiteral(prop.value)) {
                        const text = prop.value.value;
                        if (shouldTranslate(text)) {
                            const normalizedText = normalizeText(text);
                            if (detectPluralPattern(normalizedText)) {
                                pluralKeys.add(normalizedText);
                            }
                            if (!translations.has(normalizedText)) {
                                translations.set(normalizedText, normalizedText);
                            }
                        }
                    }
                }

                if (key === 'options') {
                    extractOptionsLabels(prop.value, translations, pluralKeys);
                }
            });
        }
    }
}

function extractTranslations(sourceDir, outputFile) {
    const existingTranslations = loadExistingTranslations(outputFile);
    const translations = new Map(Object.entries(existingTranslations));
    const pluralKeys = new Set();

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

            const hasRegisterSetting = code.includes('registerSetting');

            traverse(ast, {
                JSXText(path) {
                    const text = path.node.value.trim();
                    if (shouldTranslate(text)) {
                        const normalizedText = normalizeText(text);
                        if (translations.has(normalizedText)) {
                            existingCount++;
                        } else {
                            translations.set(normalizedText, normalizedText);
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
                            const normalizedText = normalizeText(text);
                            if (translations.has(normalizedText)) {
                                existingCount++;
                            } else {
                                translations.set(normalizedText, normalizedText);
                                newCount++;
                            }
                        }
                    }
                },

                CallExpression(path) {
                    if (hasRegisterSetting) {
                        extractFromRegisterSetting(path, translations, pluralKeys);
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

    const existingKeys = Object.keys(existingTranslations);
    const mergedTranslations = { ...existingTranslations };

    for (const [key, value] of translations.entries()) {
        mergedTranslations[key] = value;
    }

    const translationObj = Object.fromEntries(
        Object.entries(mergedTranslations).sort(([a], [b]) => a.localeCompare(b)),
    );

    const outputDir = path.dirname(outputFile);
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    fs.writeFileSync(outputFile, JSON.stringify(translationObj, null, 2));

    if (pluralKeys.size > 0) {
        const pluralFile = outputFile.replace('.json', '.plural-hints.json');
        fs.writeFileSync(
            pluralFile,
            JSON.stringify(
                {
                    _meta: {
                        description: "Keys that may need plural forms in translations",
                        note: "Use format: 'key_one', 'key_few', 'key_many', 'key_other'",
                        example: "For 'Delete {count} Item', create: 'Delete {count} Item_one', 'Delete {count} Item_other'"
                    },
                    keys: Array.from(pluralKeys).sort()
                },
                null,
                2
            )
        );
        console.log(`\n📋 Detected ${pluralKeys.size} keys with potential plural forms`);
        console.log(`💾 Plural hints saved to: ${pluralFile}`);
    }

    console.log(`\n✅ Extraction complete!`);
    console.log(`📁 Files processed: ${fileCount}`);
    console.log(`📝 Total translations: ${Object.keys(translationObj).length}`);
    console.log(`🆕 New translations: ${newCount}`);
    console.log(`♻️  Existing translations preserved: ${existingKeys.length}`);
    console.log(`💾 Output written to: ${outputFile}`);
}

if (require.main === module) {
    const sourceDir = process.argv[2] || "./src";
    const outputFile = process.argv[3] || "./translations/locales/en.json";

    extractTranslations(sourceDir, outputFile);
}

module.exports = { extractTranslations };