// scripts/setup-assets.cjs
const { copyCmaps } = require("./copy-pdf-cmaps.cjs");
const { copyKTeXFonts } = require("./copy-mathlive-fonts.cjs");
const { copyTypstAssets } = require("./copy-typst-assets.cjs");
const { downloadCoreAssets } = require("./download-core-assets.cjs");

async function setupAssets() {
    console.log("=== Setting up assets ===\n");

    try {
        await copyCmaps();
        await copyKTeXFonts();
        await copyTypstAssets();
        await downloadCoreAssets();

        console.log("\n✅ Asset setup complete");
    } catch (err) {
        console.error("\n❌ Asset setup failed:", err);
        process.exit(1);
    }
}

setupAssets();