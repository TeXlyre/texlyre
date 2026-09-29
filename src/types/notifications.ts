export type NotificationType =
	| 'loading'
	| 'success'
	| 'error'
	| 'info'
	| 'sync';

export type ToastEventType = NotificationType | 'dismiss';

export interface ToastAction {
	label: string;
	onClick: () => void;
	variant?: 'primary' | 'secondary' | 'danger';
}

export interface ToastEventDetail {
	type: ToastEventType;
	message: string;
	operationId?: string;
	duration?: number;
	data?: Record<string, unknown>;
	actions?: ToastAction[];
}

export interface ToastNotification {
	id: string;
	type: NotificationType;
	message: string;
	timestamp: number;
	operationId?: string;
	duration?: number;
	data?: Record<string, unknown>;
	actions?: ToastAction[];
}

declare global {
	interface DocumentEventMap {
		'toast-notification': CustomEvent<ToastEventDetail>;
	}
}
