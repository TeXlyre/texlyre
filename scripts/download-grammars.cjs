// scripts/download-grammars.cjs
const fs = require('fs-extra');
const path = require('node:path');
const https = require('node:https');
const JSZip = require('jszip');
const yaml = require('js-yaml');

const { generateGrammarManifest } = require('./generate-grammar-manifest.cjs');

const grammarsDir = path.resolve(__dirname, '../public/assets/grammars');

const VSCODE = 'https://raw.githubusercontent.com/microsoft/vscode/main';
const PRETEXT =
	'https://raw.githubusercontent.com/PreTeXtBook/pretext-tools/main/packages/vscode-extension';
const ASCIIDOC =
	'https://raw.githubusercontent.com/asciidoctor/asciidoctor-vscode/main';

const QUARTO =
	'https://raw.githubusercontent.com/quarto-dev/quarto/main/apps/vscode';

const VSCODE_SHARED = [
	{ folder: 'shared-julia', path: 'julia/syntaxes/julia.tmLanguage.json' },
	{
		folder: 'shared-markdown',
		path: 'markdown-basics/syntaxes/markdown.tmLanguage.json',
	},
	{ folder: 'shared-r', path: 'r/syntaxes/r.tmLanguage.json' },
	{ folder: 'shared-css', path: 'css/syntaxes/css.tmLanguage.json' },
	{ folder: 'shared-html', path: 'html/syntaxes/html.tmLanguage.json' },
	{ folder: 'shared-java', path: 'java/syntaxes/java.tmLanguage.json' },
	{
		folder: 'shared-js',
		path: 'javascript/syntaxes/JavaScript.tmLanguage.json',
	},
	{ folder: 'shared-json', path: 'json/syntaxes/JSON.tmLanguage.json' },
	{
		folder: 'shared-python',
		path: 'python/syntaxes/MagicPython.tmLanguage.json',
	},
	{
		folder: 'shared-shell',
		path: 'shellscript/syntaxes/shell-unix-bash.tmLanguage.json',
	},
	{ folder: 'shared-sql', path: 'sql/syntaxes/sql.tmLanguage.json' },
	{ folder: 'shared-yaml', path: 'yaml/syntaxes/yaml.tmLanguage.json' },
];

