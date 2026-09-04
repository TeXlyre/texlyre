import JSZip from 'jszip';
import { createTar, createTarGzip, parseTar, parseTarGzip } from 'nanotar';
import { nanoid } from 'nanoid';

import type { FileNode } from '../types/files';
import { stripAnnotations } from './fileCommentUtils';
import {
	getMimeType,
	getParentPath,
	isBinaryFile,
	joinPaths,
	toArrayBuffer,
} from './fileUtils';

export const ARCHIVE_ACCEPT =
	'.zip,.tar,.tar.gz,.tgz,.tar.bz2,.tbz,.tbz2,.tar.xz,.txz,.7z,.rar';

const ARCHIVE_EXTENSIONS = ARCHIVE_ACCEPT.split(',');

type ArchiveReaderType = 'zip' | 'tar' | 'tar.gz' | 'libarchive';

export type WritableArchiveFormat = 'zip' | 'tar' | 'tar.gz';

export interface ArchiveEntry {
	path: string;
	data: Uint8Array;
	isDirectory: boolean;
}

export interface DownloadableFile {
	content: Uint8Array;
	name: string;
	mimeType: string;
}

const normalizeArchivePath = (path: string): string => {
	const parts = path
		.replace(/\\/g, '/')
		.split('/')
		.filter((part) => part && part !== '.');

	if (parts.includes('..')) {
		throw new Error(`Archive entry escapes its root: ${path}`);
	}

	return parts.join('/');
};

const toBytes = (content: string | ArrayBuffer | Uint8Array): Uint8Array => {
	if (typeof content === 'string') {
		return new TextEncoder().encode(content);
	}

	if (content instanceof Uint8Array) {
		return content.slice();
	}

	return new Uint8Array(content.slice(0));
};

const hasSignature = (bytes: Uint8Array, signature: number[]): boolean =>
	signature.every((value, index) => bytes[index] === value);

const readerFromName = (name: string): ArchiveReaderType | null => {
	const lower = name.toLowerCase();

	if (lower.endsWith('.zip')) {
		return 'zip';
	}

	if (lower.endsWith('.tar')) {
		return 'tar';
	}

	if (lower.endsWith('.tar.gz') || lower.endsWith('.tgz')) {
		return 'tar.gz';
	}

	if (ARCHIVE_EXTENSIONS.some((extension) => lower.endsWith(extension))) {
		return 'libarchive';
	}

	return null;
};

const detectArchiveReader = async (blob: Blob): Promise<ArchiveReaderType> => {
	const header = new Uint8Array(await blob.slice(0, 512).arrayBuffer());

	if (
		hasSignature(header, [0x50, 0x4b, 0x03, 0x04]) ||
		hasSignature(header, [0x50, 0x4b, 0x05, 0x06]) ||
		hasSignature(header, [0x50, 0x4b, 0x07, 0x08])
	) {
		return 'zip';
	}

	if (hasSignature(header, [0x1f, 0x8b])) {
		return 'tar.gz';
	}

	if (hasSignature(header, [0x42, 0x5a, 0x68])) {
		return 'libarchive';
	}

	if (hasSignature(header, [0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00])) {
		return 'libarchive';
	}

	if (hasSignature(header, [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c])) {
		return 'libarchive';
	}

	if (
		hasSignature(header, [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x00]) ||
		hasSignature(header, [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x01, 0x00])
	) {
		return 'libarchive';
	}

	if (
		header.length >= 262 &&
		new TextDecoder().decode(header.slice(257, 262)) === 'ustar'
	) {
		return 'tar';
	}

	const byName = blob instanceof File ? readerFromName(blob.name) : null;

	if (byName) {
		return byName;
	}

	throw new Error('Unsupported archive format');
};

const readZipEntries = async (blob: Blob): Promise<ArchiveEntry[]> => {
	const data = new Uint8Array(await blob.arrayBuffer());

	const zip = await JSZip.loadAsync(data);

	return Promise.all(
		Object.values(zip.files).map(async (entry) => ({
			path: normalizeArchivePath(entry.name),
			data: entry.dir ? new Uint8Array() : await entry.async('uint8array'),
			isDirectory: entry.dir,
		})),
	).then((entries) => entries.filter((entry) => entry.path));
};

const readTarEntries = async (
	blob: Blob,
	compressed: boolean,
): Promise<ArchiveEntry[]> => {
	const data = new Uint8Array(await blob.arrayBuffer());

	const entries = compressed ? await parseTarGzip(data) : parseTar(data);

	return entries
		.filter((entry) => entry.type === 'file' || entry.type === 'directory')
		.map((entry) => ({
			path: normalizeArchivePath(entry.name),
			data: entry.type === 'file' ? entry.data : new Uint8Array(),
			isDirectory: entry.type === 'directory',
		}))
		.filter((entry) => entry.path);
};

