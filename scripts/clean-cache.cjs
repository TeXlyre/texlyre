const { rmSync, existsSync } = require("fs");
const path = require("path");

const paths = ["node_modules/.vite", "dist", ".vite"];

paths.forEach((p) => {
	if (existsSync(p)) {
		console.log(`Cleaning ${p}...`);
		rmSync(p, { recursive: true, force: true });
	}
});

console.log("Cache cleaned successfully!");
