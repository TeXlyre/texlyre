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
		version: 'v31.3.2',
		url: (version) =>
			`https://github.com/TeXlyre/drawio-embed-mirror/archive/refs/tags/${version}.zip`,
		dest: path.resolve(__dirname, '../public/core/drawio-embed'),
		extractPath: (version) =>
			`drawio-embed-mirror-${version.substring(1)}/drawio-embed/`,
	},
	{
		name: 'tikz-editor',
		version: 'v0.5.2',
		url: (version) =>
			`https://github.com/TeXlyre/tikz-editor-embed-mirror/archive/refs/tags/${version}.zip`,
		dest: path.resolve(__dirname, '../public/core/tikz-editor'),
		extractPath: (version) =>
			`tikz-editor-embed-mirror-${version.substring(1)}/tikz-editor/`,
	},
	{
		name: 'tex-fmt',
		version: 'v0.5.7',
		url: (version) =>
			`https://github.com/TeXlyre/tex-fmt/releases/download/wasm-${version}/tex-fmt-wasm-${version.substring(1)}.zip`,
		dest: path.resolve(__dirname, '../public/core/texfmt'),
		extractPath: () => 'pkg/',
	},
	{
		name: 'texlyre-busytex',
		version: 'v1.4.0',
		url: (version) =>
			`https://github.com/TeXlyre/texlyre-busytex/releases/download/assets-${version}/busytex-assets.tar.gz`,
		dest: path.resolve(__dirname, '../public/core/busytex'),
		tarGz: true,
	},
	{
		name: 'grammar-assets',
		version: 'v0.1.0',
		url: (version) =>
			`https://github.com/TeXlyre/texlyre-grammar-assets/releases/download/${version}/texlyre-grammar-assets-${version.substring(1)}.zip`,
		includeOptionalUrl: (version) =>
			`https://github.com/TeXlyre/texlyre-grammar-assets/releases/download/${version}/texlyre-grammar-assets-${version.substring(1)}-include-optional.zip`,
		dest: path.resolve(__dirname, '../public/assets/grammars'),
		extractPath: (version) => `texlyre-grammar-assets-${version.substring(1)}/`,
		includeOptionalExtractPath: (version) =>
			`texlyre-grammar-assets-${version.substring(1)}-include-optional/`,
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

async function downloadAndExtract(asset, includeOptional = false) {
	if (await fs.pathExists(asset.dest)) {
		const files = await fs.readdir(asset.dest);
		if (files.length > 0) {
			console.log(`✓ ${asset.name} already exists, skipping download`);
			return;
		}
	}

	console.log(`Downloading ${asset.name} ${asset.version}...`);

	const urlSource =
		includeOptional && asset.includeOptionalUrl
			? asset.includeOptionalUrl
			: asset.url;
	const url =
		typeof urlSource === 'function' ? urlSource(asset.version) : urlSource;
	const buffer = await downloadFile(url);

	console.log(`Extracting ${asset.name}...`);

	if (asset.tarGz) {
		await extractTarGz(buffer, asset.dest);
	} else {
		const extractPathSource =
			includeOptional && asset.includeOptionalExtractPath
				? asset.includeOptionalExtractPath
				: asset.extractPath;
		const extractPath =
			typeof extractPathSource === 'function'
				? extractPathSource(asset.version)
				: extractPathSource;
		await extractZip(buffer, asset.dest, extractPath);
	}

	console.log(`✓ ${asset.name} ready`);
}

async function downloadCoreAssets(
	includeOptional = process.env.TEXLYRE_INCLUDE_OPTIONAL === '1',
) {
	try {
		for (const asset of ASSETS) {
			await downloadAndExtract(asset, includeOptional);
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
