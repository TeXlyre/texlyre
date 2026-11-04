/* biome-ignore-all lint/suspicious/noControlCharactersInRegex: Filename validator must reject control characters. */
// src/utils/fileUtils.ts
import mime from 'mime';

import { t } from '@/i18n';
import type { DirectorySummary, FileNode } from '../types/files';

export {
	arrayBufferToString,
	stringToArrayBuffer,
	latin1ToBytes,
	toArrayBuffer,
	toBytes,
	concatBytes,
	toBase64,
	toBase64Url,
	fromBase64Url,
} from './binaryUtils';

export function formatFileSize(size?: number): string {
	if (!size) return t('Unknown size');
	if (size < 1024) return t('{count} bytes', { count: size });
	if (size < 1024 * 1024)
		return t('{size} KB', { size: (size / 1024).toFixed(1) });
	if (size < 1024 * 1024 * 1024)
		return t('{size} MB', { size: (size / (1024 * 1024)).toFixed(1) });
	return t('{size} GB', { size: (size / (1024 * 1024 * 1024)).toFixed(1) });
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
		'text/vnd.mermaid': 'mmd',
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
		'application/vnd.openxmlformats-officedocument.presentationml.presentation':
			'pptx',
	};

	return typeMap[mimeType] || mimeType.split('/')[1]?.split('+')[0] || 'png';
}

export { isBinaryFile } from './fileBinaryUtils';

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

