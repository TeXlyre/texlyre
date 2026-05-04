// src/utils/fileUtils.ts
import { t } from '@/i18n';
import mime from 'mime';

export const arrayBufferToString = (buffer: ArrayBuffer | Uint8Array): string => {
	return new TextDecoder().decode(buffer);
};

export const stringToArrayBuffer = (str: string): ArrayBuffer => {
	return new TextEncoder().encode(str).buffer;
};

export const toArrayBuffer = (data: string | ArrayBuffer | SharedArrayBuffer | ArrayBufferView): ArrayBuffer => {
	if (typeof data === 'string') return stringToArrayBuffer(data);
	if (data instanceof ArrayBuffer) return data;
	if (ArrayBuffer.isView(data)) {
		const { buffer, byteOffset, byteLength } = data;
		if (buffer instanceof ArrayBuffer && byteOffset === 0 && byteLength === buffer.byteLength) return buffer;
		const out = new Uint8Array(byteLength);
		out.set(new Uint8Array(buffer, byteOffset, byteLength));
		return out.buffer;
	}
	if (typeof SharedArrayBuffer !== 'undefined' && data instanceof SharedArrayBuffer) {
		const src = new Uint8Array(data);
		const out = new Uint8Array(src.byteLength);
		out.set(src);
		return out.buffer;
	}
	throw new Error('Unsupported binary content type');
};

export const formatFileSize = (size?: number): string => {
	if (!size) return t('Unknown size');
	if (size < 1024) return t('{count} bytes', { count: size });
	if (size < 1024 * 1024) return t('{size} KB', { size: (size / 1024).toFixed(1) });
	return t('{size} MB', { size: (size / (1024 * 1024)).toFixed(1) });
};

export const getFilenameFromPath = (path: string): string => {
	const parts = path.split('/');
	return parts[parts.length - 1];
};

export const getParentPath = (path: string): string => {
	const lastSlashIndex = path.lastIndexOf('/');
	return lastSlashIndex === 0 ? '/' : path.substring(0, lastSlashIndex);
};

export const getRelativePath = (fromPath: string, toPath: string): string => {
	const fromParts = fromPath.split('/').filter(p => p);
	const toParts = toPath.split('/').filter(p => p);

	fromParts.pop();

	let commonLength = 0;
	while (commonLength < fromParts.length &&
		commonLength < toParts.length &&
		fromParts[commonLength] === toParts[commonLength]) {
		commonLength++;
	}

	const upLevels = fromParts.length - commonLength;
	const downPath = toParts.slice(commonLength);

	return '../'.repeat(upLevels) + downPath.join('/');
};

export const joinPaths = (base: string, path: string): string => {
	if (base === '/') {
		return `/${path}`;
	}
	return `${base}/${path}`;
};

export const getMimeType = (fileName: string): string => {
	return mime.getType(fileName) || 'application/octet-stream';
};

