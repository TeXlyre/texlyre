import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const version = packageJson.version;

const viteConfig = readFileSync("vite.config.ts", "utf8");
const basePathVarMatch = viteConfig.match(/const basePath = ["']([^"']+)["'];/);
const basePath = basePathVarMatch ? basePathVarMatch[1] : '/';

const swPath = join("public", "sw.js");
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