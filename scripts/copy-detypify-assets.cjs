// scripts/copy-detypify-assets.cjs
const fs = require('fs-extra');
const path = require('node:path');

const assets = [
    {
        source: path.resolve(__dirname, '../node_modules/detypify-service/train/model.onnx'),
        destination: path.resolve(__dirname, '../public/core/detypify/model.onnx'),
    },
    {
        source: path.resolve(__dirname, '../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm'),
        destination: path.resolve(__dirname, '../public/core/detypify/ort-wasm-simd-threaded.wasm'),
    },
];

async function copyDetypifyAssets() {
    try {
        const destDir = path.resolve(__dirname, '../public/core/detypify');

        if (await fs.pathExists(destDir)) {
            const files = await fs.readdir(destDir);
            if (files.length >= assets.length) {
                console.log('✓ Detypify assets already exist, skipping copy');
                return;
            }
        }

        await fs.ensureDir(destDir);

        for (const asset of assets) {
            await fs.copy(asset.source, asset.destination);
        }

        console.log('✓ Detypify assets copied to public/core/detypify');
    } catch (err) {
        console.error('❌ Error copying Detypify assets:', err);
        throw err;
    }
}

if (require.main === module) {
    copyDetypifyAssets();
}

module.exports = { copyDetypifyAssets };