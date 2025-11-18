const fs = require("node:fs");
const path = require("node:path");
const parser = require("@babel/parser");
const traverse = require("@babel/traverse").default;
const t = require("@babel/types");

const CONFIG = {
    extensions: [".tsx", ".jsx"],
    excludeDirs: ["node_modules", "dist", "build", ".git"],
    excludeFiles: ["i18n.ts", "i18n.js"],
    minTextLength: 3,
    excludeAttributes: ["className", "style", "key", "ref", "id", "data-", "aria-"],
};

function isExcludedAttribute(attrName) {
    return CONFIG.excludeAttributes.some(excluded =>
        attrName.startsWith(excluded)
    );
}

function isUserVisibleText(textParts) {
    const combined = textParts.join(' ').trim();

    if (combined.length < CONFIG.minTextLength) return false;
    if (/^[\/\.\-_]+$/.test(combined)) return false;
    if (/^https?:\/\//.test(combined)) return false;
    if (/^\d+(\.\d+)?$/.test(combined)) return false;
    if (/^[A-Z_]+$/.test(combined)) return false;

    return true;
}

function extractTextFromJSXChildren(children) {
    const parts = [];
    let hasExpression = false;

    for (const child of children) {
        if (t.isJSXText(child)) {
            const text = child.value.trim();
            if (text) {
                parts.push(text);
            }
        } else if (t.isJSXExpressionContainer(child)) {
            hasExpression = true;
            const expr = child.expression;

            if (t.isMemberExpression(expr) &&
                t.isIdentifier(expr.property) &&
                expr.property.name === 'length') {
                parts.push('{count}');
            } else if (t.isIdentifier(expr)) {
                parts.push(`{${expr.name}}`);
            } else if (t.isConditionalExpression(expr)) {
                if (t.isStringLiteral(expr.consequent) && t.isStringLiteral(expr.alternate)) {
                    const singular = expr.consequent.value;
                    const plural = expr.alternate.value;

                    if (isPluralPair(singular, plural)) {
                        return {
                            parts: [singular],
                            hasExpression: true,
                            isPluralTernary: true,
                            singular,
                            plural,
                        };
                    }
                }
                parts.push('{expression}');
            } else {
                parts.push('{expression}');
            }
        }
    }

    return { parts, hasExpression, isPluralTernary: false };
}

function isPluralPair(singular, plural) {
    const s = singular.toLowerCase().trim();
    const p = plural.toLowerCase().trim();

    if (s === p) return false;

    if (p === s + 's' || p === s + 'es' || p === s + 'ies') {
        return true;
    }

    const pluralPattern = /\b(\w+)s?\b/;
    const sMatch = s.match(pluralPattern);
    const pMatch = p.match(pluralPattern);

    if (sMatch && pMatch && sMatch[1] === pMatch[1]) {
        return true;
    }

    return false;
}

function detectDynamicContent(sourceDir, outputFile) {
    const dynamicPatterns = [];
    let fileCount = 0;

    function analyzeJSXElement(path, filePath) {
        const children = path.node.children;
        if (!children || children.length === 0) return;

        const { parts, hasExpression, isPluralTernary, singular, plural } = extractTextFromJSXChildren(children);

        if (!hasExpression) return;

        if (!isUserVisibleText(parts)) return;

        const suggestedKey = parts.join(' ').replace(/\s+/g, ' ').trim();

        if (isPluralTernary) {
            dynamicPatterns.push({
                file: filePath.replace(process.cwd(), ''),
                line: path.node.loc?.start.line,
                type: 'plural-ternary',
                confidence: 'high',
                original: `{condition ? "${singular}" : "${plural}"}`,
                suggested: singular.endsWith('s') ? singular.slice(0, -1) : singular,
                singular,
                plural,
            });
        } else if (suggestedKey.includes('{count}')) {
            dynamicPatterns.push({
                file: filePath.replace(process.cwd(), ''),
                line: path.node.loc?.start.line,
                type: 'count',
                confidence: 'high',
                original: parts.map(p => p.includes('{') ? '{expression}' : p).join(' '),
                suggested: suggestedKey,
            });
        } else if (suggestedKey.match(/\{[^}]+\}/)) {
            const varCount = (suggestedKey.match(/\{[^}]+\}/g) || []).length;

            if (varCount <= 2 && parts.some(p => !p.startsWith('{'))) {
                dynamicPatterns.push({
                    file: filePath.replace(process.cwd(), ''),
                    line: path.node.loc?.start.line,
                    type: 'interpolation',
                    confidence: 'medium',
                    original: parts.map(p => p.includes('{') ? '{expression}' : p).join(' '),
                    suggested: suggestedKey,
                });
            }
        }
    }

    function analyzeJSXAttribute(path, filePath) {
        const attrName = path.node.name.name;

        if (isExcludedAttribute(attrName)) return;

        const value = path.node.value;

        if (!t.isJSXExpressionContainer(value)) return;

        const expr = value.expression;

        if (t.isTemplateLiteral(expr)) {
            let templateString = '';
            let hasVariables = false;

            expr.quasis.forEach((quasi, i) => {
                templateString += quasi.value.raw;
                if (i < expr.expressions.length) {
                    const expression = expr.expressions[i];
                    hasVariables = true;

                    if (t.isMemberExpression(expression) &&
                        t.isIdentifier(expression.property) &&
                        expression.property.name === 'length') {
                        templateString += '{count}';
                    } else if (t.isIdentifier(expression)) {
                        templateString += `{${expression.name}}`;
                    } else {
                        templateString += '{var}';
                    }
                }
            });

            if (hasVariables && isUserVisibleText([templateString])) {
                dynamicPatterns.push({
                    file: filePath.replace(process.cwd(), ''),
                    line: path.node.loc?.start.line,
                    type: 'template-literal',
                    confidence: 'high',
                    attribute: attrName,
                    original: '`' + expr.quasis[0]?.value.raw + '...`',
                    suggested: templateString,
                });
            }
        }
    }

    function processFile(filePath) {
        const ext = path.extname(filePath);
        const fileName = path.basename(filePath);

        if (!CONFIG.extensions.includes(ext) || CONFIG.excludeFiles.includes(fileName)) {
            return;
        }

        console.log(`Analyzing ${filePath}...`);
        fileCount++;

        try {
            const code = fs.readFileSync(filePath, "utf8");
            const ast = parser.parse(code, {
                sourceType: "module",
                plugins: ["jsx", "typescript", "decorators-legacy", "classProperties"],
            });

            traverse(ast, {
                JSXElement(path) {
                    analyzeJSXElement(path, filePath);
                },

                JSXAttribute(path) {
                    analyzeJSXAttribute(path, filePath);
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

    const highConfidence = dynamicPatterns.filter(p => p.confidence === 'high');
    const mediumConfidence = dynamicPatterns.filter(p => p.confidence === 'medium');

    const outputDir = path.dirname(outputFile);
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    fs.writeFileSync(
        outputFile,
        JSON.stringify(
            {
                _meta: {
                    description: "Detected dynamic content that should be converted to i18n",
                    filesAnalyzed: fileCount,
                    patternsFound: dynamicPatterns.length,
                    highConfidence: highConfidence.length,
                    mediumConfidence: mediumConfidence.length,
                },
                highConfidence,
                mediumConfidence,
            },
            null,
            2
        )
    );

    console.log(`\n✅ Analysis complete!`);
    console.log(`📁 Files analyzed: ${fileCount}`);
    console.log(`🔍 Dynamic patterns found: ${dynamicPatterns.length}`);
    console.log(`   High confidence: ${highConfidence.length}`);
    console.log(`   Medium confidence: ${mediumConfidence.length}`);
    console.log(`💾 Results saved to: ${outputFile}`);

    if (highConfidence.length > 0) {
        console.log(`\n📋 High confidence patterns to convert:`);
        highConfidence.slice(0, 10).forEach(p => {
            console.log(`   ${p.file}:${p.line} [${p.type}]`);
            console.log(`   → "${p.suggested}"`);
        });
    }
}

if (require.main === module) {
    const sourceDir = process.argv[2] || "./src";
    const outputFile = process.argv[3] || "./translations/dynamic-patterns.json";

    detectDynamicContent(sourceDir, outputFile);
}

module.exports = { detectDynamicContent };