const SOURCES = [
	{
		name: 'sile',
		folder: 'sile',
		license: 'MIT',
		files: [
			{
				url: 'https://raw.githubusercontent.com/sile-typesetter/vscode-sile/master/syntaxes/sile.tmLanguage.json',
				dest: 'sile.tmLanguage.json',
			},
			{
				url: 'https://raw.githubusercontent.com/sile-typesetter/vscode-sile/master/LICENSE.md',
				dest: 'LICENSE.md',
			},
		],
	},
	{
		name: 'pretext',
		folder: 'pretext',
		license: 'MIT',
		files: [
			{
				url: `${PRETEXT}/syntaxes/ptx.tmLanguage.json`,
				dest: 'ptx.tmLanguage.json',
			},
			{
				url: 'https://raw.githubusercontent.com/PreTeXtBook/pretext-tools/main/LICENSE',
				dest: 'LICENSE',
			},
			...['attributes', 'elements', 'inline', 'templates'].map((name) => ({
				url: `${PRETEXT}/snippets/pretext-${name}.json`,
				dest: `snippets/pretext-${name}.json`,
			})),
		],
	},
	{
		name: 'context',
		folder: 'context',
		license: 'CC0-1.0',
		archive: {
			url: 'https://github.com/pgundlach/context.tmbundle/archive/refs/heads/master.zip',
			root: 'context.tmbundle-master/',
			entries: [
				{ from: 'Syntaxes/ConTeXt.tmLanguage', dest: 'ConTeXt.tmLanguage' },
				{ from: 'Syntaxes/MetaFun.tmLanguage', dest: 'MetaFun.tmLanguage' },
				{ from: 'License.md', dest: 'LICENSE.md' },
				{ fromDir: 'Snippets/', destDir: 'snippets', match: /\.tmSnippet$/ },
			],
		},
	},
	{
		name: 'asciidoc',
		folder: 'asciidoc',
		license: 'MIT',
		files: [
			{
				url: `${ASCIIDOC}/syntaxes/asciidoc.tmLanguage.json`,
				dest: 'asciidoc.tmLanguage.json',
			},
			{
				url: `${ASCIIDOC}/snippets/snippets.json`,
				dest: 'snippets/snippets.json',
			},
			{ url: `${ASCIIDOC}/LICENSE`, dest: 'LICENSE' },
		],
	},
	{
		name: 'quarto',
		folder: 'quarto',
		license: 'MIT',
		files: [
			{
				url: `${QUARTO}/syntaxes/quarto.tmLanguage`,
				dest: 'quarto.tmLanguage',
			},
			{
				url: `${QUARTO}/snippets/quarto.code-snippets`,
				dest: 'snippets/quarto.code-snippets',
			},
			{ url: `${QUARTO}/LICENSE`, dest: 'LICENSE' },
		],
	},
	{
		name: 'shared-dot',
		folder: 'shared-dot',
		license: 'MIT',
		files: [
			{
				url: `${QUARTO}/languages/dot/syntaxes/dot.tmLanguage`,
				dest: 'dot.tmLanguage',
			},
			{ url: `${QUARTO}/LICENSE`, dest: 'LICENSE' },
		],
	},
	{
		name: 'shared-mermaid',
		folder: 'shared-mermaid',
		license: 'MIT',
		files: [
			{
				url: `${QUARTO}/languages/mermaid/mermaid.tmLanguage.json`,
				dest: 'mermaid.tmLanguage.json',
			},
			{ url: `${QUARTO}/LICENSE`, dest: 'LICENSE' },
		],
	},
	{
		name: 'shared-xml',
		folder: 'shared-xml',
		license: 'MIT',
		files: [
			{
				url: `${VSCODE}/extensions/xml/syntaxes/xml.tmLanguage.json`,
				dest: 'xml.tmLanguage.json',
			},
			{ url: `${VSCODE}/LICENSE.txt`, dest: 'LICENSE.txt' },
		],
	},
	{
		name: 'shared-lua',
		folder: 'shared-lua',
		license: 'MIT',
		files: [
			{
				url: `${VSCODE}/extensions/lua/syntaxes/lua.tmLanguage.json`,
				dest: 'lua.tmLanguage.json',
			},
			{ url: `${VSCODE}/LICENSE.txt`, dest: 'LICENSE.txt' },
		],
	},
	...VSCODE_SHARED.map((entry) => ({
		name: entry.folder,
		folder: entry.folder,
		license: 'MIT',
		files: [
			{
				url: `${VSCODE}/extensions/${entry.path}`,
				dest: entry.path.split('/').pop(),
			},
			{ url: `${VSCODE}/LICENSE.txt`, dest: 'LICENSE.txt' },
		],
	})),
	{
		name: 'shared-tex',
		folder: 'shared-tex',
		license: 'MIT',
		files: [
			{
				url: 'https://raw.githubusercontent.com/jlelong/vscode-latex-basics/main/syntaxes/TeX.tmLanguage.json',
				dest: 'TeX.tmLanguage.json',
			},
			{
				url: 'https://raw.githubusercontent.com/jlelong/vscode-latex-basics/main/LICENSE.txt',
				dest: 'LICENSE.txt',
			},
		],
	},
	{
		name: 'lilypond',
		folder: 'lilypond',
		license: 'CC BY-NC 3.0',
		optional: true,
		files: [
			{
				url: 'https://raw.githubusercontent.com/jeandeaual/vscode-lilypond-syntax/master/LICENSE',
				dest: 'LICENSE',
			},
			{
				url: 'https://raw.githubusercontent.com/jeandeaual/vscode-lilypond-syntax/master/syntaxes/lilypond.tmLanguage.yaml',
				dest: 'lilypond.tmLanguage.json',
				convert: 'yaml',
			},
		],
	},
];

