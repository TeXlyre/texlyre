// src/services/DocumentFileSyncService.ts
import debounce from 'lodash/debounce';
import type * as Y from 'yjs';

import { createNamedLogger } from '@/logging';
import { fileStoreService } from './FileStoreService';

const moduleLog = createNamedLogger('DocumentFileSyncService');

const SYNC_DELAY = 2000;
const SYNC_MAX_WAIT = 10000;

interface DocumentWatcher {
	yText: Y.Text;
	sync: { (): void; flush: () => void };
	fileId?: string;
}

const asText = (content?: string | ArrayBuffer): string | undefined => {
	if (typeof content === 'string') return content;
	return content ? new TextDecoder().decode(content) : undefined;
};

class DocumentFileSyncService {
	private watchers = new Map<string, DocumentWatcher>();

	watch(projectId: string, documentId: string, doc: Y.Doc): void {
		const key = `${projectId}-${documentId}`;
		if (this.watchers.has(key)) return;

		const yText = doc.getText('codemirror');
		const sync = debounce(
			() => void this.syncToLinkedFile(key, documentId),
			SYNC_DELAY,
			{ maxWait: SYNC_MAX_WAIT },
		);

		yText.observe(sync);
		this.watchers.set(key, { yText, sync });
	}

	unwatch(projectId: string, documentId: string): void {
		const key = `${projectId}-${documentId}`;
		const watcher = this.watchers.get(key);
		if (!watcher) return;

		watcher.yText.unobserve(watcher.sync);
		watcher.sync.flush();
		this.watchers.delete(key);
	}

	private async syncToLinkedFile(
		key: string,
		documentId: string,
	): Promise<void> {
		const watcher = this.watchers.get(key);
		if (!watcher || watcher.yText.doc?.isDestroyed) return;

		const content = watcher.yText.toString();

		try {
			if (!watcher.fileId) {
				const files = await fileStoreService.getAllFiles(false, false, false);
				watcher.fileId = files.find(
					(file) => file.documentId === documentId,
				)?.id;
				if (!watcher.fileId) return;
			}

			const linkedFile = await fileStoreService.getFile(watcher.fileId);
			if (
				!linkedFile ||
				linkedFile.isDeleted ||
				linkedFile.documentId !== documentId
			) {
				watcher.fileId = undefined;
				return;
			}
			if (asText(linkedFile.content) === content) return;

			await fileStoreService.updateFileContent(watcher.fileId, content);
		} catch (error) {
			moduleLog.error(`Failed to sync document ${documentId} to file:`, error);
		}
	}
}

export const documentFileSyncService = new DocumentFileSyncService();
