// scripts/copy-pdf-cmaps.cjs
const fs = require("fs-extra");
const path = require("node:path");

const cmapsSource = path.resolve(__dirname, "../node_modules/pdfjs-dist/cmaps");
const cmapsDestination = path.resolve(__dirname, "../public/assets/cmaps");

async function copyCmaps() {
	try {
		if (await fs.pathExists(cmapsDestination)) {
			const files = await fs.readdir(cmapsDestination);
			if (files.length > 0) {
				console.log("✓ PDF.js cMaps already exist, skipping copy");
				return;
			}
		}

		await fs.ensureDir(cmapsDestination);
		await fs.copy(cmapsSource, cmapsDestination);
		console.log("✓ PDF.js cMaps copied to public/assets/cmaps");
	} catch (err) {
		console.error("❌ Error copying PDF.js cMaps:", err);
		throw err;
	}
}

if (require.main === module) {
	copyCmaps();
}

module.exports = { copyCmaps };