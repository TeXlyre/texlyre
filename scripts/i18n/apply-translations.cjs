const fs = require("node:fs");
const path = require("node:path");
const parser = require("@babel/parser");
const traverse = require("@babel/traverse").default;
const generate = require("@babel/generator").default;
const t = require("@babel/types");
const { validateTransformedCode } = require("./validate-transforms.cjs");

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
    createBackups: true,
    dryRun: false,
};

function shouldTranslate(text) {
    if (!text || text.trim().length < CONFIG.minTextLength) return false;

    for (const pattern of CONFIG.ignorePatterns) {
        if (new RegExp(pattern).test(text.trim())) return false;
    }

    return true;
}

function hasTranslationImport(ast) {
    let hasImport = false;

    traverse(ast, {
        ImportDeclaration(path) {
            const source = path.node.source.value;
            if (source.includes("i18n") || source === "@/i18n") {
                hasImport = true;
            }
        },
    });

    return hasImport;
}

function addTranslationImport(ast) {
    const importDeclaration = t.importDeclaration(
        [t.importSpecifier(t.identifier("t"), t.identifier("t"))],
        t.stringLiteral("@/i18n"),
    );

    ast.program.body.unshift(importDeclaration);
}

function createTranslationCall(text) {
    const cleanText = text.trim().replace(/\s+/g, " ");
    return t.callExpression(t.identifier("t"), [t.stringLiteral(cleanText)]);
}

function isAlreadyWrappedInTranslation(path) {
    let parent = path.parent;

    // Check if parent is a JSXExpressionContainer
    if (t.isJSXExpressionContainer(parent)) {
        const expression = parent.expression;

        // Check if expression is a t() call
        if (t.isCallExpression(expression)) {
            if (t.isIdentifier(expression.callee) && expression.callee.name === "t") {
                return true;
            }
        }
    }

    // Check if parent is already a t() call
    if (t.isCallExpression(parent)) {
        if (t.isIdentifier(parent.callee) && parent.callee.name === "t") {
            return true;
        }
    }

    return false;
}

function isInsideJSXExpressionContainer(path) {
    let parent = path.parent;
    return t.isJSXExpressionContainer(parent);
}

function applyTranslations(filePath, options = {}) {
    const config = { ...CONFIG, ...options };

    console.log(`Processing ${filePath}...`);

    try {
        const code = fs.readFileSync(filePath, "utf8");

        const ast = parser.parse(code, {
            sourceType: "module",
            plugins: ["jsx", "typescript", "decorators-legacy", "classProperties"],
            tokens: true,
        });

        let modified = false;
        let transformCount = 0;

        traverse(ast, {
            JSXText(path) {
                if (isAlreadyWrappedInTranslation(path)) {
                    return;
                }

                const text = path.node.value.trim();
                if (shouldTranslate(text)) {
                    path.replaceWith(
                        t.jsxExpressionContainer(createTranslationCall(text)),
                    );
                    modified = true;
                    transformCount++;
                }
            },

            JSXAttribute(path) {
                if (isAlreadyWrappedInTranslation(path)) {
                    return;
                }

                if (
                    config.processAttributes.includes(path.node.name.name) &&
                    t.isStringLiteral(path.node.value)
                ) {
                    const text = path.node.value.value;
                    if (shouldTranslate(text)) {
                        path.node.value = t.jsxExpressionContainer(
                            createTranslationCall(text),
                        );
                        modified = true;
                        transformCount++;
                    }
                }
            },

            // Skip content already inside t() calls
            CallExpression(path) {
                if (t.isIdentifier(path.node.callee) &&
                    (path.node.callee.name === "t" || path.node.callee.name === "i")) {
                    path.skip();
                }
            },
        });

        if (modified) {
            if (!hasTranslationImport(ast)) {
                addTranslationImport(ast);
            }

            const output = generate(
                ast,
                {
                    retainLines: true,
                    compact: false,
                    jsescOption: { quotes: "single" },
                },
                code,
            );

            const validation = validateTransformedCode(code, output.code, filePath);

            if (!validation.valid) {
                console.error(`❌ Validation failed for ${filePath}:`);
                validation.errors.forEach((err) => console.error(`   - ${err}`));
                return { success: false, modified: false, transformCount: 0 };
            }

            if (config.dryRun) {
                console.log(
                    `✓ [DRY RUN] Would transform ${transformCount} items in ${filePath}`,
                );
                return { success: true, modified: true, transformCount, dryRun: true };
            }

            if (config.createBackups) {
                fs.writeFileSync(`${filePath}.bak`, code);
            }

            fs.writeFileSync(filePath, output.code);
            console.log(`✅ Transformed ${transformCount} items in ${filePath}`);
            return { success: true, modified: true, transformCount };
        }

        console.log(`⏩ No changes needed in ${filePath}`);
        return { success: true, modified: false, transformCount: 0 };
    } catch (error) {
        console.error(`❌ Error processing ${filePath}:`, error.message);
        return { success: false, modified: false, transformCount: 0, error };
    }
}

function processDirectory(directory, options = {}) {
    const stats = {
        processed: 0,
        modified: 0,
        skipped: 0,
        errors: 0,
        totalTransforms: 0,
    };

    function processDir(dir) {
        try {
            const entries = fs.readdirSync(dir, { withFileTypes: true });

            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);

                if (entry.isDirectory()) {
                    if (!CONFIG.excludeDirs.includes(entry.name)) {
                        processDir(fullPath);
                    }
                } else if (entry.isFile()) {
                    const ext = path.extname(fullPath);
                    const fileName = path.basename(fullPath);

                    if (
                        CONFIG.extensions.includes(ext) &&
                        !CONFIG.excludeFiles.includes(fileName)
                    ) {
                        stats.processed++;
                        const result = applyTranslations(fullPath, options);

                        if (result.success && result.modified) {
                            stats.modified++;
                            stats.totalTransforms += result.transformCount;
                        }
                        if (!result.success) {
                            stats.errors++;
                        }
                    } else {
                        stats.skipped++;
                    }
                }
            }
        } catch (error) {
            console.error(`❌ Error reading directory ${dir}:`, error);
            stats.errors++;
        }
    }

    processDir(directory);
    return stats;
}

module.exports = { applyTranslations, processDirectory };