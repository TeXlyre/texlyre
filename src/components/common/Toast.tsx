// src/components/common/Toast.tsx
import type React from 'react';
import { useEffect, useState } from 'react';

import { t } from '@/i18n';
import type { ToastNotification } from '../../types/notifications';
import {
	AlertCircleIcon,
	CheckIcon,
	InfoIcon,
	LoaderIcon,
	SyncIcon,
} from './Icons';

export type { ToastAction, ToastNotification } from '../../types/notifications';

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

	const getTone = () => {
		switch (notification.type) {
			case 'loading':
				return 'warning';
			case 'success':
				return 'success';
			case 'error':
				return 'error';
			default:
				return 'info';
		}
	};

	return (
		<div
			className='toast ui-message'
			data-layout='inline'
			data-tone={getTone()}
			data-state={notification.type === 'loading' ? 'loading' : undefined}
			data-visible={isVisible ? 'true' : 'false'}
		>
			<span className='ui-icon'>{getIcon()}</span>
			<div className='ui-stack' data-gap='xs' data-grow='true'>
				<span>{notification.message}</span>
				{notification.actions && notification.actions.length > 0 && (
					<div className='ui-actions' data-wrap='true'>
						{notification.actions.map((action) => (
							<button
								type='button'
								key={action.label}
								className={`button ${action.variant ?? 'secondary'}`}
								onClick={() => {
									action.onClick();
									onDismiss(notification.id, notification.operationId);
								}}
							>
								{action.label}
							</button>
						))}
					</div>
				)}
			</div>
			{notification.type !== 'loading' && (
				<button
					type='button'
					aria-label={t('Dismiss notification')}
					className='ui-icon-button'
					data-variant='ghost'
					data-size='xs'
					onClick={() => onDismiss(notification.id, notification.operationId)}
					title={t('Dismiss notification')}
				>
					<span aria-hidden='true'>×</span>
				</button>
			)}
		</div>
	);
};

export default Toast;
