/* biome-ignore-all lint/suspicious/noControlCharactersInRegex: Filename validator must reject control characters */
// src/utils/fileUtils.ts
import mime from 'mime';

import { t } from '@/i18n';

export function arrayBufferToString(buffer: ArrayBuffer | Uint8Array): string {
	return new TextDecoder().decode(buffer);
}

export function stringToArrayBuffer(str: string): ArrayBuffer {
	return new TextEncoder().encode(str).buffer;
}

export function latin1ToBytes(latin1: string): Uint8Array {
	const bytes = new Uint8Array(latin1.length);
	for (let i = 0; i < latin1.length; i++)
		bytes[i] = latin1.charCodeAt(i) & 0xff;
	return bytes;
}

export function toArrayBuffer(
	content: string | ArrayBuffer | SharedArrayBuffer | ArrayBufferView,
): ArrayBuffer {
	if (typeof content === 'string') return stringToArrayBuffer(content);
	if (content instanceof ArrayBuffer) return content;
	if (ArrayBuffer.isView(content)) {
		const { buffer, byteOffset, byteLength } = content;
		if (
			buffer instanceof ArrayBuffer &&
			byteOffset === 0 &&
			byteLength === buffer.byteLength
		)
			return buffer;
		const out = new Uint8Array(byteLength);
		out.set(new Uint8Array(buffer, byteOffset, byteLength));
		return out.buffer;
	}
	if (
		typeof SharedArrayBuffer !== 'undefined' &&
		content instanceof SharedArrayBuffer
	) {
		const src = new Uint8Array(content);
		const out = new Uint8Array(src.byteLength);
		out.set(src);
		return out.buffer;
	}
	throw new Error('Unsupported binary content type');
}

export function toBytes(content: string | ArrayBuffer): Uint8Array {
	if (typeof content === 'string') {
		return new TextEncoder().encode(content);
	}
	return new Uint8Array(content);
}

export function toBase64(content: string | Uint8Array | ArrayBuffer): string {
	const uint8Array =
		typeof content === 'string'
			? new TextEncoder().encode(content)
			: content instanceof ArrayBuffer
				? new Uint8Array(content)
				: content;

	let binaryString = '';

	for (let i = 0; i < uint8Array.length; i++) {
		binaryString += String.fromCharCode(uint8Array[i]);
	}

	return btoa(binaryString);
}

export function formatFileSize(size?: number): string {
	if (!size) return t('Unknown size');
	if (size < 1024) return t('{count} bytes', { count: size });
	if (size < 1024 * 1024)
		return t('{size} KB', { size: (size / 1024).toFixed(1) });
	return t('{size} MB', { size: (size / (1024 * 1024)).toFixed(1) });
}

export async function computeGitBlobSha(
	content: string | ArrayBuffer,
): Promise<string> {
	const bytes =
		typeof content === 'string'
			? new TextEncoder().encode(content)
			: new Uint8Array(content);
	const header = new TextEncoder().encode(`blob ${bytes.byteLength}\0`);
	const data = new Uint8Array(header.byteLength + bytes.byteLength);
	data.set(header, 0);
	data.set(bytes, header.byteLength);
	const hash = await crypto.subtle.digest('SHA-1', data);
	return Array.from(new Uint8Array(hash))
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}

export function getFilenameFromPath(path?: string, extension?: string): string {
	if (!path) return t('No {extension} file', { extension: extension });
	return path ? path.split('/').pop() || path : '';
}

export function getParentPath(path: string): string {
	const lastSlashIndex = path.lastIndexOf('/');
	return lastSlashIndex === 0 ? '/' : path.substring(0, lastSlashIndex);
}

export function getRelativePath(fromPath: string, toPath: string): string {
	const fromParts = fromPath.split('/').filter((p) => p);
	const toParts = toPath.split('/').filter((p) => p);

	fromParts.pop();

	let commonLength = 0;
	while (
		commonLength < fromParts.length &&
		commonLength < toParts.length &&
		fromParts[commonLength] === toParts[commonLength]
	) {
		commonLength++;
	}

	const upLevels = fromParts.length - commonLength;
	const downPath = toParts.slice(commonLength);

	return '../'.repeat(upLevels) + downPath.join('/');
}

