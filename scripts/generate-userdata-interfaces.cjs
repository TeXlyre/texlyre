// scripts/generate-userdata-interfaces.cjs
const fs = require('node:fs');
const path = require('node:path');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const t = require('@babel/types');

const SETTINGS_HIERARCHY_DEPTH = 0;

const CONFIG = {
    extensions: ['.tsx', '.ts'],
    excludeDirs: ['node_modules', 'dist', 'build', '.git'],
    sourceDirs: ['src', 'extras']
};

function extractSettingsAndProperties(sourceDir) {
    const settingsMap = new Map();
    const propertiesMap = new Map();

    function processFile(filePath) {
        const ext = path.extname(filePath);
        if (!CONFIG.extensions.includes(ext)) return;

        try {
            const code = fs.readFileSync(filePath, 'utf8');
            if (!code.includes('registerSetting') &&
                !code.includes('registerProperty') &&
                !code.includes('Setting[]')) return;

            const ast = parser.parse(code, {
                sourceType: 'module',
                plugins: ['jsx', 'typescript', 'decorators-legacy', 'classProperties']
            });

            traverse(ast, {
                CallExpression(path) {
                    const callee = path.node.callee;
                    const isSetting = (t.isIdentifier(callee) && callee.name === 'registerSetting') ||
                        (t.isMemberExpression(callee) && t.isIdentifier(callee.property) &&
                            callee.property.name === 'registerSetting');
                    const isProperty = (t.isIdentifier(callee) && callee.name === 'registerProperty') ||
                        (t.isMemberExpression(callee) && t.isIdentifier(callee.property) &&
                            callee.property.name === 'registerProperty');

                    if (isSetting && t.isObjectExpression(path.node.arguments[0])) {
                        const setting = extractSettingInfo(path.node.arguments[0], filePath);
                        if (setting && !settingsMap.has(setting.id)) {
                            settingsMap.set(setting.id, setting);
                            console.log(`  Found setting: ${setting.id}`);
                        }
                    }

                    if (isProperty && t.isObjectExpression(path.node.arguments[0])) {
                        const property = extractPropertyInfo(path.node.arguments[0], filePath);
                        if (property) {
                            const key = `${property.id}:${property.category}`;
                            if (!propertiesMap.has(key)) {
                                propertiesMap.set(key, property);
                                console.log(`  Found property: ${property.id} (${property.category})`);
                            }
                        }
                    }
                },

                ExportNamedDeclaration(path) {
                    const declaration = path.node.declaration;
                    if (!t.isVariableDeclaration(declaration)) return;

                    for (const declarator of declaration.declarations) {
                        if (t.isVariableDeclarator(declarator) && t.isArrowFunctionExpression(declarator.init)) {
                            const returnType = declarator.init.returnType;
                            const isSettingsArray = returnType &&
                                t.isTSTypeAnnotation(returnType) &&
                                t.isTSArrayType(returnType.typeAnnotation) &&
                                t.isTSTypeReference(returnType.typeAnnotation.elementType) &&
                                t.isIdentifier(returnType.typeAnnotation.elementType.typeName) &&
                                returnType.typeAnnotation.elementType.typeName.name.includes('Setting');

                            if (isSettingsArray && t.isArrayExpression(declarator.init.body)) {
                                for (const element of declarator.init.body.elements) {
                                    if (t.isObjectExpression(element)) {
                                        const setting = extractSettingInfo(element, filePath);
                                        if (setting && !settingsMap.has(setting.id)) {
                                            settingsMap.set(setting.id, setting);
                                            console.log(`  Found setting: ${setting.id}`);
                                        }
                                    }
                                }
                            }
                        }
                    }
                },

                FunctionDeclaration(path) {
                    const returnType = path.node.returnType;
                    const isSettingsArray = returnType &&
                        t.isTSTypeAnnotation(returnType) &&
                        t.isTSArrayType(returnType.typeAnnotation) &&
                        t.isTSTypeReference(returnType.typeAnnotation.elementType) &&
                        t.isIdentifier(returnType.typeAnnotation.elementType.typeName) &&
                        returnType.typeAnnotation.elementType.typeName.name.includes('Setting');

                    if (isSettingsArray && t.isBlockStatement(path.node.body)) {
                        path.traverse({
                            ReturnStatement(returnPath) {
                                if (t.isArrayExpression(returnPath.node.argument)) {
                                    for (const element of returnPath.node.argument.elements) {
                                        if (t.isObjectExpression(element)) {
                                            const setting = extractSettingInfo(element, filePath);
                                            if (setting && !settingsMap.has(setting.id)) {
                                                settingsMap.set(setting.id, setting);
                                                console.log(`  Found setting: ${setting.id}`);
                                            }
                                        }
                                    }
                                }
                            }
                        });
                    }
                }
            });
        } catch (error) {
            console.error(`Error processing ${filePath}:`, error.message);
        }
    }

    function processDirectory(directory) {
        const entries = fs.readdirSync(directory, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(directory, entry.name);
            if (entry.isDirectory() && !CONFIG.excludeDirs.includes(entry.name)) {
                processDirectory(fullPath);
            } else if (entry.isFile()) {
                processFile(fullPath);
            }
        }
    }

    processDirectory(sourceDir);
    return {
        settings: Array.from(settingsMap.values()),
        properties: Array.from(propertiesMap.values())
    };
}

