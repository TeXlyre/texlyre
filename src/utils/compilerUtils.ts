// src/utils/compilerUtils.ts
import { t } from '@/i18n';
import type {
	CompileArtifact,
	CompilerUIField,
	TranslatableText,
} from '../types/compilation';
import type { FileNode } from '../types/files';
import { getFileExtension } from './fileUtils';

export function resolveLabel(value?: TranslatableText): string {
	if (!value) return '';
	return typeof value === 'string' ? t(value) : t(value.key, value.params);
}

export function fieldDefault(
	field: CompilerUIField,
): string | number | boolean {
	if (field.defaultValue !== undefined) return field.defaultValue;
	if (field.kind === 'boolean') return false;
	return field.options?.[0]?.value ?? '';
}

export function collectValues(
	fields: CompilerUIField[],
	read: (key: string) => unknown,
): {
	format?: string;
	options: Record<string, string | number | boolean>;
} {
	const options: Record<string, string | number | boolean> = {};
	let format: string | undefined;

	for (const field of fields) {
		const stored = read(field.key);
		const value = (stored === undefined ? fieldDefault(field) : stored) as
			| string
			| number
			| boolean;

		if (field.sendAs === 'format') {
			format = String(value);
		} else {
			options[field.key] = value;
		}
	}

	return { format, options };
}

export function findInputFiles(
	nodes: FileNode[],
	extensions: string[],
): string[] {
	const matches: string[] = [];
	for (const node of nodes) {
		if (node.type === 'file') {
			const extension = node.path.split('.').pop()?.toLowerCase() ?? '';
			if (extensions.includes(extension)) matches.push(node.path);
		}
		if (node.children?.length) {
			matches.push(...findInputFiles(node.children, extensions));
		}
	}
	return matches;
}

export function findCompileArtifact(
	artifacts: CompileArtifact[] | undefined,
	id: string,
	extensions: string[] = [],
): CompileArtifact | undefined {
	const normalizedExtensions = extensions.map((extension) =>
		extension.toLowerCase(),
	);

	return artifacts?.find((artifact) => {
		if (artifact.id === id) return true;
		const name = artifact.name.toLowerCase();
		return normalizedExtensions.some((extension) => name.endsWith(extension));
	});
}

const FORMAT_EXTENSIONS = new Set([
	'pdf',
	'svg',
	'png',
	'html',
	'zip',
	'epub',
	'pptx',
	'tex',
	'txt',
	'md',
]);

export function outputExtension(
	mimeType: string | undefined,
	format?: string,
): string {
	if (mimeType && mimeType !== 'application/octet-stream') {
		return getFileExtension(mimeType);
	}
	if (format && FORMAT_EXTENSIONS.has(format)) {
		return format;
	}
	return getFileExtension(mimeType);
}
