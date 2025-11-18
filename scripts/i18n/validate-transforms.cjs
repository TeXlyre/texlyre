const parser = require("@babel/parser");
const fs = require("node:fs");

function validateTransformedCode(originalCode, transformedCode, filePath) {
    const errors = [];

    try {
        parser.parse(transformedCode, {
            sourceType: "module",
            plugins: ["jsx", "typescript", "decorators-legacy", "classProperties"],
            errorRecovery: true,
        });
    } catch (error) {
        errors.push(`Syntax error: ${error.message}`);
        return { valid: false, errors };
    }

    const originalImports = (originalCode.match(/^import .+$/gm) || []).length;
    const transformedImports = (transformedCode.match(/^import .+$/gm) || []).length;

    if (transformedImports < originalImports) {
        errors.push("Import statements were removed");
    }

    const originalExports = (originalCode.match(/^export .+$/gm) || []).length;
    const transformedExports = (transformedCode.match(/^export .+$/gm) || []).length;

    if (transformedExports !== originalExports) {
        errors.push("Export statements were modified");
    }

    const jsxTagPattern = /<[A-Z][a-zA-Z0-9]*|<\/[A-Z][a-zA-Z0-9]*>/g;
    const originalJsxCount = (originalCode.match(jsxTagPattern) || []).length;
    const transformedJsxCount = (transformedCode.match(jsxTagPattern) || []).length;

    if (Math.abs(transformedJsxCount - originalJsxCount) > originalJsxCount * 0.1) {
        errors.push("JSX structure significantly changed");
    }

    return {
        valid: errors.length === 0,
        errors,
    };
}

module.exports = { validateTransformedCode };