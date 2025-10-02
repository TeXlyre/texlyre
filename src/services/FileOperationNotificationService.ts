// src/services/FileOperationNotificationService.ts
import { notificationService } from './NotificationService';

class FileOperationNotificationService {
	showLoading(operationId: string, message: string): void {
		notificationService.showLoading(message, operationId);
	}

	showSuccess(operationId: string, message: string): void {
		notificationService.showSuccess(message, { operationId });
	}

	showError(operationId: string, message: string): void {
		notificationService.showError(message, { operationId });
	}

	updateProgress(operationId: string, message: string): void {
		notificationService.updateProgress(operationId, message);
	}

	dismissOperation(operationId: string): void {
		notificationService.dismiss(operationId);
	}
}

export const fileOperationNotificationService =
	new FileOperationNotificationService();
