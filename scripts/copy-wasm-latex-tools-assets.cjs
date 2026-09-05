// scripts/copy-wasm-latex-tools-assets.cjs
const fs = require('fs-extra');
const path = require('node:path');

const webperlSource = path.resolve(
	__dirname,
	'../node_modules/wasm-latex-tools/assets/core/webperl',
);
const webperlDestination = path.resolve(
	__dirname,
	'../public/core/webperl',
);

const perlSource = path.resolve(
	__dirname,
	'../node_modules/wasm-latex-tools/assets/core/perl',
);
const perlDestination = path.resolve(
	__dirname,
	'../public/core/perl',
);

async function copyWasmLatexToolsAssets() {
	try {
		let webperlExists = false;
		let perlExists = false;

		if (await fs.pathExists(webperlDestination)) {
			const files = await fs.readdir(webperlDestination);
			if (files.length > 0) {
				console.log('✓ WebPerl assets already exist, skipping copy');
				webperlExists = true;
			}
		}

		if (await fs.pathExists(perlDestination)) {
			const files = await fs.readdir(perlDestination);
			if (files.length > 0) {
				console.log('✓ Perl assets already exist, skipping copy');
				perlExists = true;
			}
		}

		if (!webperlExists) {
			await fs.ensureDir(webperlDestination);
			await fs.copy(webperlSource, webperlDestination);
			console.log('✓ WebPerl assets copied to public/core/webperl');
		}

		if (!perlExists) {
			await fs.ensureDir(perlDestination);
			await fs.copy(perlSource, perlDestination);
			console.log('✓ Perl assets copied to public/core/perl');
		}
	} catch (err) {
		console.error('❌ Error copying wasm-latex-tools assets:', err);
		throw err;
	}
}

if (require.main === module) {
	copyWasmLatexToolsAssets();
}

module.exports = { copyWasmLatexToolsAssets };
