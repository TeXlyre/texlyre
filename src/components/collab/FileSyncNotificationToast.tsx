// src/components/collab/FileSyncNotificationToast.tsx
import type React from "react";
import { useEffect, useState } from "react";
import { useFileSync } from "../../hooks/useFileSync.ts";
import type { FileSyncNotification } from "../../types/fileSync.ts";

const FileSyncNotificationToast: React.FC = () => {
	const { notifications, clearNotification } = useFileSync();
	const [visibleNotifications, setVisibleNotifications] = useState<
		FileSyncNotification[]
	>([]);

	useEffect(() => {
		const recentNotifications = notifications
			.filter((n) => Date.now() - n.timestamp < 10000)
			.slice(-3);

		setVisibleNotifications(recentNotifications);

		const timeouts = recentNotifications.map((notification) =>
			setTimeout(() => {
				setVisibleNotifications((prev) =>
					prev.filter((n) => n.id !== notification.id),
				);
			}, 5000),
		);

		return () => {
			timeouts.forEach((timeout) => clearTimeout(timeout));
		};
	}, [notifications]);

	const handleDismiss = (id: string) => {
		setVisibleNotifications((prev) => prev.filter((n) => n.id !== id));
		clearNotification(id);
	};

	if (visibleNotifications.length === 0) return null;

	return (
		<div className="notification-toast-container">
			{visibleNotifications.map((notification) => (
				<div
					key={notification.id}
					className={`notification-toast ${notification.type}`}
				>
					<span className="notification-toast-content">
						{notification.message}
					</span>
					<button
						className="notification-toast-dismiss"
						onClick={() => handleDismiss(notification.id)}
					>
						×
					</button>
				</div>
			))}
		</div>
	);
};

export default FileSyncNotificationToast;