const readLibarchiveEntries = async (blob: Blob): Promise<ArchiveEntry[]> => {
	const [{ ArchiveReader, libarchiveWasm }, { default: wasmUrl }] =
		await Promise.all([
			import('libarchive-wasm'),
			import('libarchive-wasm/dist/libarchive.wasm?url'),
		]);

	const module = await libarchiveWasm({
		locateFile: () => wasmUrl,
	});

	const reader = new ArchiveReader(
		module,
		new Int8Array(await blob.arrayBuffer()),
	);

	const entries: ArchiveEntry[] = [];

	try {
		for (const entry of reader.entries()) {
			const type = entry.getFiletype();

			if (type !== 'File' && type !== 'Directory') {
				continue;
			}

			const path = normalizeArchivePath(entry.getPathname());

			if (!path) {
				continue;
			}

			const raw = type === 'File' ? entry.readData() : undefined;

			entries.push({
				path,
				data: raw
					? new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength).slice()
					: new Uint8Array(),
				isDirectory: type === 'Directory',
			});
		}
	} finally {
		reader.free();
	}

	return entries;
};

export const isArchiveFile = (name: string): boolean => {
	const lower = name.toLowerCase();

	return ARCHIVE_EXTENSIONS.some((extension) => lower.endsWith(extension));
};

export async function readArchiveEntries(blob: Blob): Promise<ArchiveEntry[]> {
	const reader = await detectArchiveReader(blob);

	if (reader === 'zip') {
		return readZipEntries(blob);
	}

	if (reader === 'tar') {
		return readTarEntries(blob, false);
	}

	if (reader === 'tar.gz') {
		return readTarEntries(blob, true);
	}

	return readLibarchiveEntries(blob);
}

export async function createArchiveBlob(
	entries: ArchiveEntry[],
	format: WritableArchiveFormat = 'zip',
): Promise<Blob> {
	if (format === 'zip') {
		const zip = new JSZip();

		for (const entry of entries) {
			if (entry.isDirectory) {
				zip.folder(entry.path);
			} else {
				zip.file(entry.path, entry.data);
			}
		}

		return zip.generateAsync({
			type: 'blob',
		});
	}

	const tarEntries = entries.map((entry) => ({
		name: entry.isDirectory ? `${entry.path}/` : entry.path,
		...(entry.isDirectory
			? {}
			: {
					data: entry.data,
				}),
	}));

	const data =
		format === 'tar.gz'
			? await createTarGzip(tarEntries)
			: createTar(tarEntries);

	return new Blob([toArrayBuffer(data)], {
		type: format === 'tar.gz' ? 'application/gzip' : 'application/x-tar',
	});
}

export class ArchiveStore {
	private files = new Map<string, Uint8Array>();

	private directories = new Set<string>();

	async writeFile(
		path: string,
		content: string | ArrayBuffer | Uint8Array,
	): Promise<void> {
		const normalizedPath = normalizeArchivePath(path);

		this.files.set(normalizedPath, toBytes(content));

		this.addParentDirectories(normalizedPath);
	}

	async readFile(path: string): Promise<string | ArrayBuffer> {
		const normalizedPath = normalizeArchivePath(path);

		const data = this.files.get(normalizedPath);

		if (!data) {
			throw new Error(`File not found: ${normalizedPath}`);
		}

		return isBinaryFile(normalizedPath)
			? toArrayBuffer(data)
			: new TextDecoder().decode(data);
	}

	async createDirectory(path: string): Promise<void> {
		const normalizedPath = normalizeArchivePath(path);

		if (!normalizedPath) {
			return;
		}

		this.directories.add(normalizedPath);

		this.addParentDirectories(`${normalizedPath}/entry`);
	}

	async exists(path: string): Promise<boolean> {
		const normalizedPath = normalizeArchivePath(path);

		if (!normalizedPath) {
			return true;
		}

		if (
			this.files.has(normalizedPath) ||
			this.directories.has(normalizedPath)
		) {
			return true;
		}

		const prefix = `${normalizedPath}/`;

		return (
			[...this.files.keys()].some((entry) => entry.startsWith(prefix)) ||
			[...this.directories].some((entry) => entry.startsWith(prefix))
		);
	}

	async listDirectory(path: string): Promise<string[]> {
		const normalizedPath = normalizeArchivePath(path);

		const prefix = normalizedPath ? `${normalizedPath}/` : '';

		const names = new Set<string>();

		for (const entry of [...this.files.keys(), ...this.directories]) {
			if (!entry.startsWith(prefix)) {
				continue;
			}

			const remaining = entry.slice(prefix.length);

			const name = remaining.split('/')[0];

			if (name) {
				names.add(name);
			}
		}

		return [...names];
	}

	async generateArchive(format: WritableArchiveFormat = 'zip'): Promise<Blob> {
		return createArchiveBlob(this.getEntries(), format);
	}

	async generateZip(): Promise<Blob> {
		return this.generateArchive('zip');
	}

