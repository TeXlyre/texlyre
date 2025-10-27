const t = require("@babel/types");
const traverse = require("@babel/traverse").default;

function hasTranslationImport(ast) {
    let hasImport = false;

    traverse(ast, {
        ImportDeclaration(path) {
            const source = path.node.source.value;
            if (source === '@/i18n' || source === '../i18n' || source === '../../i18n') {
                const specifiers = path.node.specifiers;
                if (specifiers.some(spec =>
                    t.isImportSpecifier(spec) && spec.imported.name === 't'
                )) {
                    hasImport = true;
                }
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

    const body = ast.program.body;

    if (body.length === 0) {
        body.unshift(importDeclaration);
        return;
    }

    body.splice(0, 0, importDeclaration);
}

function injectImportIntoCode(code) {
    const lines = code.split('\n');
    const importStatement = 'import { t } from "@/i18n";';

    let insertIndex = 0;
    let foundFirstNonComment = false;

    for (let i = 0; i < lines.length; i++) {
        const trimmedLine = lines[i].trim();

        if (trimmedLine === '') {
            if (!foundFirstNonComment) {
                insertIndex = i + 1;
            }
            continue;
        }

        if (trimmedLine.startsWith('//') || trimmedLine.startsWith('/*') || trimmedLine.startsWith('*')) {
            if (!foundFirstNonComment) {
                insertIndex = i + 1;
            }
            continue;
        }

        if (trimmedLine.endsWith('*/')) {
            if (!foundFirstNonComment) {
                insertIndex = i + 1;
            }
            continue;
        }

        foundFirstNonComment = true;
        break;
    }

    if (!foundFirstNonComment && insertIndex < lines.length) {
    }

    lines.splice(insertIndex, 0, importStatement);

    return lines.join('\n');
}

module.exports = { hasTranslationImport, addTranslationImport, injectImportIntoCode };