export const getFileExtension = (mimeType: string): string => {
	const typeMap: Record<string, string> = {
		// Images
		'image/jpeg': 'jpg',
		'image/png': 'png',
		'image/gif': 'gif',
		'image/webp': 'webp',
		'image/svg+xml': 'svg',
		'image/bmp': 'bmp',
		'image/tiff': 'tiff',
		'image/x-icon': 'ico',
		'image/vnd.microsoft.icon': 'ico',

		// Documents
		'application/pdf': 'pdf',
		'application/rtf': 'rtf',
		'text/rtf': 'rtf',

		// Plain text / markup
		'text/plain': 'txt',
		'text/markdown': 'md',
		'text/x-markdown': 'md',
		'text/asciidoc': 'adoc',
		'text/x-rst': 'rst',
		'text/org': 'org',
		'text/csv': 'csv',
		'text/tab-separated-values': 'tsv',
		'text/html': 'html',
		'text/css': 'css',
		'text/xml': 'xml',
		'application/xml': 'xml',

		// Data / config
		'application/json': 'json',
		'application/ld+json': 'jsonld',
		'application/json5': 'json5',
		'application/x-ndjson': 'ndjson',
		'application/jsonl': 'jsonl',
		'application/yaml': 'yaml',
		'application/x-yaml': 'yaml',
		'text/yaml': 'yaml',
		'text/x-yaml': 'yaml',
		'application/toml': 'toml',
		'application/x-toml': 'toml',

		// LaTeX / TeX ecosystem
		'application/x-tex': 'tex',
		'text/x-tex': 'tex',
		'text/x-latex': 'tex',
		'application/x-latex': 'tex',
		'application/x-bibtex': 'bib',
		'text/x-bibtex': 'bib',
		'text/x-biblatex': 'bib',
		'text/x-texinfo': 'texi',

		// Typst
		'text/x-typst': 'typ',
		'application/x-typst': 'typ',

		// Web / scripts
		'application/javascript': 'js',
		'text/javascript': 'js',
		'application/typescript': 'ts',
		'text/typescript': 'ts',
		'application/wasm': 'wasm',

		// Archives
		'application/zip': 'zip',
		'application/gzip': 'gz',
		'application/x-gzip': 'gz',
		'application/x-7z-compressed': '7z',
		'application/x-tar': 'tar',
		'application/x-bzip2': 'bz2',
		'application/x-xz': 'xz'
	};

	return typeMap[mimeType] || mimeType.split('/')[1]?.split('+')[0] || 'png';
};

