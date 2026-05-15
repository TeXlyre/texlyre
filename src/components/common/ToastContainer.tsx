// src/components/common/ToastContainer.tsx
import type React from 'react';
import { useEffect, useState } from 'react';

import Toast, { type ToastNotification } from './Toast';

const getDefaultDuration = (type: string): number => {
	switch (type) {
		case 'loading':
			return 0;
		case 'success':
			return 3000;
		case 'error':
			return 5000;
		case 'sync':
			return 4000;
		default:
			return 3000;
	}
};

const ToastContainer: React.FC = () => {
	const [notifications, setNotifications] = useState<ToastNotification[]>([]);

	useEffect(() => {
		const handleToastEvent = (event: CustomEvent) => {
			const { type, message, operationId, duration, data } = event.detail;

			if (type === 'dismiss' && operationId) {
				setNotifications((prev) =>
					prev.filter((n) => n.operationId !== operationId),
				);
				return;
			}

			const notification: ToastNotification = {
				id: operationId || Math.random().toString(36).substring(2),
				operationId,
				type,
				message,
				timestamp: Date.now(),
				duration: duration !== undefined ? duration : getDefaultDuration(type),
				data,
			};

			setNotifications((prev) => {
				if (operationId) {
					const existingIndex = prev.findIndex(
						(n) => n.operationId === operationId,
					);
					if (existingIndex >= 0) {
						const updated = [...prev];
						updated[existingIndex] = notification;
						return updated;
					}
				}
				return [...prev, notification];
			});
		};

		document.addEventListener('toast-notification', handleToastEvent);
		return () =>
			document.removeEventListener('toast-notification', handleToastEvent);
	}, []);

	const handleDismiss = (id: string, operationId?: string) => {
		setNotifications((prev) => prev.filter((n) => n.id !== id));
		if (operationId) {
			document.dispatchEvent(
				new CustomEvent('toast-notification', {
					detail: { type: 'dismiss', message: '', operationId },
				}),
			);
		}
	};

	if (notifications.length === 0) return null;

	return (
		<div className="toast-container">
			{notifications.slice(-5).map((notification) => (
				<Toast
					key={notification.id}
					notification={notification}
					onDismiss={handleDismiss}
				/>
			))}
		</div>
	);
};

export default ToastContainer;
