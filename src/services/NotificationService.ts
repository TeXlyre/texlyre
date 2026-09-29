// src/services/NotificationService.ts
import type { NotificationType, ToastEventType } from '../types/notifications';

export type { NotificationType } from '../types/notifications';

export type NotificationMode = 'all' | 'errors' | 'off';

export function normalizeNotificationMode(
	value: unknown,
	fallback: NotificationMode = 'all',
): NotificationMode {
	if (value === true) return 'all';
	if (value === false) return 'off';
	return value === 'all' || value === 'errors' || value === 'off'
		? value
		: fallback;
}

export function shouldShowNotification(
	settingId: string,
	type: NotificationType,
	fallback: NotificationMode = 'all',
): boolean {
	try {
		const userId = localStorage.getItem('texlyre-current-user');
		const storageKey = userId
			? `texlyre-user-${userId}-settings`
			: 'texlyre-settings';
		const settings = JSON.parse(localStorage.getItem(storageKey) || '{}');
		const mode = normalizeNotificationMode(settings[settingId], fallback);
		return mode === 'all' || (mode === 'errors' && type === 'error');
	} catch {
		return fallback === 'all' || (fallback === 'errors' && type === 'error');
	}
}

export interface NotificationOptions<F extends string = string> {
	operationId?: string;
	duration?: number;
	data?: Record<string, unknown>;
	format?: F;
}

class NotificationService {
	private activeOperations = new Map<
		string,
		{ type: string; message: string; timeoutId?: ReturnType<typeof setTimeout> }
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
		this.show('loading', message, { operationId, duration: 0 });
	}

	showSuccess(message: string, options: NotificationOptions = {}): void {
		this.show('success', message, options);
		if (options.operationId) {
			this.activeOperations.delete(options.operationId);
		}
	}

	showError(message: string, options: NotificationOptions = {}): void {
		this.show('error', message, options);
		if (options.operationId) {
			this.activeOperations.delete(options.operationId);
		}
	}

	showInfo(message: string, options: NotificationOptions = {}): void {
		this.show('info', message, options);
	}

	showSync(message: string, options: NotificationOptions = {}): void {
		this.show('sync', message, options);
	}

	updateProgress(operationId: string, message: string): void {
		if (this.activeOperations.has(operationId)) {
			this.show('loading', message, { operationId, duration: 0 });
		}
	}

	dismiss(operationId: string): void {
		const existing = this.activeOperations.get(operationId);
		if (existing?.timeoutId) {
			clearTimeout(existing.timeoutId);
		}
		this.activeOperations.delete(operationId);
		this.emit('dismiss', '', operationId);
	}

	private emit(
		type: ToastEventType,
		message: string,
		operationId?: string,
		duration?: number,
		data?: Record<string, unknown>,
	): void {
		document.dispatchEvent(
			new CustomEvent('toast-notification', {
				detail: { type, message, operationId, duration, data },
			}),
		);
	}
}

export const notificationService = new NotificationService();