export const isBinaryFile = (fileName: string): boolean => {
	const baseName = fileName.split('/').pop()?.toLowerCase() || '';

	if (!baseName) {
		return false;
	}

	const textSuffixes = [
		'.cmake.in', '.fdb_latexmk', '.gradle.kts'
	];

	if (textSuffixes.some((suffix) => baseName.endsWith(suffix))) {
		return false;
	}

	const extension = baseName.includes('.') ? baseName.split('.').pop() || '' : '';

	if (!extension) {
		return false;
	}

	const textExtensions = new Set([
		// Build systems / project files
		'bazel', 'bzl', 'cake', 'cmake', 'csproj',
		'fsproj', 'gradle', 'gyp', 'gypi', 'mak',
		'make', 'meson', 'mk', 'mkfile', 'ninja',
		'sln', 'targets', 'vbproj', 'vcxproj',

		// Data / config
		'babelrc', 'browserslistrc', 'cfg', 'cnf', 'conf',
		'config', 'coveragerc', 'curlrc', 'dockerignore', 'editorconfig',
		'env', 'eslintrc', 'flake8', 'gitattributes', 'gitignore',
		'gitmodules', 'htaccess', 'htpasswd', 'ignore', 'ini',
		'json', 'json5', 'jsonc', 'map', 'npmignore',
		'npmrc', 'pnpmfile', 'prettierrc', 'properties', 'props',
		'pylintrc', 'stylelintrc', 'toml', 'wgetrc', 'yaml',
		'yarnrc', 'yml',

		// DevOps / infra
		'compose', 'cue', 'desktop', 'hcl', 'jenkinsfile',
		'jsonnet', 'kdl', 'libsonnet', 'mount', 'nomad',
		'pipeline', 'rego', 'service', 'skaffold', 'socket',
		'tf', 'tfvars', 'tiltfile', 'timer',

		// Documentation / API
		'apib', 'openapi', 'raml', 'swagger',

		// General programming languages
		'agda', 'ahk', 'apl', 'asm', 'bas',
		'bf', 'bicep', 'c', 'c++', 'cc',
		'cbl', 'cl', 'clj', 'cljc', 'cljs',
		'cob', 'coffee', 'cpp', 'cr', 'cs',
		'cxx', 'd', 'dart', 'di', 'edn',
		'elm', 'erl', 'ex', 'exs', 'f03',
		'f08', 'f90', 'f95', 'for', 'forth',
		'fs', 'fsi', 'fsscript', 'fst', 'fsx',
		'fth', 'gd', 'gdshader', 'gleam', 'go',
		'groovy', 'gsp', 'gvy', 'gy', 'h',
		'h++', 'hack', 'hh', 'hpp', 'hrl',
		'hs', 'hx', 'hxx', 'idr', 'inc',
		'io', 'ipynb', 'java', 'jl', 'kt',
		'kts', 'lagda', 'lean', 'lfe', 'lhs',
		'lid', 'lisp', 'lsp', 'lua', 'm',
		'm4', 'mc', 'ml', 'mli', 'mll',
		'mly', 'mm', 'nim', 'nimble', 'nix',
		'nu', 'odin', 'pas', 'php', 'php3',
		'php4', 'php5', 'php7', 'php8', 'phps',
		'phtml', 'pl', 'pm', 'pony', 'pp',
		'prg', 'pro', 'prolog', 'purs', 'py',
		'pyi', 'pyw', 'r', 'raku', 'rakumod',
		'rb', 're', 'rei', 'rkt', 'rmd',
		'rs', 's', 'scala', 'sc', 'scm',
		'sml', 'sol', 'ss', 'st', 'sv',
		'svh', 'swift', 't', 'v', 'vala',
		'vb', 'vbs', 'vd', 'vhd', 'vhdl',
		'vhf', 'wl', 'wls', 'x10', 'zig',

		// LaTeX / TeX ecosystem
		'aux', 'bbl', 'bbx', 'bib', 'biblatex',
		'bibtex', 'blg', 'bst', 'cbx', 'clo',
		'cls', 'def', 'dtx', 'fd', 'fls',
		'glo', 'gls', 'idx', 'ilg', 'ind',
		'ins', 'ist', 'latex', 'loa', 'lof',
		'lot', 'ltx', 'nav', 'out', 'snm',
		'sty', 'tex', 'toc', 'vrb',

		// Logs / patches / diffs
		'diff', 'log', 'patch', 'rej', 'trace',

		// Misc text-ish formats
		'entitlements', 'ical', 'ics', 'ifb', 'lrc',
		'pbxproj', 'plist', 'po', 'pot', 'rc',
		'reg', 'resx', 'sami', 'sbv', 'smi',
		'srt', 'strings', 'sub', 'ttml', 'url',
		'vcf', 'vcs', 'vtt', 'webloc', 'xcconfig',

		// Plain text / docs / markup
		'adoc', 'asciidoc', 'context', 'creole', 'ditaa',
		'dot', 'eqn', 'grap', 'groff', 'gv',
		'ily', 'jtex', 'ly', 'man', 'markdown',
		'md', 'mdown', 'mdx', 'mkdn', 'ms',
		'nw', 'noweb', 'org', 'pic', 'qmd',
		'roff', 'rst', 'rtf', 'rtx', 'saty',
		'satyh', 'sil', 't2t', 'texi', 'texinfo',
		'text', 'textile', 'troff', 'txt', 'w',
		'web', 'wiki',

		// Shell / scripts
		'awk', 'bash', 'bat', 'cmd', 'csh',
		'exp', 'fish', 'ksh', 'ps1', 'psd1',
		'psm1', 'sed', 'sh', 'tcl', 'zsh',

		// SQL / database
		'ddl', 'dml', 'pgsql', 'psql', 'sql',

		// Structured data / interchange
		'avsc', 'csv', 'cson', 'geojson', 'gql',
		'graphql', 'hjson', 'jsonl', 'jsonld', 'n3',
		'ndjson', 'nq', 'nt', 'proto', 'psv',
		'rdf', 'soap', 'ssv', 'thrift', 'topojson',
		'trig', 'tsv', 'ttl', 'wsdl', 'xsd',

		// Templates
		'ejs', 'erb', 'eta', 'ftl', 'gotmpl',
		'haml', 'handlebars', 'hbs', 'jade', 'j2',
		'jinja', 'jinja2', 'latte', 'liquid', 'mustache',
		'njk', 'pug', 'slim', 'tera', 'tpl',
		'twig', 'vm',

		// Typst
		'typ', 'typst',

		// Web / frontend
		'astro', 'cjs', 'css', 'heex', 'htm',
		'html', 'js', 'jsx', 'leex', 'less',
		'mjs', 'riot', 'sass', 'scss', 'styl',
		'svelte', 'tsx', // 'svg'
		'ts', 'vue', 'webmanifest', 'xhtml', 'xml',
		'xsl', 'xslt'
	]);

	return !textExtensions.has(extension);
};

