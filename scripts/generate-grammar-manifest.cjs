// scripts/generate-grammar-manifest.cjs
const fs = require('node:fs');
const path = require('node:path');

const grammarsDir = path.join(__dirname, '../public/assets/grammars');
const outputPath = path.join(grammarsDir, 'grammars.json');

function decodeXmlEntities(value) {
	return value
		.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
		.replace(/&#x([0-9a-f]+);/gi, (_, code) =>
			String.fromCharCode(Number.parseInt(code, 16)),
		)
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&apos;/g, "'")
		.replace(/&amp;/g, '&');
}

function parseFlatPlist(xml) {
	const result = {};
	const pattern =
		/<key>([\s\S]*?)<\/key>\s*<(string|integer|real)>([\s\S]*?)<\/\2>/g;

	let match = pattern.exec(xml);
	while (match !== null) {
		result[decodeXmlEntities(match[1])] = decodeXmlEntities(match[3]);
		match = pattern.exec(xml);
	}
	return result;
}

function nextFieldNumber(content) {
	const used = [...content.matchAll(/\$\{?(\d+)/g)]
		.map((match) => Number(match[1]))
		.filter((value) => value > 0);

	return used.length > 0 ? Math.max(...used) + 1 : 1;
}

function replaceTransforms(content) {
	let result = '';
	let index = 0;
	let field = nextFieldNumber(content);

	while (index < content.length) {
		const start = content.indexOf('${', index);
		if (start === -1) {
			result += content.slice(index);
			break;
		}

		const opening = /^\$\{\d+\//.exec(content.slice(start));
		if (!opening) {
			result += content.slice(index, start + 2);
			index = start + 2;
			continue;
		}

		let depth = 1;
		let cursor = start + opening[0].length;
		while (cursor < content.length && depth > 0) {
			const character = content[cursor];
			if (character === '\\') cursor++;
			else if (character === '{') depth++;
			else if (character === '}') depth--;
			cursor++;
		}

		result += `${content.slice(index, start)}\${${field++}}`;
		index = cursor;
	}

	return result;
}

function replaceVariableDefaults(content) {
	let field = nextFieldNumber(content);

	return content.replace(
		/\$\{(?:TM_|CURRENT_|WORKSPACE_|CLIPBOARD|RANDOM|UUID)[A-Z_]*:([^}]*)\}/g,
		(_, fallback) => `\${${field++}:${fallback}}`,
	);
}

function normalizeTemplate(content) {
	return replaceVariableDefaults(replaceTransforms(content))
		.replace(
			/\$\{(\d+)\|([^|]*)\|\}/g,
			(_, seq, choices) => `\${${seq}:${choices.split(',')[0].trim()}}`,
		)
		.replace(
			/\$\{(?:TM_|CURRENT_|WORKSPACE_|CLIPBOARD|RANDOM|UUID)[A-Z_]*\}/g,
			'',
		)
		.replace(/\$(?:TM_|CURRENT_|WORKSPACE_|CLIPBOARD|RANDOM|UUID)[A-Z_]*/g, '')
		.replace(/\$\{(\d+):\/[a-z]+\}/g, '${$1}')
		.replace(/\$\{\d+:\+[^}]*\}/g, '')
		.replace(/`[^`]*`/g, '')
		.replace(/\$(\d+)/g, '${$1}')
		.replace(/\$\{(\d+):\}/g, '${$1}');
}

function readTextMateSnippet(filePath) {
	const parsed = parseFlatPlist(fs.readFileSync(filePath, 'utf8'));
	const label = parsed.tabTrigger || parsed.name;
	if (!label || typeof parsed.content !== 'string') return [];

	return [
		{
			label,
			detail: parsed.name,
			template: normalizeTemplate(parsed.content),
		},
	];
}

function readVscodeSnippets(filePath) {
	const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));

	return Object.entries(parsed).flatMap(([name, entry]) => {
		const label = entry.prefix ?? name;
		const body = Array.isArray(entry.body) ? entry.body.join('\n') : entry.body;
		if (typeof label !== 'string' || typeof body !== 'string') return [];

		return [
			{
				label,
				detail: entry.description ?? name,
				template: normalizeTemplate(body),
			},
		];
	});
}

function readSnippets(folderPath) {
	const snippetsDir = ['snippets', 'Snippets']
		.map((name) => path.join(folderPath, name))
		.find((candidate) => fs.existsSync(candidate));
	if (!snippetsDir) return [];

	const seen = new Set();

	return fs
		.readdirSync(snippetsDir)
		.sort()
		.flatMap((file) => {
			const filePath = path.join(snippetsDir, file);

			try {
				if (file.endsWith('.tmSnippet')) return readTextMateSnippet(filePath);
				if (file.endsWith('.json') || file.endsWith('.code-snippets')) {
					return readVscodeSnippets(filePath);
				}
			} catch (error) {
				console.warn(`  skipping ${file}: ${error.message}`);
			}
			return [];
		})
		.filter((snippet) => {
			const open = (snippet.template.match(/\{/g) ?? []).length;
			const close = (snippet.template.match(/\}/g) ?? []).length;
			if (open !== close) {
				console.warn(
					`  skipping snippet ${snippet.label}: unsupported template syntax`,
				);
				return false;
			}
			if (seen.has(snippet.label)) return false;
			seen.add(snippet.label);
			return true;
		});
}

function generateGrammarManifest() {
	const entries = fs
		.readdirSync(grammarsDir, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => entry.name)
		.sort()
		.flatMap((folder) => {
			const folderPath = path.join(grammarsDir, folder);
			const manifestPath = path.join(folderPath, 'manifest.json');
			if (!fs.existsSync(manifestPath)) {
				console.warn(`  skipping ${folder}: no manifest.json`);
				return [];
			}

			const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
			const grammars = (manifest.grammars ?? []).filter((grammar) => {
				const exists = fs.existsSync(path.join(folderPath, grammar.file));
				if (!exists) {
					console.warn(`  skipping ${folder}/${grammar.file}: file missing`);
				}
				return exists;
			});

			if (grammars.length === 0) return [];

			const snippets = readSnippets(folderPath);
			const snippetsFile = path.join(folderPath, 'snippets.json');

			if (snippets.length > 0) {
				fs.writeFileSync(snippetsFile, JSON.stringify(snippets, null, 2));
			} else if (fs.existsSync(snippetsFile)) {
				fs.rmSync(snippetsFile);
			}

			return [
				{
					id: manifest.id ?? folder,
					folder,
					scopeName: manifest.scopeName,
					extensions: (manifest.extensions ?? []).map((extension) =>
						extension.toLowerCase(),
					),
					languageData: manifest.languageData ?? {},
					grammars,
					snippets: snippets.length > 0 ? 'snippets.json' : undefined,
				},
			];
		});

	fs.writeFileSync(outputPath, JSON.stringify(entries, null, 2));

	const snippetTotal = entries.filter((entry) => entry.snippets).length;
	console.log(
		`Generated grammars.json with ${entries.length} grammar packages (${snippetTotal} with snippets)`,
	);
}

if (require.main === module) {
	generateGrammarManifest();
}

module.exports = { generateGrammarManifest };
