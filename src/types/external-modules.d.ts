// src/types/external-modules.d.ts
declare module 'file-saver' {
	export interface FileSaverOptions {
		autoBom?: boolean;
	}

	export function saveAs(
		data: Blob | string,
		filename?: string,
		options?: FileSaverOptions,
	): void;
}

declare module 'fs-extra' {
	interface WriteJsonOptions {
		spaces?: number | string;
	}

	interface FsExtra {
		existsSync(path: string): boolean;
		readdirSync(path: string): string[];
		readFileSync(path: string, encoding: 'utf8'): string;
		readJson<T = unknown>(path: string): Promise<T>;
		writeJson(
			path: string,
			data: unknown,
			options?: WriteJsonOptions,
		): Promise<void>;
	}

	const fs: FsExtra;
	export default fs;
}
