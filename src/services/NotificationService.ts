// src/services/NotificationService.ts
export type NotificationType =
	| "loading"
	| "success"
	| "error"
	| "info"
	| "sync";

export interface NotificationOptions {
	operationId?: string;
	duration?: number; // 0 for persistent, undefined for default
	data?: Record<string, any>;
}

class NotificationService {
	private activeOperations = new Map<
		string,
		{ type: string; message: string; timeoutId?: NodeJS.Timeout }
	>();

	show(
		type: NotificationType,
		message: string,
		options: NotificationOptions = {},
	): void {
		const { operationId, duration, data } = options;

		// Clear any existing timeout for this operation
		if (operationId) {
			const existing = this.activeOperations.get(operationId);
			if (existing?.timeoutId) {
				clearTimeout(existing.timeoutId);
			}
			this.activeOperations.set(operationId, { type, message });
		}

		this.emit(type, message, operationId, duration, data);
	}

	showLoading(message: string, operationId?: string): void {
		this.show("loading", message, { operationId, duration: 0 });
	}

	showSuccess(message: string, options: NotificationOptions = {}): void {
		this.show("success", message, options);
		if (options.operationId) {
			this.activeOperations.delete(options.operationId);
		}
	}

	showError(message: string, options: NotificationOptions = {}): void {
		this.show("error", message, options);
		if (options.operationId) {
			this.activeOperations.delete(options.operationId);
		}
	}

	showInfo(message: string, options: NotificationOptions = {}): void {
		this.show("info", message, options);
	}

	showSync(message: string, options: NotificationOptions = {}): void {
		this.show("sync", message, options);
	}

	updateProgress(operationId: string, message: string): void {
		if (this.activeOperations.has(operationId)) {
			this.show("loading", message, { operationId, duration: 0 });
		}
	}

	dismiss(operationId: string): void {
		const existing = this.activeOperations.get(operationId);
		if (existing?.timeoutId) {
			clearTimeout(existing.timeoutId);
		}
		this.activeOperations.delete(operationId);
		this.emit("dismiss", "", operationId);
	}

	private emit(
		type: string,
		message: string,
		operationId?: string,
		duration?: number,
		data?: Record<string, any>,
	): void {
		document.dispatchEvent(
			new CustomEvent("toast-notification", {
				detail: { type, message, operationId, duration, data },
			}),
		);
	}
}

export const notificationService = new NotificationService();
