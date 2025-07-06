// scripts/copy-pdf-cmaps.js - For development only
const fs = require("fs-extra");
const path = require("node:path");

const cmapsSource = path.resolve(__dirname, "../node_modules/pdfjs-dist/cmaps");
const cmapsDestination = path.resolve(__dirname, "../public/cmaps");

// Copy cmaps to public directory for development
async function copyCmaps() {
	try {
		await fs.ensureDir(cmapsDestination);
		await fs.copy(cmapsSource, cmapsDestination);
		console.log("✅ PDF.js cMaps copied to public/cmaps for development");
	} catch (err) {
		console.error("❌ Error copying PDF.js cMaps:", err);
	}
}

copyCmaps();