export function joinPaths(base: string, path: string): string {
	if (base === '/') {
		return `/${path}`;
	}
	return `${base}/${path}`;
}

export interface NameValidationResult {
	valid: boolean;
	error?: string;
}

const ILLEGAL_NAME_CHARS = /[<>:"/\\|?*\u0000-\u001F]/;
// NOTE (fabawi): File gets excluded from ZIP on WINDOWS if name contains the following
const RESERVED_NAMES =
	/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$|^\.texlyre_/i;
const MAX_NAME_BYTES = 255;

export function validateFileName(name: string): NameValidationResult {
	const trimmed = name.trim();

	if (!trimmed) {
		return { valid: false, error: t('Name cannot be empty') };
	}
	if (trimmed === '.' || trimmed === '..') {
		return { valid: false, error: t('Name cannot be "." or ".."') };
	}
	if (ILLEGAL_NAME_CHARS.test(trimmed)) {
		return {
			valid: false,
			error: t('Name contains illegal characters: < > : " / \\ | ? *'),
		};
	}
	if (/[. ]$/.test(trimmed)) {
		return { valid: false, error: t('Name cannot end with a space or period') };
	}
	if (RESERVED_NAMES.test(trimmed)) {
		return {
			valid: false,
			error: t('"{name}" is a reserved system name', { name: trimmed }),
		};
	}
	if (new TextEncoder().encode(trimmed).length > MAX_NAME_BYTES) {
		return {
			valid: false,
			error: t('Name exceeds {max} bytes', { max: MAX_NAME_BYTES }),
		};
	}
	return { valid: true };
}

export function getMimeType(fileName: string): string {
	return mime.getType(fileName) || 'application/octet-stream';
}

export function getFileExtension(mimeType: string | undefined): string {
	if (!mimeType) return 'bin';
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
		'application/x-xz': 'xz',	
		'application/epub+zip': 'epub',
		'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx'
	};

	return typeMap[mimeType] || mimeType.split('/')[1]?.split('+')[0] || 'png';
}

