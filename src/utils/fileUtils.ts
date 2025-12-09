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
}

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
		'image/jpeg': 'jpg',
		'image/png': 'png',
		'image/gif': 'gif',
		'image/webp': 'webp',
		'image/svg+xml': 'svg',
		'application/pdf': 'pdf'
	};

	return typeMap[mimeType] || mimeType.split('/')[1] || 'png';
}

export const isBinaryFile = (fileName: string): boolean => {
	const extension = fileName.split('.').pop()?.toLowerCase() || '';
	const binaryExtensions = new Set([
		'3gp',
		'7z',
		'a',
		'aac',
		'aar',
		'aee',
		'aiff',
		'amr',
		'ape',
		'apk',
		'app',
		'asf',
		'au',
		'avi',
		'bin',
		'bmp',
		'bz2',
		'class',
		'com',
		'deb',
		'dll',
		'dmg',
		'doc',
		'docx',
		'dts',
		'dvi',
		'elf',
		'exe',
		'exp',
		'f4v',
		'flac',
		'flv',
		'fmt',
		'gif',
		'gz',
		'gzip',
		'ico',
		'ipa',
		'iso',
		'iz',
		'jar',
		'jpeg',
		'jpg',
		'ko',
		'lib',
		'lz',
		'lz4',
		'lzma',
		'lzo',
		'm4a',
		'm4v',
		'mkv',
		'mov',
		'mp3',
		'mp4',
		'mpeg',
		'mpg',
		'msi',
		'o',
		'obj',
		'odf',
		'odg',
		'odp',
		'ods',
		'odt',
		'ogg',
		'ogv',
		'opus',
		'otf',
		'pdf',
		'pim',
		'pkg',
		'png',
		'pps',
		'ppt',
		'pptx',
		'ps',
		'psd',
		'pyc',
		'pyo',
		'rar',
		'rm',
		'rmvb',
		'rpm',
		'rtf',
		'so',
		'svg',
		'swf',
		'tar',
		'tec',
		'tfm',
		'tiff',
		'ttf',
		'war',
		'wasm',
		'wav',
		'webm',
		'webp',
		'wma',
		'wmv',
		'woff',
		'woff2',
		'xdv',
		'xip',
		'xls',
		'xlsx',
		'xps',
		'z',
		'zip',
		'zstd',
	]);

	return binaryExtensions.has(extension);
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
	return lower.endsWith('.tex') || lower.endsWith('.latex') || lower.endsWith('.ltx');
};

export const isTypstFile = (pathOrName: string): boolean => {
	if (!pathOrName) return false;
	const lower = pathOrName.toLowerCase();
	return lower.endsWith('.typ') || lower.endsWith('.typst');
};

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

export const isLatexContent = (content: string): boolean => {
	return /\\(?:documentclass|usepackage|begin|end|section|chapter|part|maketitle)/i.test(content);
};

export const isTypstContent = (content: string): boolean => {
	return /(?:#import|#include|#let|#set|^=+\s|\*\*|\/\/)/m.test(content);
};

export const isBibContent = (content: string): boolean => {
	return /@(?:article|book|inproceedings|incollection|phdthesis|mastersthesis|techreport|misc|manual|conference)\s*\{/i.test(content);
};

export const detectFileType = (fileName: string | undefined, content?: string): 'latex' | 'typst' | 'bib' | 'markdown' | 'unknown' => {
	if (fileName) {
		if (isLatexFile(fileName)) return 'latex';
		if (isTypstFile(fileName)) return 'typst';
		if (isBibFile(fileName)) return 'bib';
		if (isMarkdownFile(fileName)) return 'markdown';
	}
	if (content) {
		if (isBibContent(content)) return 'bib';
		if (isTypstContent(content)) return 'typst';
		if (isLatexContent(content)) return 'latex';
	}
	return 'unknown';
};