export const isTemporaryFile = (fileName: string): boolean => {
	const temporaryPaths = [
		// '/.texlyre_src',
		// '/.texlyre_cache',
		// '/.texlyre_temp',
		'/.texlyre',
		'/.git',
		'/.svn',
		'/node_modules',
		'/.DS_Store',
	];

	return temporaryPaths.some((tempPath) => fileName.startsWith(tempPath));
};

export const isLatexFile = (pathOrName: string): boolean => {
	if (!pathOrName) return false;
	const lower = pathOrName.toLowerCase();
	return lower.endsWith('.tex') || lower.endsWith('.latex') || lower.endsWith('.ltx')
		|| lower.endsWith('.cls') || lower.endsWith('.sty');  // || lower.endsWith('.ind') || lower.endsWith('.bbl')
};

export const isLatexMainFile = (pathOrName: string): boolean => {
	if (!pathOrName) return false;
	const lower = pathOrName.toLowerCase();
	return lower.endsWith('.tex') || lower.endsWith('.latex') || lower.endsWith('.ltx')
};

export const isTypstFile = (pathOrName: string): boolean => {
	if (!pathOrName) return false;
	const lower = pathOrName.toLowerCase();
	return lower.endsWith('.typ') || lower.endsWith('.typst');
};

// export const isTypstMainFile = (pathOrName: string): boolean => {
// 	if (!pathOrName) return false;
// 	const lower = pathOrName.toLowerCase();
// 	return lower.endsWith('.typ') || lower.endsWith('.typst');
// };

export const isBibFile = (pathOrName: string): boolean => {
	if (!pathOrName) return false;
	const lower = pathOrName.toLowerCase();
	return lower.endsWith('.bib') || lower.endsWith('.bibtex');
};

export const isMarkdownFile = (pathOrName: string): boolean => {
	if (!pathOrName) return false;
	const lower = pathOrName.toLowerCase();
	return lower.endsWith('.md') || lower.endsWith('.markdown');
};

export const isYamlFile = (pathOrName: string): boolean => {
	if (!pathOrName) return false;
	const lower = pathOrName.toLowerCase();
	return lower.endsWith('.yml') || lower.endsWith('.yaml');
};

export const isJsonFile = (pathOrName: string): boolean => {
	if (!pathOrName) return false;
	const lower = pathOrName.toLowerCase();
	return lower.endsWith('.json');
};

export const isHtmlFile = (pathOrName: string): boolean => {
	if (!pathOrName) return false;
	const lower = pathOrName.toLowerCase();
	return lower.endsWith('.html');
};

export const isLatexContent = (content: string): boolean => {
	return /\\(?:documentclass|usepackage|begin|end|section|chapter|part|maketitle)/i.test(content);
};

export const isTypstContent = (content: string): boolean => {
	return /(?:#import|#include|#let|#set|^=+\s|\*\*|\/\/)/m.test(content);
};

export const isBibContent = (content: string): boolean => {
	return /@(?:article|book|inproceedings|incollection|phdthesis|mastersthesis|techreport|misc|manual|conference)\s*\{/i.test(content);
};

export const detectFileType = (fileName: string | undefined, content?: string):
	'latex' | 'typst' | 'bib' | 'markdown' | 'yaml' | 'json' | 'html' | 'unknown' => {
	if (fileName) {
		if (isLatexFile(fileName)) return 'latex';
		if (isTypstFile(fileName)) return 'typst';
		if (isBibFile(fileName)) return 'bib';
		if (isMarkdownFile(fileName)) return 'markdown';
		if (isYamlFile(fileName)) return 'yaml';
		if (isJsonFile(fileName)) return 'json';
		if (isHtmlFile(fileName)) return 'html';
	}
	if (content) {
		if (isBibContent(content)) return 'bib';
		if (isTypstContent(content)) return 'typst';
		if (isLatexContent(content)) return 'latex';
	}
	return 'unknown';
};
