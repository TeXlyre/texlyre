// src/utils/fileUtils.ts
import mime from "mime";

export const arrayBufferToString = (buffer: ArrayBuffer): string => {
	return new TextDecoder().decode(buffer);
};

export const stringToArrayBuffer = (str: string): ArrayBuffer => {
	return new TextEncoder().encode(str).buffer;
};

export const getFilenameFromPath = (path: string): string => {
	const parts = path.split("/");
	return parts[parts.length - 1];
};

export const getParentPath = (path: string): string => {
	const lastSlashIndex = path.lastIndexOf("/");
	return lastSlashIndex === 0 ? "/" : path.substring(0, lastSlashIndex);
};

export const joinPaths = (base: string, path: string): string => {
	if (base === "/") {
		return `/${path}`;
	}
	return `${base}/${path}`;
};

export const getMimeType = (fileName: string): string => {
	return mime.getType(fileName) || "application/octet-stream";
};

export const isBinaryFile = (fileName: string): boolean => {
	const extension = fileName.split(".").pop()?.toLowerCase() || "";
	const binaryExtensions = new Set([
		"3gp",
		"7z",
		"a",
		"aac",
		"aar",
		"aee",
		"aiff",
		"amr",
		"ape",
		"apk",
		"app",
		"asf",
		"au",
		"avi",
		"bin",
		"bmp",
		"bz2",
		"class",
		"com",
		"deb",
		"dll",
		"dmg",
		"doc",
		"docx",
		"dts",
		"dvi",
		"elf",
		"exe",
		"exp",
		"f4v",
		"flac",
		"flv",
		"fmt",
		"gif",
		"gz",
		"gzip",
		"ico",
		"ipa",
		"iso",
		"iz",
		"jar",
		"jpeg",
		"jpg",
		"ko",
		"lib",
		"lz",
		"lz4",
		"lzma",
		"lzo",
		"m4a",
		"m4v",
		"mkv",
		"mov",
		"mp3",
		"mp4",
		"mpeg",
		"mpg",
		"msi",
		"o",
		"obj",
		"odf",
		"odg",
		"odp",
		"ods",
		"odt",
		"ogg",
		"ogv",
		"opus",
		"otf",
		"pdf",
		"pim",
		"pkg",
		"png",
		"pps",
		"ppt",
		"pptx",
		"ps",
		"pyc",
		"pyo",
		"rar",
		"rm",
		"rmvb",
		"rpm",
		"rtf",
		"so",
		"svg",
		"swf",
		"tar",
		"tec",
		"tfm",
		"tiff",
		"ttf",
		"war",
		"wasm",
		"wav",
		"webm",
		"webp",
		"wma",
		"wmv",
		"woff",
		"woff2",
		"xdv",
		"xip",
		"xls",
		"xlsx",
		"z",
		"zip",
		"zstd",
	]);

	return binaryExtensions.has(extension);
};

export const isTemporaryFile = (fileName: string): boolean => {
	const temporaryPaths = [
		// '/.texlyre_src',
		// '/.texlyre_cache',
		// '/.texlyre_temp',
		"/.texlyre",
		"/.git",
		"/.svn",
		"/node_modules",
		"/.DS_Store",
	];

	return temporaryPaths.some((tempPath) => fileName.startsWith(tempPath));
};
