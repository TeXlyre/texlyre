// scripts/generate-configs.ts
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

async function loadConfig() {
    const configPath = path.join(rootDir, 'texlyre.config.ts');
    const { default: config } = await import(configPath);
    return config;
}

function deepMerge(target: any, source: any): any {
    const result = { ...target };

    for (const key in source) {
        if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
            result[key] = deepMerge(result[key] || {}, source[key]);
        } else if (source[key] !== undefined) {
            result[key] = source[key];
        }
    }

    return result;
}

function flattenSettings(settings: any, prefix = ''): Record<string, any> {
    const result: Record<string, any> = {};

    for (const [key, value] of Object.entries(settings)) {
        const newKey = prefix ? `${prefix}-${key.replace(/([A-Z])/g, '-$1').toLowerCase()}` : key;

        if (value && typeof value === 'object' && !Array.isArray(value)) {
            Object.assign(result, flattenSettings(value, newKey));
        } else {
            result[newKey] = value;
        }
    }

    return result;
}

function flattenProperties(properties: any): Record<string, any> {
    const result: Record<string, any> = {};

    for (const [scope, props] of Object.entries(properties)) {
        for (const [key, value] of Object.entries(props as Record<string, any>)) {
            const flatKey = `${key.replace(/([A-Z])/g, '-$1').toLowerCase()}:${scope}`;
            result[flatKey] = value;
        }
    }

    return result;
}

function generatePluginsConfig(config: any) {
    const allPlugins: string[] = [];

    for (const [type, plugins] of Object.entries(config.plugins)) {
        for (const plugin of plugins as string[]) {
            allPlugins.push(`${type}/${plugin}`);
        }
    }

    const content = `// plugins.config.js
export default {
\tplugins: ${JSON.stringify(allPlugins, null, 2).replace(/\n/g, '\n\t')},
};
`;

    fs.writeFileSync(path.join(rootDir, 'plugins.config.js'), content);
}

function generateViteConfig(config: any) {
    const viteConfigPath = path.join(rootDir, 'vite.config.ts');
    let viteContent = fs.readFileSync(viteConfigPath, 'utf8');

    viteContent = viteContent.replace(
        /const basePath = ['"`][^'"`]*['"`];/,
        `const basePath = "${config.baseUrl}";`
    );

    fs.writeFileSync(viteConfigPath, viteContent);
}

function generateIndexHtml(config: any) {
    const indexPath = path.join(rootDir, 'index.html');
    let indexContent = fs.readFileSync(indexPath, 'utf8');

    indexContent = indexContent.replace(
        /<title>.*?<\/title>/,
        `<title>${config.title}</title>`
    );

    indexContent = indexContent.replace(
        /rel="icon"[^>]*>/,
        `rel="icon" type="image/png" href="${config.favicon}" />`
    );

    if (config.pwa?.enabled) {
        indexContent = indexContent.replace(
            /name="theme-color" content="[^"]*"/,
            `name="theme-color" content="${config.pwa.themeColor}"`
        );
    }

    fs.writeFileSync(indexPath, indexContent);
}

function generateUserdataFiles(config: any) {
    const defaultUserdata = {
        settings: flattenSettings(config.userdata.default.settings),
        properties: flattenProperties(config.userdata.default.properties),
        secrets: config.userdata.default.secrets,
    };

    fs.writeFileSync(
        path.join(rootDir, 'userdata.json'),
        JSON.stringify(defaultUserdata, null, 2)
    );

    if (config.userdata.local) {
        const mergedSettings = deepMerge(
            config.userdata.default.settings,
            config.userdata.local.settings || {}
        );
        const mergedProperties = deepMerge(
            config.userdata.default.properties,
            config.userdata.local.properties || {}
        );
        const mergedSecrets = deepMerge(
            config.userdata.default.secrets,
            config.userdata.local.secrets || {}
        );

        const localUserdata = {
            settings: flattenSettings(mergedSettings),
            properties: flattenProperties(mergedProperties),
            secrets: mergedSecrets,
        };

        fs.writeFileSync(
            path.join(rootDir, 'userdata.local.json'),
            JSON.stringify(localUserdata, null, 2)
        );
    }
}

async function main() {
    console.log('Loading texlyre.config.ts...');
    const config = await loadConfig();

    console.log('Generating plugins.config.js...');
    generatePluginsConfig(config);

    console.log('Updating vite.config.ts basePath...');
    generateViteConfig(config);

    console.log('Updating index.html...');
    generateIndexHtml(config);

    console.log('Generating userdata files...');
    generateUserdataFiles(config);

    console.log('All configs generated successfully!');
}

main().catch(console.error);