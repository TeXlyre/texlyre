// scripts/setup-assets.cjs
const fs = require('fs-extra');
const path = require('node:path');
const { copyCmaps } = require('./copy-pdf-cmaps.cjs');
const { copyKTeXFonts } = require('./copy-mathlive-fonts.cjs');
const { copyDetypifyAssets } = require('./copy-detypify-assets.cjs');
const { copyTypstAssets } = require('./copy-typst-assets.cjs');
const { copyOnigurumaWasm } = require('./copy-oniguruma-wasm.cjs');
const {
	copyWasmLatexToolsAssets,
} = require('./copy-wasm-latex-tools-assets.cjs');
const { downloadCoreAssets } = require('./download-core-assets.cjs');

const userdataFiles = [
	'userdata.json',
	'userdata.mobile.json',
	'userdata.local.json',
	'userdata.local.mobile.json',
];

async function copyUserdataFiles() {
	const rootDir = path.resolve(__dirname, '..');
	const publicDir = path.join(rootDir, 'public');

	await fs.ensureDir(publicDir);
	await Promise.all(
		userdataFiles.map((filename) =>
			fs.copy(path.join(rootDir, filename), path.join(publicDir, filename)),
		),
	);
	console.log('✓ Userdata files copied to public');
}

async function setupAssets() {
	console.log('=== Setting up assets ===\n');

	try {
		await copyCmaps();
		await copyKTeXFonts();
		await copyDetypifyAssets();
		await copyTypstAssets();
		await copyOnigurumaWasm();
		await copyWasmLatexToolsAssets();
		await downloadCoreAssets();
		await copyUserdataFiles();

		console.log('\n✅ Asset setup complete');
	} catch (err) {
		console.error('\n❌ Asset setup failed:', err);
		process.exit(1);
	}
}

setupAssets();
