// src/services/AutoSaveService.ts
import debounce from 'lodash/debounce';

import { createNamedLogger } from '@/logging';

const moduleLog = createNamedLogger('AutoSaveService');

interface AutoSaveOptions {
	enabled: boolean;
	delay: number;
	onSave: (fileId: string, content: string) => void | Promise<void>;
	onError?: (error: Error) => void;
}

class AutoSaveService {
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
					moduleLog.info('Autosave skipped: content is null/undefined');
					return;
				}

				await options.onSave(fileId, contentToSave);
			} catch (error) {
				options.onError?.(error as Error);
			}
		}, options.delay);

		// This cleans up any existing callback for this file
		this.clearAutoSaver(fileId);

		this.saveCallbacks.set(fileId, debouncedSave);
		return debouncedSave;
	}

	clearAutoSaver(fileId: string): void {
		const callback = this.saveCallbacks.get(fileId);
		if (callback) {
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

export const autoSaveService = new AutoSaveService();
