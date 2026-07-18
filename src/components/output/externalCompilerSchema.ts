// src/components/output/externalCompilerSchema.ts
import { t } from '@/i18n';
import type {
	CompilerUIField,
	TranslatableText,
} from '../../types/compilation';
import type { FileNode } from '../../types/files';

export const resolveLabel = (value?: TranslatableText): string => {
	if (!value) return '';
	return typeof value === 'string' ? t(value) : t(value.key, value.params);
};

export const fieldDefault = (
	field: CompilerUIField,
): string | number | boolean => {
	if (field.defaultValue !== undefined) return field.defaultValue;
	if (field.kind === 'boolean') return false;
	return field.options?.[0]?.value ?? '';
};

export const collectValues = (
	fields: CompilerUIField[],
	read: (key: string) => unknown,
): {
	format?: string;
	options: Record<string, string | number | boolean>;
} => {
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
};

export const findInputFiles = (
	nodes: FileNode[],
	extensions: string[],
): string[] => {
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
};
