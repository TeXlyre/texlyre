// scripts/update-sw-version.js
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function loadConfig() {
	const configPath = join(__dirname, "..", "texlyre.config.ts");
	const { default: config } = await import(configPath);
	return config;
}

const packageJson = JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf8"));
const version = packageJson.version;

const config = await loadConfig();
const basePath = config.baseUrl;

const swPath = join(__dirname, "..", "public", "sw.js");
const swContent = readFileSync(swPath, "utf8");

const updatedContent = swContent
	.replace(
		/const CACHE_NAME = `texlyre-v[\d.]+`;/,
		`const CACHE_NAME = \`texlyre-v${version}\`;`,
	)
	.replace(
		/const BASE_PATH = ['"`][^'"`]*['"`];/,
		`const BASE_PATH = '${basePath}';`,
	);

writeFileSync(swPath, updatedContent);
console.log(`Updated service worker: version=${version}, basePath=${basePath}`);