export function isBinaryFile(fileName: string): boolean {
	const baseName = fileName.split('/').pop()?.toLowerCase() || '';

	if (!baseName) {
		return false;
	}

	const textSuffixes = ['.cmake.in', '.fdb_latexmk', '.gradle.kts'];

	if (textSuffixes.some((suffix) => baseName.endsWith(suffix))) {
		return false;
	}

	const extension = baseName.includes('.')
		? baseName.split('.').pop() || ''
		: '';

	if (!extension) {
		return false;
	}

	const textExtensions = new Set([
		// Build systems / project files
		'bazel',
		'bzl',
		'cake',
		'cmake',
		'csproj',
		'fsproj',
		'gradle',
		'gyp',
		'gypi',
		'mak',
		'make',
		'meson',
		'mk',
		'mkfile',
		'ninja',
		'sln',
		'targets',
		'vbproj',
		'vcxproj',

		// Data / config
		'babelrc',
		'browserslistrc',
		'cfg',
		'cnf',
		'conf',
		'config',
		'coveragerc',
		'curlrc',
		'dockerignore',
		'editorconfig',
		'env',
		'eslintrc',
		'flake8',
		'gitattributes',
		'gitignore',
		'gitmodules',
		'htaccess',
		'htpasswd',
		'ignore',
		'ini',
		'json',
		'json5',
		'jsonc',
		'map',
		'npmignore',
		'npmrc',
		'pnpmfile',
		'prettierrc',
		'properties',
		'props',
		'pylintrc',
		'stylelintrc',
		'toml',
		'wgetrc',
		'yaml',
		'yarnrc',
		'yml',

		// DevOps / infra
		'compose',
		'cue',
		'desktop',
		'hcl',
		'jenkinsfile',
		'jsonnet',
		'kdl',
		'libsonnet',
		'mount',
		'nomad',
		'pipeline',
		'rego',
		'service',
		'skaffold',
		'socket',
		'tf',
		'tfvars',
		'tiltfile',
		'timer',

		// Documentation / API
		'apib',
		'openapi',
		'raml',
		'swagger',

		// General programming languages
		'agda',
		'ahk',
		'apl',
		'asm',
		'bas',
		'bf',
		'bicep',
		'c',
		'c++',
		'cc',
		'cbl',
		'cl',
		'clj',
		'cljc',
		'cljs',
		'cob',
		'coffee',
		'cpp',
		'cr',
		'cs',
		'cxx',
		'd',
		'dart',
		'di',
		'edn',
		'elm',
		'erl',
		'ex',
		'exs',
		'f03',
		'f08',
		'f90',
		'f95',
		'for',
		'forth',
		'fs',
		'fsi',
		'fsscript',
		'fst',
		'fsx',
		'fth',
		'gd',
		'gdshader',
		'gleam',
		'go',
		'groovy',
		'gsp',
		'gvy',
		'gy',
		'h',
		'h++',
		'hack',
		'hh',
		'hpp',
		'hrl',
		'hs',
		'hx',
		'hxx',
		'idr',
		'inc',
		'io',
		'ipynb',
		'java',
		'jl',
		'kt',
		'kts',
		'lagda',
		'lean',
		'lfe',
		'lhs',
		'lid',
		'lisp',
		'lsp',
		'lua',
		'm',
		'm4',
		'mc',
		'ml',
		'mli',
		'mll',
		'mly',
		'mm',
		'nim',
		'nimble',
		'nix',
		'nu',
		'odin',
		'pas',
		'php',
		'php3',
		'php4',
		'php5',
		'php7',
		'php8',
		'phps',
		'phtml',
		'pl',
		'pm',
		'pony',
		'pp',
		'prg',
		'pro',
		'prolog',
		'purs',
		'py',
		'pyi',
		'pyw',
		'r',
		'raku',
		'rakumod',
		'rb',
		're',
		'rei',
		'rkt',
		'rmd',
		'rs',
		's',
		'scala',
		'sc',
		'scm',
		'sml',
		'sol',
		'ss',
		'st',
		'sv',
		'svh',
		'swift',
		't',
		'v',
		'vala',
		'vb',
		'vbs',
		'vd',
		'vhd',
		'vhdl',
		'vhf',
		'wl',
		'wls',
		'x10',
		'zig',

		// LaTeX / TeX ecosystem
		'aux',
		'bbl',
		'bbx',
		'bib',
		'biblatex',
		'bibtex',
		'blg',
		'bst',
		'cbx',
		'clo',
		'cls',
		'def',
		'dtx',
		'fd',
		'fls',
		'glo',
		'gls',
		'idx',
		'ilg',
		'ind',
		'ins',
		'ist',
		'latex',
		'loa',
		'lof',
		'lot',
		'ltx',
		'nav',
		'out',
		'snm',
		'sty',
		'tex',
		'toc',
		'vrb',

		// Logs / patches / diffs
		'diff',
		'log',
		'patch',
		'rej',
		'trace',

		// Misc text-ish formats
		'entitlements',
		'ical',
		'ics',
		'ifb',
		'lrc',
		'pbxproj',
		'plist',
		'po',
		'pot',
		'rc',
		'reg',
		'resx',
		'sami',
		'sbv',
		'smi',
		'srt',
		'strings',
		'sub',
		'ttml',
		'url',
		'vcf',
		'vcs',
		'vtt',
		'webloc',
		'xcconfig',

		// Plain text / docs / markup
		'adoc',
		'asciidoc',
		'context',
		'creole',
		'ditaa',
		'dot',
		'eqn',
		'grap',
		'groff',
		'gv',
		'ily',
		'jtex',
		'ly',
		'man',
		'markdown',
		'md',
		'mdown',
		'mdx',
		'mkdn',
		'ms',
		'nw',
		'noweb',
		'org',
		'pic',
		'ptx',
		'qmd',
		'roff',
		'rst',
		'rtf',
		'rtx',
		'saty',
		'satyh',
		'sil',
		't2t',
		'texi',
		'texinfo',
		'text',
		'textile',
		'troff',
		'txt',
		'w',
		'web',
		'wiki',

		// Shell / scripts
		'awk',
		'bash',
		'bat',
		'cmd',
		'csh',
		'exp',
		'fish',
		'ksh',
		'ps1',
		'psd1',
		'psm1',
		'sed',
		'sh',
		'tcl',
		'zsh',

		// SQL / database
		'ddl',
		'dml',
		'pgsql',
		'psql',
		'sql',

		// Structured data / interchange
		'avsc',
		'csv',
		'cson',
		'geojson',
		'gql',
		'graphql',
		'hjson',
		'jsonl',
		'jsonld',
		'n3',
		'ndjson',
		'nq',
		'nt',
		'proto',
		'psv',
		'rdf',
		'soap',
		'ssv',
		'thrift',
		'topojson',
		'trig',
		'tsv',
		'ttl',
		'wsdl',
		'xsd',

		// Templates
		'ejs',
		'erb',
		'eta',
		'ftl',
		'gotmpl',
		'haml',
		'handlebars',
		'hbs',
		'jade',
		'j2',
		'jinja',
		'jinja2',
		'latte',
		'liquid',
		'mustache',
		'njk',
		'pug',
		'slim',
		'tera',
		'tpl',
		'twig',
		'vm',

		// Typst
		'typ',
		'typst',

		// Web / frontend
		'astro',
		'cjs',
		'css',
		'heex',
		'htm',
		'html',
		'js',
		'jsx',
		'leex',
		'less',
		'mjs',
		'riot',
		'sass',
		'scss',
		'styl',
		'svelte',
		'tsx', // 'svg'
		'ts',
		'vue',
		'webmanifest',
		'xhtml',
		'xml',
		'xsl',
		'xslt',
	]);

	return !textExtensions.has(extension);
}