function extractSettingInfo(node, filePath) {
    let id = null, type = null, defaultValue = null;

    for (const prop of node.properties) {
        if (!t.isObjectProperty(prop) || !t.isIdentifier(prop.key)) continue;

        if (prop.key.name === 'id' && t.isStringLiteral(prop.value)) {
            id = prop.value.value;
        } else if (prop.key.name === 'type' && t.isStringLiteral(prop.value)) {
            type = prop.value.value;
        } else if (prop.key.name === 'defaultValue') {
            defaultValue = extractValue(prop.value);
        }
    }

    return id ? { id, type: type || 'unknown', defaultValue, filePath } : null;
}

function extractPropertyInfo(node, filePath) {
    let id = null, category = null, subcategory = undefined, defaultValue = null;

    for (const prop of node.properties) {
        if (!t.isObjectProperty(prop) || !t.isIdentifier(prop.key)) continue;

        const key = prop.key.name;
        if (key === 'id' && t.isStringLiteral(prop.value)) {
            id = prop.value.value;
        } else if (key === 'category' && t.isStringLiteral(prop.value)) {
            category = prop.value.value;
        } else if (key === 'subcategory' && t.isStringLiteral(prop.value)) {
            subcategory = prop.value.value;
        } else if (key === 'defaultValue') {
            defaultValue = extractValue(prop.value);
        }
    }

    return (id && category) ? { id, category, subcategory, defaultValue, filePath } : null;
}

function extractValue(node) {
    if (t.isStringLiteral(node)) return node.value;
    if (t.isNumericLiteral(node)) return node.value;
    if (t.isBooleanLiteral(node)) return node.value;
    if (t.isNullLiteral(node)) return null;
    if (t.isObjectExpression(node)) {
        const obj = {};
        for (const prop of node.properties) {
            if (t.isObjectProperty(prop) && t.isIdentifier(prop.key)) {
                obj[prop.key.name] = extractValue(prop.value);
            }
        }
        return obj;
    }
    if (t.isArrayExpression(node)) {
        return node.elements.map(el => el ? extractValue(el) : null);
    }
    return 'unknown';
}

function buildNestedObject(items, depth = SETTINGS_HIERARCHY_DEPTH) {
    if (depth === 0) {
        const flat = {};
        for (const item of items) {
            const key = toCamelCase(item.id);
            flat[key] = item.defaultValue;
        }
        return flat;
    }

    const result = {};
    const processed = new Set();

    function findCommonPrefix(ids) {
        if (ids.length === 0) return null;

        const prefixCandidates = new Map();

        for (const id of ids) {
            const parts = id.split('-');
            for (let i = 1; i < parts.length; i++) {
                const prefix = parts.slice(0, i).join('-');
                if (!prefixCandidates.has(prefix)) {
                    prefixCandidates.set(prefix, new Set());
                }
                prefixCandidates.get(prefix).add(id);
            }
        }

        for (const [prefix, matchingIds] of prefixCandidates.entries()) {
            if (matchingIds.size >= 2) {
                const distinctChildren = new Set();
                const prefixParts = prefix.split('-');

                for (const id of matchingIds) {
                    const parts = id.split('-');
                    if (parts.length > prefixParts.length) {
                        distinctChildren.add(parts[prefixParts.length]);
                    }
                }

                if (distinctChildren.size >= 2) {
                    return { prefix, ids: Array.from(matchingIds) };
                }
            }
        }

        return null;
    }

    function buildLevel(itemsAtLevel, currentDepth) {
        if (currentDepth >= depth) {
            const flat = {};
            for (const item of itemsAtLevel) {
                const key = toCamelCase(item.id);
                flat[key] = item.defaultValue;
            }
            return flat;
        }

        const levelResult = {};
        const remaining = [...itemsAtLevel];

        while (remaining.length > 0) {
            const commonPrefixData = findCommonPrefix(remaining.map(i => i.id));

            if (!commonPrefixData) {
                for (const item of remaining) {
                    const key = toCamelCase(item.id);
                    levelResult[key] = item.defaultValue;
                }
                break;
            }

            const { prefix, ids } = commonPrefixData;
            const prefixKey = toCamelCase(prefix);
            const groupedItems = itemsAtLevel.filter(item => ids.includes(item.id));

            const nestedItems = groupedItems.map(item => ({
                ...item,
                id: item.id.substring(prefix.length + 1)
            }));

            levelResult[prefixKey] = buildLevel(nestedItems, currentDepth + 1);

            for (const id of ids) {
                const idx = remaining.findIndex(i => i.id === id);
                if (idx !== -1) {
                    remaining.splice(idx, 1);
                    processed.add(id);
                }
            }
        }

        return levelResult;
    }

    return buildLevel(items, 0);
}

