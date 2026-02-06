// scripts/copy-download-core-assets.cjs
const fs = require("fs-extra");
const path = require("node:path");
const https = require("node:https");
const JSZip = require("jszip");

const ASSETS = [
    {
        name: "drawio-embed",
        version: "v29.3.7",
        url: "https://github.com/TeXlyre/drawio-embed-mirror/archive/refs/tags/v29.3.7.zip",
        dest: path.resolve(__dirname, "../public/core/drawio-embed"),
        extractPath: (version) => `drawio-embed-mirror-${version.substring(1)}/drawio-embed/`,
    },
];

async function downloadFile(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (response) => {
            if (response.statusCode === 302 || response.statusCode === 301) {
                return downloadFile(response.headers.location).then(resolve).catch(reject);
            }
            const chunks = [];
            response.on('data', chunk => chunks.push(chunk));
            response.on('end', () => resolve(Buffer.concat(chunks)));
            response.on('error', reject);
        }).on('error', reject);
    });
}

async function downloadAndExtract(asset) {
    if (await fs.pathExists(asset.dest)) {
        const files = await fs.readdir(asset.dest);
        if (files.length > 0) {
            console.log(`✓ ${asset.name} already exists, skipping download`);
            return;
        }
    }

    console.log(`Downloading ${asset.name} ${asset.version}...`);
    const zipBuffer = await downloadFile(asset.url);

    console.log(`Extracting ${asset.name}...`);
    const zip = await JSZip.loadAsync(zipBuffer);

    await fs.ensureDir(asset.dest);

    const rootFolder = asset.extractPath(asset.version);

    for (const [filename, file] of Object.entries(zip.files)) {
        if (!filename.startsWith(rootFolder) || file.dir) continue;

        const relativePath = filename.substring(rootFolder.length);
        if (!relativePath) continue;

        const destPath = path.join(asset.dest, relativePath);

        await fs.ensureDir(path.dirname(destPath));
        const content = await file.async('nodebuffer');
        await fs.writeFile(destPath, content);
    }

    console.log(`✓ ${asset.name} ready`);
}

async function downloadCoreAssets() {
    try {
        for (const asset of ASSETS) {
            await downloadAndExtract(asset);
        }
        console.log("\n✅ All core assets ready");
    } catch (err) {
        console.error("❌ Error downloading core assets:", err);
        throw err;
    }
}

if (require.main === module) {
    downloadCoreAssets();
}

module.exports = { downloadCoreAssets };