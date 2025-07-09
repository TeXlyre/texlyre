import { notificationService } from '../services/NotificationService';
import { fileStorageService } from '../services/FileStorageService';

class DuplicateKeyDetector {
    private observer: MutationObserver | null = null;
    private autoSanitizeInProgress = false;
    private lastErrorLogTime = 0;
    private seenKeys = new Set<string>();

    start() {
        if (this.observer) return;

        this.observer = new MutationObserver((mutations) => {
            this.checkForDuplicateKeys(mutations);
        });

        this.observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['data-testid', 'class', 'id']
        });
    }

    stop() {
        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }
    }

    private checkForDuplicateKeys(mutations: MutationRecord[]) {
        const fileTreeContainer = document.querySelector('.file-tree-content, .file-tree');
        if (!fileTreeContainer) return;

        const fileNodes = fileTreeContainer.querySelectorAll('.file-node');
        const currentKeys = new Set<string>();
        let hasDuplicates = false;

        fileNodes.forEach((node) => {
            // Look for file path indicators
            const fileNameElement = node.querySelector('.file-name');
            if (fileNameElement) {
                const fileName = fileNameElement.textContent?.trim();
                if (fileName) {
                    if (currentKeys.has(fileName)) {
                        hasDuplicates = true;
                        console.log(`[DuplicateKeyDetector] Found duplicate: ${fileName}`);
                    }
                    currentKeys.add(fileName);
                }
            }
        });

        if (hasDuplicates && !this.autoSanitizeInProgress) {
            const now = Date.now();
            if (now - this.lastErrorLogTime > 5000) {
                this.lastErrorLogTime = now;
                this.handleDuplicateKeyError();
            }
        }
    }

    private async handleDuplicateKeyError() {
        if (this.autoSanitizeInProgress) return;

        this.autoSanitizeInProgress = true;
        const operationId = `auto-sanitize-${Date.now()}`;

        try {
            notificationService.showLoading("Detecting duplicate files...", operationId);

            const result = await fileStorageService.autoSanitizeDuplicates();

            if (result && result.removed > 0) {
                notificationService.showSuccess(
                    `Fixed ${result.removed} duplicate file${result.removed === 1 ? '' : 's'} automatically`,
                    { operationId, duration: 4000 }
                );

                // Trigger a file tree refresh
                document.dispatchEvent(new CustomEvent('refresh-file-tree'));
            } else {
                notificationService.dismiss(operationId);
            }
        } catch (error) {
            console.error("Error auto-sanitizing duplicates:", error);
            notificationService.showError(
                "Failed to fix duplicate files automatically",
                { operationId }
            );
        } finally {
            this.autoSanitizeInProgress = false;
        }
    }
}

export const duplicateKeyDetector = new DuplicateKeyDetector();