// src/components/common/Toast.tsx
import type React from 'react';
import { useEffect, useState } from 'react';

import {
	AlertCircleIcon,
	CheckIcon,
	InfoIcon,
	LoaderIcon,
	SyncIcon,
} from './Icons';

export interface ToastNotification {
	id: string;
	type: 'loading' | 'success' | 'error' | 'info' | 'sync';
	message: string;
	timestamp: number;
	operationId?: string;
	duration?: number; // Auto-dismiss duration in ms, null for persistent
	data?: Record<string, any>;
}

interface ToastProps {
	notification: ToastNotification;
	onDismiss: (id: string, operationId?: string) => void;
}

const Toast: React.FC<ToastProps> = ({ notification, onDismiss }) => {
	const [isVisible, setIsVisible] = useState(true);

	useEffect(() => {
		if (notification.duration && notification.duration > 0) {
			const timer = setTimeout(() => {
				setIsVisible(false);
				setTimeout(
					() => onDismiss(notification.id, notification.operationId),
					300,
				);
			}, notification.duration);

			return () => clearTimeout(timer);
		}
	}, [
		notification.duration,
		notification.id,
		notification.operationId,
		onDismiss,
	]);

	const getIcon = () => {
		switch (notification.type) {
			case 'loading':
				return <LoaderIcon />;
			case 'success':
				return <CheckIcon />;
			case 'error':
				return <AlertCircleIcon />;
			case 'sync':
				return <SyncIcon />;
			default:
				return <InfoIcon />;
		}
	};

	const getTypeClass = () => {
		switch (notification.type) {
			case 'loading':
				return 'toast-loading';
			case 'success':
				return 'toast-success';
			case 'error':
				return 'toast-error';
			case 'sync':
				return 'toast-sync';
			default:
				return 'toast-info';
		}
	};

	return (
		<div
			className={`toast ${getTypeClass()} ${isVisible ? 'toast-visible' : 'toast-hidden'}`}
		>
			<div className="toast-icon">{getIcon()}</div>
			<span className="toast-message">{notification.message}</span>
			{notification.type !== 'loading' && (
				<button
					className="toast-dismiss"
					onClick={() => onDismiss(notification.id, notification.operationId)}
				>
					×
				</button>
			)}
		</div>
	);
};

export default Toast;
