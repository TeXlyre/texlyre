// src/services/ProjectFileSystem.ts
import { nanoid } from 'nanoid';
import type * as Y from 'yjs';

import type { CollabConnectOptions } from '../types/collab';
import type { FileNode } from '../types/files';
import { isTemporaryFile } from '../utils/fileUtils';
import { collabService } from './CollabService';
import { fileStoreService } from './FileStoreService';

export interface ProjectFileEntry {
	path: string;
	type: 'file' | 'directory';
	size?: number;
	binary: boolean;
}

// Project file operations offered to agents, addressed by project path
// (e.g. "/main.tex"). Shared by the ACP fs/* handlers and the MCP tools.
export interface ProjectFileSystem {
	listFiles(): Promise<ProjectFileEntry[]>;
	readTextFile(projectPath: string): Promise<string>;
	writeTextFile(projectPath: string, content: string): Promise<void>;
	// Replaces the single occurrence of oldText. Throws when it is missing or
	// ambiguous so the agent re-reads instead of editing the wrong span.
	editTextFile(
		projectPath: string,
		oldText: string,
		newText: string,
	): Promise<void>;
}

const YTEXT_KEY = 'codemirror';

const decode = (content: FileNode['content']): string =>
	typeof content === 'string'
		? content
		: content
			? new TextDecoder().decode(content)
			: '';

export const applyUniqueEdit = (
	current: string,
	oldText: string,
	newText: string,
	projectPath: string,
): string => {
	if (!oldText) throw new Error('oldText must not be empty');
	const first = current.indexOf(oldText);
	if (first === -1) {
		throw new Error(`oldText was not found in ${projectPath}`);
	}
	if (current.indexOf(oldText, first + 1) !== -1) {
		throw new Error(
			`oldText occurs more than once in ${projectPath}; include more context`,
		);
	}
	return (
		current.slice(0, first) + newText + current.slice(first + oldText.length)
	);
};

// Replaces only the differing middle span so remote cursors, comments and
// concurrent edits outside that span keep their positions.
export const replaceYText = (ytext: Y.Text, next: string): void => {
	const current = ytext.toString();
	if (current === next) return;

	let start = 0;
	const maxStart = Math.min(current.length, next.length);
	while (start < maxStart && current[start] === next[start]) start++;

	let currentEnd = current.length;
	let nextEnd = next.length;
	while (
		currentEnd > start &&
		nextEnd > start &&
		current[currentEnd - 1] === next[nextEnd - 1]
	) {
		currentEnd--;
		nextEnd--;
	}

	const apply = () => {
		if (currentEnd > start) ytext.delete(start, currentEnd - start);
		if (nextEnd > start) ytext.insert(start, next.slice(start, nextEnd));
	};

	if (ytext.doc) ytext.doc.transact(apply, 'agent');
	else apply();
};

const assertWritable = (projectPath: string): void => {
	if (isTemporaryFile(projectPath)) {
		throw new Error(
			`${projectPath} is managed by TeXlyre and cannot be changed`,
		);
	}
};

// Reads and writes through the Yjs document for files linked to one, since the
// Y.Text is authoritative there and the stored file content only trails it via
// DocumentFileSyncService. Unlinked text files go straight to the file store.
export class YjsProjectFileSystem implements ProjectFileSystem {
	constructor(
		private readonly getCollabOptions: () =>
			| CollabConnectOptions
			| undefined = () => undefined,
	) {}

	async listFiles(): Promise<ProjectFileEntry[]> {
		const files = await fileStoreService.getAllFiles(false, false, false);
		// TeXlyre's compile caches and outputs (/.texlyre_*) are internal.
		return files
			.filter((file) => !isTemporaryFile(file.path))
			.map((file) => ({
				path: file.path,
				type: file.type,
				...(file.size !== undefined ? { size: file.size } : {}),
				binary: Boolean(file.isBinary),
			}))
			.sort((left, right) => left.path.localeCompare(right.path));
	}

	async readTextFile(projectPath: string): Promise<string> {
		const file = await this.requireTextFile(projectPath);
		if (!file.documentId) return decode(file.content);

		return this.withDocumentText(file.documentId, (ytext) => ytext.toString());
	}

	async writeTextFile(projectPath: string, content: string): Promise<void> {
		assertWritable(projectPath);
		const file = await fileStoreService.getFileByPath(projectPath);

		if (!file) {
			await this.createTextFile(projectPath, content);
			return;
		}
		if (file.type !== 'file' || file.isBinary) {
			throw new Error(`${projectPath} is not a text file`);
		}

		if (file.documentId) {
			await this.withDocumentText(file.documentId, (ytext) =>
				replaceYText(ytext, content),
			);
			return;
		}

		await fileStoreService.updateFileContent(file.id, content);
	}

	async editTextFile(
		projectPath: string,
		oldText: string,
		newText: string,
	): Promise<void> {
		assertWritable(projectPath);
		const file = await this.requireTextFile(projectPath);

		if (file.documentId) {
			// Read and write in the same synchronous step so a concurrent remote
			// update cannot land between them.
			await this.withDocumentText(file.documentId, (ytext) =>
				replaceYText(
					ytext,
					applyUniqueEdit(ytext.toString(), oldText, newText, projectPath),
				),
			);
			return;
		}

		await fileStoreService.updateFileContent(
			file.id,
			applyUniqueEdit(decode(file.content), oldText, newText, projectPath),
		);
	}

	private async requireTextFile(projectPath: string): Promise<FileNode> {
		const file = await fileStoreService.getFileByPath(projectPath);
		if (!file) throw new Error(`File not found: ${projectPath}`);
		if (file.type !== 'file' || file.isBinary) {
			throw new Error(`${projectPath} is not a text file`);
		}
		return file;
	}

	private async createTextFile(
		projectPath: string,
		content: string,
	): Promise<void> {
		const slash = projectPath.lastIndexOf('/');
		const name = projectPath.slice(slash + 1);
		if (!name) throw new Error(`Invalid file path: ${projectPath}`);

		if (slash > 0) {
			await fileStoreService.createDirectoryPath(projectPath);
		}

		await fileStoreService.storeFile(
			{
				id: nanoid(),
				name,
				path: projectPath,
				type: 'file',
				content,
				lastModified: Date.now(),
				isBinary: false,
			},
			{ showConflictDialog: false },
		);
	}

	private async withDocumentText<T>(
		documentId: string,
		run: (ytext: Y.Text) => T,
	): Promise<T> {
		const projectId = fileStoreService.getCurrentProjectId();
		if (!projectId) throw new Error('No project is open');

		const collectionName = `yjs_${documentId}`;
		// connect() is ref-counted, so this shares the editor's Y.Doc when the
		// document is already open and opens (then releases) it otherwise.
		const { doc } = collabService.connect(
			projectId,
			collectionName,
			this.getCollabOptions(),
		);

		try {
			await collabService.getDocContainer(projectId, collectionName)
				?.persistence.whenSynced;
			return run(doc.getText(YTEXT_KEY));
		} finally {
			collabService.disconnect(projectId, collectionName);
		}
	}
}
