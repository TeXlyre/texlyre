// src/utils/autoSaveUtils.ts
import { debounce } from 'lodash';
import { fileStorageService } from '../services/FileStorageService';

interface AutoSaveOptions {
	enabled: boolean;
	delay: number;
	onSave?: (fileId: string, content: string) => void | Promise<void>;
	onError?: (error: Error) => void;
}

class AutoSaveManager {
	private saveCallbacks = new Map<string, () => void>();

	createAutoSaver(
		fileId: string,
		getContent: () => string,
		options: AutoSaveOptions,
	): () => void {
		if (!options.enabled) {
			return () => {};
		}
		const debouncedSave = debounce(async () => {
			try {
				const contentToSave = getContent();

				if (contentToSave === null || contentToSave === undefined) {
					console.log('[autoSaveUtils] Autosave skipped: content is null/undefined');
					return;
				}

				const encoder = new TextEncoder();
				const dataToSave = encoder.encode(contentToSave).buffer;

				await fileStorageService.updateFileContent(fileId, dataToSave);
				await options.onSave?.(fileId, contentToSave);
			} catch (error) {
				options.onError?.(error as Error);
			}
		}, options.delay);

		// Clean up any existing callback for this file
		this.clearAutoSaver(fileId);

		this.saveCallbacks.set(fileId, debouncedSave);
		return debouncedSave;
	}

	clearAutoSaver(fileId: string): void {
		const callback = this.saveCallbacks.get(fileId);
		if (callback) {
			// Cancel any pending saves
			(callback as any).cancel?.();
			this.saveCallbacks.delete(fileId);
		}
	}

	async flushPendingSaves(): Promise<undefined[]> {
		const promises = Array.from(this.saveCallbacks.values()).map(
			(callback) => (callback as any).flush?.() || Promise.resolve(),
		);
		return Promise.all(promises);
	}
}

export const autoSaveManager = new AutoSaveManager();