export function isLatexFile(pathOrName?: string): boolean {
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

export function isLatexMainFile(pathOrName?: string): boolean {
	if (!pathOrName) return false;
	const lower = pathOrName.toLowerCase();
	return (
		lower.endsWith('.tex') || lower.endsWith('.latex') || lower.endsWith('.ltx')
	);
}

export function isTypstFile(pathOrName?: string): boolean {
	if (!pathOrName) return false;
	const lower = pathOrName.toLowerCase();
	return lower.endsWith('.typ') || lower.endsWith('.typst');
}

// export function isTypstMainFile(pathOrName: string): boolean {
// 	if (!pathOrName) return false;
// 	const lower = pathOrName.toLowerCase();
// 	return lower.endsWith('.typ') || lower.endsWith('.typst');
// };

export function isBibFile(pathOrName?: string): boolean {
	if (!pathOrName) return false;
	const lower = pathOrName.toLowerCase();
	return lower.endsWith('.bib') || lower.endsWith('.bibtex');
}

export function isMarkdownFile(pathOrName?: string): boolean {
	if (!pathOrName) return false;
	const lower = pathOrName.toLowerCase();
	return lower.endsWith('.md') || lower.endsWith('.markdown');
}

export function isYamlFile(pathOrName?: string): boolean {
	if (!pathOrName) return false;
	const lower = pathOrName.toLowerCase();
	return lower.endsWith('.yml') || lower.endsWith('.yaml');
}

export function isJsonFile(pathOrName?: string): boolean {
	if (!pathOrName) return false;
	const lower = pathOrName.toLowerCase();
	return lower.endsWith('.json');
}

export function isHtmlFile(pathOrName?: string): boolean {
	if (!pathOrName) return false;
	const lower = pathOrName.toLowerCase();
	return (
		lower.endsWith('.html') ||
		lower.endsWith('.htm') ||
		lower.endsWith('.xhtml')
	);
}

export function isCssFile(pathOrName?: string): boolean {
	if (!pathOrName) return false;
	const lower = pathOrName.toLowerCase();
	return lower.endsWith('.css');
}

export function isXmlFile(pathOrName?: string): boolean {
	if (!pathOrName) return false;
	const lower = pathOrName.toLowerCase();
	return lower.endsWith('.xml') || lower.endsWith('.xsl');
}

export function isRstFile(pathOrName?: string): boolean {
	if (!pathOrName) return false;
	const lower = pathOrName.toLowerCase();
	return lower.endsWith('.rst');
}

export function isTomlFile(pathOrName?: string): boolean {
	if (!pathOrName) return false;
	const lower = pathOrName.toLowerCase();
	return lower.endsWith('.toml');
}

export function isLatexContent(content: string): boolean {
	return /\\(?:documentclass|usepackage|newcommand|renewcommand|providecommand|maketitle|tableofcontents|bibliographystyle|addbibresource)\b/.test(
		content,
	);
}

export function isTypstContent(content: string): boolean {
	return (
		/^\s*#(?:import|include|let|set|show)\b/m.test(content) ||
		/#(?:figure|heading|table|grid|block|text|par|link|cite|ref)\s*\(/.test(
			content,
		)
	);
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
	| 'rst'
	| 'yaml'
	| 'json'
	| 'toml'
	| 'html'
	| 'css'
	| 'xml'
	| 'unknown' => {
	if (fileName) {
		if (isLatexFile(fileName)) return 'latex';
		if (isTypstFile(fileName)) return 'typst';
		if (isBibFile(fileName)) return 'bib';
		if (isMarkdownFile(fileName)) return 'markdown';
		if (isRstFile(fileName)) return 'rst';
		if (isYamlFile(fileName)) return 'yaml';
		if (isJsonFile(fileName)) return 'json';
		if (isTomlFile(fileName)) return 'toml';
		if (isHtmlFile(fileName)) return 'html';
		if (isCssFile(fileName)) return 'css';
		if (isXmlFile(fileName)) return 'xml';

		const baseName = fileName.split('/').pop() ?? fileName;
		if (baseName.lastIndexOf('.') > 0) return 'unknown';
	}
	if (content) {
		if (isBibContent(content)) return 'bib';
		if (isTypstContent(content)) return 'typst';
		if (isLatexContent(content)) return 'latex';
	}
	return 'unknown';
};

export type FileSortField = 'name' | 'modified' | 'size' | 'type';
export type FileSortDirection = 'asc' | 'desc';

const nameExtension = (name: string): string =>
	name.includes('.') ? name.split('.').pop()!.toLowerCase() : '';

const compareByName = (a: FileNode, b: FileNode): number =>
	a.name.localeCompare(b.name, undefined, {
		numeric: true,
		sensitivity: 'base',
	});

const compareNodes = (
	a: FileNode,
	b: FileNode,
	field: FileSortField,
): number => {
	switch (field) {
		case 'modified':
			return (
				(a.lastModified ?? 0) - (b.lastModified ?? 0) || compareByName(a, b)
			);
		case 'size':
			return (a.size ?? 0) - (b.size ?? 0) || compareByName(a, b);
		case 'type':
			return (
				nameExtension(a.name).localeCompare(nameExtension(b.name)) ||
				compareByName(a, b)
			);
		default:
			return compareByName(a, b);
	}
};

export const sortFileTree = (
	nodes: FileNode[],
	field: FileSortField,
	direction: FileSortDirection,
): FileNode[] =>
	nodes
		.map((node) =>
			node.children
				? { ...node, children: sortFileTree(node.children, field, direction) }
				: node,
		)
		.sort((a, b) => {
			if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
			const result = compareNodes(a, b, field);
			return direction === 'asc' ? result : -result;
		});

export const summarizeDirectory = (node: FileNode): DirectorySummary =>
	(node.children ?? []).reduce<DirectorySummary>(
		(summary, child) => {
			if (child.type === 'directory') {
				const nested = summarizeDirectory(child);
				summary.directories += nested.directories + 1;
				summary.files += nested.files;
				summary.size += nested.size;
			} else {
				summary.files += 1;
				summary.size += child.size ?? 0;
			}
			return summary;
		},
		{ files: 0, directories: 0, size: 0 },
	);

export const filterTemporaryFiles = (nodes: FileNode[]): FileNode[] =>
	nodes
		.filter((node) => !isTemporaryFile(node.path))
		.map((node) =>
			node.children
				? { ...node, children: filterTemporaryFiles(node.children) }
				: node,
		);
