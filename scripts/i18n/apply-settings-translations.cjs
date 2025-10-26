const fs = require("node:fs");
const path = require("node:path");
const parser = require("@babel/parser");
const traverse = require("@babel/traverse").default;
const generate = require("@babel/generator").default;
const t = require("@babel/types");
const { hasTranslationImport, injectImportIntoCode } = require("./import-manager.cjs");

const CONFIG = {
    extensions: [".tsx", ".ts"],
    excludeDirs: ["node_modules", "dist", "build", ".git"],
    createBackups: true,
    dryRun: false,
};

function wrapWithT(node) {
    if (t.isStringLiteral(node)) {
        return t.callExpression(
            t.identifier('t'),
            [t.stringLiteral(node.value)]
        );
    }
    return node;
}

function isAlreadyWrapped(node) {
    return t.isCallExpression(node) &&
        t.isIdentifier(node.callee) &&
        node.callee.name === 't';
}

function applySettingsTranslations(filePath, options = {}) {
    const config = { ...CONFIG, ...options };

    try {
        const code = fs.readFileSync(filePath, "utf8");

        if (!code.includes('registerSetting')) {
            return { success: true, modified: false, transformCount: 0 };
        }

        console.log(`Processing ${filePath}...`);

        const ast = parser.parse(code, {
            sourceType: "module",
            plugins: ["jsx", "typescript", "decorators-legacy", "classProperties"],
        });

        const hadImport = hasTranslationImport(ast);
        let modified = false;
        let transformCount = 0;

        traverse(ast, {
            CallExpression(path) {
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

                                if (t.isStringLiteral(prop.value) && !isAlreadyWrapped(prop.value)) {
                                    prop.value = wrapWithT(prop.value);
                                    modified = true;
                                    transformCount++;
                                }
                            }

                            if (key === 'options') {
                                if (t.isArrayExpression(prop.value)) {
                                    prop.value.elements.forEach((option) => {
                                        if (t.isObjectExpression(option)) {
                                            option.properties.forEach((optProp) => {
                                                if (t.isObjectProperty(optProp) &&
                                                    optProp.key.name === 'label' &&
                                                    !isAlreadyWrapped(optProp.value)) {

                                                    optProp.value = wrapWithT(optProp.value);
                                                    modified = true;
                                                    transformCount++;
                                                }
                                            });
                                        }
                                    });
                                } else if (t.isCallExpression(prop.value)) {
                                    const callExpr = prop.value;
                                    if (
                                        t.isMemberExpression(callExpr.callee) &&
                                        t.isIdentifier(callExpr.callee.property) &&
                                        callExpr.callee.property.name === 'map'
                                    ) {
                                        const mapCallback = callExpr.arguments[0];
                                        if (
                                            t.isArrowFunctionExpression(mapCallback) ||
                                            t.isFunctionExpression(mapCallback)
                                        ) {
                                            traverse(
                                                mapCallback,
                                                {
                                                    ObjectExpression(innerPath) {
                                                        innerPath.node.properties.forEach((innerProp) => {
                                                            if (
                                                                t.isObjectProperty(innerProp) &&
                                                                t.isIdentifier(innerProp.key) &&
                                                                innerProp.key.name === 'label'
                                                            ) {
                                                                if (t.isMemberExpression(innerProp.value)) {
                                                                    if (!isAlreadyWrapped(innerPath.parent)) {
                                                                        innerProp.value = t.callExpression(
                                                                            t.identifier('t'),
                                                                            [innerProp.value]
                                                                        );
                                                                        modified = true;
                                                                        transformCount++;
                                                                    }
                                                                } else if (!isAlreadyWrapped(innerProp.value)) {
                                                                    innerProp.value = wrapWithT(innerProp.value);
                                                                    modified = true;
                                                                    transformCount++;
                                                                }
                                                            }
                                                        });
                                                    }
                                                },
                                                path.scope,
                                                path
                                            );
                                        }
                                    }
                                }
                            }
                        });
                    }
                }
            },
        });

        if (modified) {
            const output = generate(
                ast,
                {
                    retainLines: true,
                    compact: false,
                },
                code,
            );

            let finalCode = output.code;

            if (!hadImport) {
                finalCode = injectImportIntoCode(finalCode);
            }

            if (config.dryRun) {
                console.log(
                    `✓ [DRY RUN] Would transform ${transformCount} settings strings in ${filePath}`,
                );
                return { success: true, modified: true, transformCount, dryRun: true };
            }

            if (config.createBackups) {
                fs.writeFileSync(`${filePath}.bak`, code);
            }

            fs.writeFileSync(filePath, finalCode);
            console.log(`✅ Transformed ${transformCount} settings strings in ${filePath}`);
            return { success: true, modified: true, transformCount };
        }

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

                    if (CONFIG.extensions.includes(ext)) {
                        stats.processed++;
                        const result = applySettingsTranslations(fullPath, options);

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

module.exports = { applySettingsTranslations, processDirectory };