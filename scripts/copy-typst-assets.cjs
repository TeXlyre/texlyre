// scripts/copy-typst-assets.cjs
const fs = require("fs-extra");
const path = require("node:path");

const compilerSource = path.resolve(__dirname, "../node_modules/@myriaddreamin/typst-ts-web-compiler/pkg");
const compilerDestination = path.resolve(__dirname, "../public/core/typst-ts-web-compiler/pkg");

const rendererSource = path.resolve(__dirname, "../node_modules/@myriaddreamin/typst-ts-renderer/pkg");
const rendererDestination = path.resolve(__dirname, "../public/core/typst-ts-renderer/pkg");

async function copyTypstAssets() {
    try {
        let compilerExists = false;
        let rendererExists = false;

        if (await fs.pathExists(compilerDestination)) {
            const files = await fs.readdir(compilerDestination);
            if (files.length > 0) {
                console.log("✓ Typst compiler assets already exist, skipping copy");
                compilerExists = true;
            }
        }

        if (await fs.pathExists(rendererDestination)) {
            const files = await fs.readdir(rendererDestination);
            if (files.length > 0) {
                console.log("✓ Typst renderer assets already exist, skipping copy");
                rendererExists = true;
            }
        }

        if (!compilerExists) {
            await fs.ensureDir(compilerDestination);
            await fs.copy(compilerSource, compilerDestination);
            console.log("✓ Typst compiler assets copied to public/core/typst-ts-web-compiler/pkg");
        }

        if (!rendererExists) {
            await fs.ensureDir(rendererDestination);
            await fs.copy(rendererSource, rendererDestination);
            console.log("✓ Typst renderer assets copied to public/core/typst-ts-renderer/pkg");
        }
    } catch (err) {
        console.error("❌ Error copying Typst assets:", err);
        throw err;
    }
}

if (require.main === module) {
    copyTypstAssets();
}

module.exports = { copyTypstAssets };