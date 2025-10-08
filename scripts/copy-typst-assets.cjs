// scripts/copy-typst-assets.cjs
const fs = require("fs-extra");
const path = require("node:path");

const compilerSource = path.resolve(__dirname, "../node_modules/@myriaddreamin/typst-ts-web-compiler/pkg");
const compilerDestination = path.resolve(__dirname, "../public/core/typst-ts-web-compiler/pkg");

const rendererSource = path.resolve(__dirname, "../node_modules/@myriaddreamin/typst-ts-renderer/pkg");
const rendererDestination = path.resolve(__dirname, "../public/core/typst-ts-renderer/pkg");

async function copyTypstAssets() {
    try {
        await fs.ensureDir(compilerDestination);
        await fs.copy(compilerSource, compilerDestination);
        console.log("Typst compiler assets copied to public/core/typst-ts-web-compiler/pkg");

        await fs.ensureDir(rendererDestination);
        await fs.copy(rendererSource, rendererDestination);
        console.log("Typst renderer assets copied to public/core/typst-ts-renderer/pkg");
    } catch (err) {
        console.error("Error copying Typst assets:", err);
    }
}

copyTypstAssets();