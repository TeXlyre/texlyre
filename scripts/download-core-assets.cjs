// scripts/copy-download-core-assets.cjs
const fs = require('fs-extra');
const path = require('node:path');
const https = require('node:https');
const { exec } = require('node:child_process');
const { promisify } = require('node:util');
const JSZip = require('jszip');

const execAsync = promisify(exec);

const ASSETS = [
    {
        name: 'drawio-embed',
        version: 'v29.6.4',
        url: (version) =>
            `https://github.com/TeXlyre/drawio-embed-mirror/archive/refs/tags/${version}.zip`,
        dest: path.resolve(__dirname, '../public/core/drawio-embed'),
        extractPath: (version) =>
            `drawio-embed-mirror-${version.substring(1)}/drawio-embed/`,
    },
    {
        name: 'texlyre-busytex',
        version: 'v1.1.1',
        url: (version) =>
            `https://github.com/TeXlyre/texlyre-busytex/releases/download/assets-${version}/busytex-assets.tar.gz`,
        dest: path.resolve(__dirname, '../public/core/busytex'),
        tarGz: true,
    },
];

async function downloadFile(url) {
    return new Promise((resolve, reject) => {
        https
            .get(url, (response) => {
                if (response.statusCode === 302 || response.statusCode === 301) {
                    return downloadFile(response.headers.location)
                        .then(resolve)
                        .catch(reject);
                }
                const chunks = [];
                response.on('data', (chunk) => chunks.push(chunk));
                response.on('end', () => resolve(Buffer.concat(chunks)));
                response.on('error', reject);
            })
            .on('error', reject);
    });
}

async function extractZip(buffer, dest, rootFolder) {
    const zip = await JSZip.loadAsync(buffer);
    await fs.ensureDir(dest);

    for (const [filename, file] of Object.entries(zip.files)) {
        if (!filename.startsWith(rootFolder) || file.dir) continue;

        const relativePath = filename.substring(rootFolder.length);
        if (!relativePath) continue;

        const destPath = path.join(dest, relativePath);
        await fs.ensureDir(path.dirname(destPath));
        const content = await file.async('nodebuffer');
        await fs.writeFile(destPath, content);
    }
}

async function extractTarGz(buffer, dest) {
    await fs.ensureDir(dest);

    const archivePath = path.join(dest, '_download.tar.gz');
    await fs.writeFile(archivePath, buffer);

    try {
        await execAsync(`tar -xzf "${archivePath}" -C "${path.dirname(dest)}"`);
    } finally {
        await fs.remove(archivePath);
    }
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

    const url = typeof asset.url === 'function' ? asset.url(asset.version) : asset.url;
    const buffer = await downloadFile(url);

    console.log(`Extracting ${asset.name}...`);

    if (asset.tarGz) {
        await extractTarGz(buffer, asset.dest);
    } else {
        await extractZip(buffer, asset.dest, asset.extractPath(asset.version));
    }

    console.log(`✓ ${asset.name} ready`);
}

async function downloadCoreAssets() {
    try {
        for (const asset of ASSETS) {
            await downloadAndExtract(asset);
        }
        console.log('\n✅ All core assets ready');
    } catch (err) {
        console.error('❌ Error downloading core assets:', err);
        throw err;
    }
}

if (require.main === module) {
    downloadCoreAssets();
}

module.exports = { downloadCoreAssets };