export function isTemporaryFile(fileName: string): boolean {
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
}

export function isLatexFile(pathOrName: string): boolean {
	if (!pathOrName) return false;
	const lower = pathOrName.toLowerCase();
	return (
		lower.endsWith('.tex') ||
		lower.endsWith('.latex') ||
		lower.endsWith('.ltx') ||
		lower.endsWith('.cls') ||
		lower.endsWith('.sty')
	); // || lower.endsWith('.ind') || lower.endsWith('.bbl')
}

export function isLatexMainFile(pathOrName: string): boolean {
	if (!pathOrName) return false;
	const lower = pathOrName.toLowerCase();
	return (
		lower.endsWith('.tex') || lower.endsWith('.latex') || lower.endsWith('.ltx')
	);
}

export function isTypstFile(pathOrName: string): boolean {
	if (!pathOrName) return false;
	const lower = pathOrName.toLowerCase();
	return lower.endsWith('.typ') || lower.endsWith('.typst');
}

// export function isTypstMainFile(pathOrName: string): boolean {
// 	if (!pathOrName) return false;
// 	const lower = pathOrName.toLowerCase();
// 	return lower.endsWith('.typ') || lower.endsWith('.typst');
// };

export function isBibFile(pathOrName: string): boolean {
	if (!pathOrName) return false;
	const lower = pathOrName.toLowerCase();
	return lower.endsWith('.bib') || lower.endsWith('.bibtex');
}

export function isMarkdownFile(pathOrName: string): boolean {
	if (!pathOrName) return false;
	const lower = pathOrName.toLowerCase();
	return lower.endsWith('.md') || lower.endsWith('.markdown');
}

export function isYamlFile(pathOrName: string): boolean {
	if (!pathOrName) return false;
	const lower = pathOrName.toLowerCase();
	return lower.endsWith('.yml') || lower.endsWith('.yaml');
}

export function isJsonFile(pathOrName: string): boolean {
	if (!pathOrName) return false;
	const lower = pathOrName.toLowerCase();
	return lower.endsWith('.json');
}

export function isHtmlFile(pathOrName: string): boolean {
	if (!pathOrName) return false;
	const lower = pathOrName.toLowerCase();
	return lower.endsWith('.html');
}

export function isLatexContent(content: string): boolean {
	return /\\(?:documentclass|usepackage|begin|end|section|chapter|part|maketitle)/i.test(
		content,
	);
}

export function isTypstContent(content: string): boolean {
	return /(?:#import|#include|#let|#set|^=+\s|\*\*|\/\/)/m.test(content);
}

export function isBibContent(content: string): boolean {
	return /@(?:article|book|inproceedings|incollection|phdthesis|mastersthesis|techreport|misc|manual|conference)\s*\{/i.test(
		content,
	);
}

export const detectFileType = (
	fileName: string | undefined,
	content?: string,
):
	| 'latex'
	| 'typst'
	| 'bib'
	| 'markdown'
	| 'yaml'
	| 'json'
	| 'html'
	| 'unknown' => {
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