function toCamelCase(str) {
    return str.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

function inferTypeFromValue(value) {
    if (value === null || value === undefined || value === 'unknown') return 'any';
    if (typeof value === 'string') return 'string';
    if (typeof value === 'number') return 'number';
    if (typeof value === 'boolean') return 'boolean';
    if (Array.isArray(value)) {
        return value.length === 0 ? 'any[]' : `${inferTypeFromValue(value[0])}[]`;
    }
    if (typeof value === 'object') return 'Record<string, any>';
    return 'any';
}

function generateSettingsInterface(settings) {
    return generateInterfaceFromObject('UserDataSettings', buildNestedObject(settings));
}

function generatePropertiesInterface(properties) {
    let result = 'export interface UserDataProperties {\n';
    result += '  global?: {\n';

    const seenProps = new Set();
    for (const prop of properties) {
        const propName = toCamelCase(prop.id);
        if (seenProps.has(propName)) {
            console.warn(`⚠️  Duplicate property: ${propName}`);
            continue;
        }
        seenProps.add(propName);
        result += `    ${propName}?: ${inferTypeFromValue(prop.defaultValue)};\n`;
    }

    result += '  };\n';
    result += '}';
    return result;
}

function generateInterfaceFromObject(name, obj, indent = 0) {
    const spaces = '  '.repeat(indent);
    let result = `${spaces}export interface ${name} {\n`;

    for (const [key, value] of Object.entries(obj)) {
        if (typeof value === 'object' && !Array.isArray(value) && value !== null && Object.keys(value).length > 0) {
            result += `${spaces}  ${key}?: {\n`;
            result += generateObjectProperties(value, indent + 2);
            result += `${spaces}  };\n`;
        } else {
            result += `${spaces}  ${key}?: ${inferTypeFromValue(value)};\n`;
        }
    }

    result += `${spaces}}\n`;
    return result;
}

function generateObjectProperties(obj, indent) {
    const spaces = '  '.repeat(indent);
    let result = '';

    for (const [key, value] of Object.entries(obj)) {
        if (typeof value === 'object' && !Array.isArray(value) && value !== null && Object.keys(value).length > 0) {
            result += `${spaces}${key}?: {\n`;
            result += generateObjectProperties(value, indent + 1);
            result += `${spaces}};\n`;
        } else {
            result += `${spaces}${key}?: ${inferTypeFromValue(value)};\n`;
        }
    }

    return result;
}

function main() {
    const rootDir = path.join(__dirname, '..');
    const allSettings = [];
    const allProperties = [];

    for (const sourceDir of CONFIG.sourceDirs) {
        const fullPath = path.join(rootDir, sourceDir);
        console.log(`\nScanning ${sourceDir}...`);
        const { settings, properties } = extractSettingsAndProperties(fullPath);
        allSettings.push(...settings);
        allProperties.push(...properties);
    }

    console.log(`\n✅ Found ${allSettings.length} unique settings`);
    console.log(`✅ Found ${allProperties.length} unique properties`);

    if (allSettings.length === 0 && allProperties.length === 0) {
        console.log('\n⚠️  No settings or properties found');
        return;
    }

    const output = `// This file is automatically generated. Do not edit directly.
// Generated on: ${new Date().toISOString()}
// Settings found: ${allSettings.length}
// Properties found: ${allProperties.length}

${generateSettingsInterface(allSettings)}

${generatePropertiesInterface(allProperties)}

`;

    const outputPath = path.join(rootDir, 'src', 'types', 'userdata.ts');
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, output);

    console.log(`\n💾 Generated ${outputPath}`);
}

if (require.main === module) {
    main();
}

module.exports = { main };