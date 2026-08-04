// scripts/copy-oniguruma-wasm.cjs
const fs = require('fs-extra');
const path = require('node:path');

const wasmSource = path.resolve(
	__dirname,
	'../node_modules/vscode-oniguruma/release/onig.wasm',
);
const wasmDestination = path.resolve(
	__dirname,
	'../public/core/oniguruma/onig.wasm',
);

async function copyOnigurumaWasm() {
	try {
		if (await fs.pathExists(wasmDestination)) {
			console.log('✓ Oniguruma WASM already exists, skipping copy');
			return;
		}

		await fs.ensureDir(path.dirname(wasmDestination));
		await fs.copy(wasmSource, wasmDestination);
		console.log('✓ Oniguruma WASM copied to public/core/oniguruma');
	} catch (err) {
		console.error('❌ Error copying Oniguruma WASM:', err);
		throw err;
	}
}

if (require.main === module) {
	copyOnigurumaWasm();
}

module.exports = { copyOnigurumaWasm };
