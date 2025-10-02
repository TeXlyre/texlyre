// scripts/clean-cache.cjs
const { rmSync, existsSync } = require("node:fs");
const path = require("node:path");

const paths = ["node_modules/.vite", "dist", ".vite"];

paths.forEach((p) => {
	if (existsSync(p)) {
		console.log(`Cleaning ${p}...`);
		rmSync(p, { recursive: true, force: true });
	}
});

console.log("Cache cleaned successfully!");
