// scripts/update-sw-version.js
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function loadConfig() {
	const configPath = join(__dirname, '..', 'texlyre.config.ts');
	const { default: config } = await import(configPath);
	return config;
}

function unique(values) {
	return [...new Set(values.filter(Boolean))];
}

function getHostname(value) {
	try {
		return new URL(value).hostname;
	} catch {
		return null;
	}
}

const packageJson = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8'));
const version = packageJson.version;

const config = await loadConfig();
const basePath = config.baseUrl;

const generatedAt = new Date().toISOString();

const configUrlHostname = getHostname(config.url);

const airgapAllowedDomains = unique([
	configUrlHostname,
	...(config.airgap?.allowedDomains ?? []),
]);

const airgapAllowedProtocols = unique([
	...(config.airgap?.allowedProtocols ?? ['https:', 'http:', 'wss:', 'ws:']),
]);

const generatedBlock = `// These constants are automatically generated. Do not edit directly.
// Generated on: ${generatedAt}
const CACHE_NAME = \`texlyre-v${version}\`;
const BASE_PATH = '${basePath}';
const FONTS_CACHE_NAME = 'fonts-cache-v1';
const AIRGAP_ALLOWED_DOMAINS = ${JSON.stringify(airgapAllowedDomains, null, '\t')};
const AIRGAP_ALLOWED_PROTOCOLS = ${JSON.stringify(airgapAllowedProtocols, null, '\t')};
// *** End automatic generation ***`;

const swPath = join(__dirname, '..', 'public', 'sw.js');
const swContent = readFileSync(swPath, 'utf8');

const updatedContent = swContent.replace(
	/\/\/ These constants are automatically generated\. Do not edit directly\.[\s\S]*?\/\/ \*\*\* End automatic generation \*\*\*/,
	generatedBlock,
);

writeFileSync(swPath, updatedContent);
console.log(
	`Updated service worker: version=${version}, basePath=${basePath}, airgapAllowedDomains=${airgapAllowedDomains.join(', ')}`,
);