// scripts/copy-mathlive-fonts.cjs
const fs = require("fs-extra");
const path = require("node:path");

const fontsSource = path.resolve(__dirname, "../node_modules/mathlive/fonts");
const fontsDestination = path.resolve(__dirname, "../public/assets/fonts");

async function copyKTeXFonts() {
    try {
        if (await fs.pathExists(fontsDestination)) {
            const files = await fs.readdir(fontsDestination);
            if (files.length > 0) {
                console.log("✓ MathLive KTeX fonts already exist, skipping copy");
                return;
            }
        }

        await fs.ensureDir(fontsDestination);
        await fs.copy(fontsSource, fontsDestination);
        console.log("✓ MathLive KTeX fonts copied to public/assets/cmaps");
    } catch (err) {
        console.error("❌ Error copying MathLive KTeX fonts:", err);
        throw err;
    }
}

if (require.main === module) {
    copyKTeXFonts();
}

module.exports = { copyKTeXFonts };