import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const version = packageJson.version;

const swPath = join("public", "sw.js");
const swContent = readFileSync(swPath, "utf8");

const updatedContent = swContent.replace(
	/const CACHE_NAME = `texlyre-v[\d.]+`;/,
	`const CACHE_NAME = \`texlyre-v${version}\`;`,
);

writeFileSync(swPath, updatedContent);
console.log(`Updated service worker version to ${version}`);