function downloadFile(url) {
	return new Promise((resolve, reject) => {
		https
			.get(url, (response) => {
				if (response.statusCode === 302 || response.statusCode === 301) {
					return downloadFile(response.headers.location)
						.then(resolve)
						.catch(reject);
				}
				if (response.statusCode !== 200) {
					return reject(new Error(`${response.statusCode} for ${url}`));
				}
				const chunks = [];
				response.on('data', (chunk) => chunks.push(chunk));
				response.on('end', () => resolve(Buffer.concat(chunks)));
				response.on('error', reject);
			})
			.on('error', reject);
	});
}

function convertYamlToJson(buffer) {
	const parse = yaml.safeLoad ?? yaml.load;
	return Buffer.from(JSON.stringify(parse(buffer.toString('utf8')), null, 1));
}

async function writeAsset(dest, buffer, convert) {
	await fs.ensureDir(path.dirname(dest));
	await fs.writeFile(
		dest,
		convert === 'yaml' ? convertYamlToJson(buffer) : buffer,
	);
}

async function downloadFiles(source, destDir) {
	for (const file of source.files) {
		const buffer = await downloadFile(file.url);
		await writeAsset(path.join(destDir, file.dest), buffer, file.convert);
	}
}

async function downloadArchive(source, destDir) {
	const buffer = await downloadFile(source.archive.url);
	const zip = await JSZip.loadAsync(buffer);
	const { root, entries } = source.archive;

	for (const entry of entries) {
		if (entry.fromDir) {
			const prefix = `${root}${entry.fromDir}`;
			const target = path.join(destDir, entry.destDir);
			await fs.ensureDir(target);

			for (const [name, file] of Object.entries(zip.files)) {
				if (file.dir || !name.startsWith(prefix)) continue;

				const relative = name.substring(prefix.length);
				if (!relative || (entry.match && !entry.match.test(relative))) continue;

				await writeAsset(
					path.join(target, relative),
					await file.async('nodebuffer'),
				);
			}
			continue;
		}

		const file = zip.file(`${root}${entry.from}`);
		if (!file) throw new Error(`${entry.from} missing from ${source.name}`);
		await writeAsset(
			path.join(destDir, entry.dest),
			await file.async('nodebuffer'),
		);
	}
}

async function isComplete(source, destDir) {
	const targets = source.files
		? source.files.map((file) => file.dest)
		: source.archive.entries
				.filter((entry) => entry.dest)
				.map((entry) => entry.dest);

	for (const target of targets) {
		if (!(await fs.pathExists(path.join(destDir, target)))) return false;
	}
	return true;
}

async function downloadSource(source) {
	const destDir = path.join(grammarsDir, source.folder);

	if (await isComplete(source, destDir)) {
		console.log(`✓ ${source.name} grammar already exists, skipping download`);
		return;
	}

	console.log(`Downloading ${source.name} grammar (${source.license})...`);
	await fs.ensureDir(destDir);

	if (source.archive) {
		await downloadArchive(source, destDir);
	} else {
		await downloadFiles(source, destDir);
	}

	console.log(`✓ ${source.name} grammar ready`);
}

async function downloadGrammars({ includeOptional = false } = {}) {
	try {
		for (const source of SOURCES) {
			if (source.optional && !includeOptional) continue;
			await downloadSource(source);
		}

		generateGrammarManifest();
		console.log('\n✅ Grammars ready');
	} catch (err) {
		console.error('❌ Error downloading grammars:', err);
		throw err;
	}
}

if (require.main === module) {
	const includeOptional = process.argv.includes('--include-optional');

	if (includeOptional) {
		console.log(
			'Including optional grammars. The LilyPond grammar is CC BY-NC 3.0:',
		);
		console.log(
			'non-commercial use only, do not commit it or deploy it commercially.\n',
		);
	}

	downloadGrammars({ includeOptional });
}

module.exports = { downloadGrammars };