	async loadFromBlob(blob: Blob): Promise<void> {
		this.files.clear();
		this.directories.clear();

		for (const entry of await readArchiveEntries(blob)) {
			if (entry.isDirectory) {
				await this.createDirectory(entry.path);
			} else {
				await this.writeFile(entry.path, entry.data);
			}
		}
	}

	private getEntries(): ArchiveEntry[] {
		return [
			...[...this.directories].map((path) => ({
				path,
				data: new Uint8Array(),
				isDirectory: true,
			})),
			...[...this.files].map(([path, data]) => ({
				path,
				data,
				isDirectory: false,
			})),
		];
	}

	private addParentDirectories(path: string): void {
		const parts = path.split('/');

		for (let index = 1; index < parts.length; index++) {
			this.directories.add(parts.slice(0, index).join('/'));
		}
	}
}

export async function extractArchive(
	archiveFile: File,
	currentPath: string,
): Promise<FileNode[]> {
	const files: FileNode[] = [];
	const directories = new Set<string>();

	const addDirectory = (path: string) => {
		if (!path || path === '/' || directories.has(path)) {
			return;
		}

		directories.add(path);

		files.push({
			id: nanoid(),
			name: path.split('/').filter(Boolean).pop() || '',
			path,
			type: 'directory',
			lastModified: Date.now(),
		});
	};

	for (const entry of await readArchiveEntries(archiveFile)) {
		const fullPath = joinPaths(currentPath, entry.path);

		const parentDir = entry.isDirectory ? fullPath : getParentPath(fullPath);

		let currentDir = '';

		for (const segment of parentDir.split('/').filter(Boolean)) {
			currentDir = currentDir ? `${currentDir}/${segment}` : `/${segment}`;

			addDirectory(currentDir);
		}

		if (entry.isDirectory) {
			continue;
		}

		const fileName = entry.path.split('/').pop() || '';

		files.push({
			id: nanoid(),
			name: fileName,
			path: fullPath,
			type: 'file',
			content: toArrayBuffer(entry.data),
			lastModified: Date.now(),
			size: entry.data.byteLength,
			mimeType: getMimeType(fileName),
			isBinary: isBinaryFile(fileName),
		});
	}

	return files;
}

export async function batchExtractArchive(
	archiveFile: File,
	currentPath: string,
): Promise<{
	files: FileNode[];
	directories: FileNode[];
}> {
	const entries = await extractArchive(archiveFile, currentPath);

	return {
		files: entries.filter((file) => file.type === 'file'),
		directories: entries.filter((file) => file.type === 'directory'),
	};
}

export async function createArchiveFromFolder(
	folderNode: FileNode,
	getFileContent: (fileId: string) => Promise<string | ArrayBuffer | null>,
	_getFile: (fileId: string) => Promise<FileNode | null>,
	format: WritableArchiveFormat = 'zip',
): Promise<Blob> {
	const entries: ArchiveEntry[] = [];

	const collectFiles = async (node: FileNode, basePath = ''): Promise<void> => {
		const relativePath = basePath ? `${basePath}/${node.name}` : node.name;

		if (node.type === 'directory') {
			entries.push({
				path: relativePath,
				data: new Uint8Array(),
				isDirectory: true,
			});

			for (const child of node.children ?? []) {
				await collectFiles(child, relativePath);
			}

			return;
		}

		const content = await getFileContent(node.id);

		if (content === null) {
			return;
		}

		entries.push({
			path: relativePath,
			data: toBytes(stripAnnotations(content)),
			isDirectory: false,
		});
	};

	for (const child of folderNode.children ?? []) {
		await collectFiles(child);
	}

	return createArchiveBlob(entries, format);
}

export function downloadArchiveFile(
	blob: Blob,
	filename: string,
	format: WritableArchiveFormat = 'zip',
): void {
	const extension = format === 'tar.gz' ? '.tar.gz' : `.${format}`;

	const url = URL.createObjectURL(blob);

	const a = document.createElement('a');

	a.href = url;
	a.download = filename.endsWith(extension)
		? filename
		: `${filename}${extension}`;

	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(url);
}

export function downloadFile(
	content: Uint8Array,
	fileName: string,
	mimeType: string,
): void {
	const blob = new Blob([toArrayBuffer(content)], {
		type: mimeType,
	});

	const url = URL.createObjectURL(blob);

	const a = document.createElement('a');

	a.href = url;
	a.download = fileName;

	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(url);
}

export async function createArchiveFromFiles(
	files: DownloadableFile[],
	format: WritableArchiveFormat = 'zip',
): Promise<Blob> {
	return createArchiveBlob(
		files.map((file) => ({
			path: file.name,
			data: file.content,
			isDirectory: false,
		})),
		format,
	);
}

export async function downloadFiles(
	files: DownloadableFile[],
	baseName: string,
): Promise<void> {
	if (files.length === 0) {
		return;
	}

	if (files.length === 1) {
		downloadFile(files[0].content, files[0].name, files[0].mimeType);
	} else {
		const archive = await createArchiveFromFiles(files);

		downloadArchiveFile(archive, `${baseName}_export.zip`);
	}
}
