// src/utils/duplicateKeyDetector.ts
import { fileStorageService } from '../services/FileStorageService';
import { notificationService } from '../services/NotificationService';

class DuplicateKeyDetector {
	private observer: MutationObserver | null = null;
	private autoSanitizeInProgress = false;
	private lastErrorLogTime = 0;

	start() {
		if (this.observer) return;

		this.observer = new MutationObserver((mutations) => {
			this.checkForDuplicateKeys(mutations);
		});

		this.observer.observe(document.body, {
			childList: true,
			subtree: true,
			attributes: true,
			attributeFilter: ['data-testid', 'class', 'id'],
		});
	}

	stop() {
		if (this.observer) {
			this.observer.disconnect();
			this.observer = null;
		}
	}

	private async checkForDuplicateKeys(_mutations: MutationRecord[]) {
		if (this.autoSanitizeInProgress) return;

		try {
			const result = await fileStorageService.autoSanitizeDuplicates();

			if (result && result.removed > 0) {
				const now = Date.now();
				if (now - this.lastErrorLogTime > 5000) {
					this.lastErrorLogTime = now;
					console.log(
						`[DuplicateKeyDetector] Found and fixed ${result.removed} duplicates`,
					);
					this.handleDuplicateKeyError();
				}
			}
		} catch (error) {
			console.error('Error checking for duplicates:', error);
		}
	}

	private async handleDuplicateKeyError() {
		if (this.autoSanitizeInProgress) return;

		this.autoSanitizeInProgress = true;
		const operationId = `auto-sanitize-${Date.now()}`;

		try {
			notificationService.showLoading(
				'Detecting duplicate files...',
				operationId,
			);

			const result = await fileStorageService.autoSanitizeDuplicates();

			if (result && result.removed > 0) {
				notificationService.showSuccess(
					`Fixed ${result.removed} duplicate file${result.removed === 1 ? '' : 's'} automatically`,
					{ operationId, duration: 4000 },
				);

				document.dispatchEvent(new CustomEvent('refresh-file-tree'));
			} else {
				notificationService.dismiss(operationId);
			}
		} catch (error) {
			console.error('Error auto-sanitizing duplicates:', error);
			notificationService.showError(
				'Failed to fix duplicate files automatically',
				{ operationId },
			);
		} finally {
			this.autoSanitizeInProgress = false;
		}
	}
}

export const duplicateKeyDetector = new DuplicateKeyDetector();
