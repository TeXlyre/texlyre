// src/components/editor/FileOperationToast.tsx
import type React from 'react';
import { useEffect, useState } from 'react';

import { AlertCircleIcon, CheckIcon, LoaderIcon } from '../common/Icons';

interface FileOperationToast {
	id: string;
	operationId?: string;
	type: 'loading' | 'success' | 'error';
	message: string;
	timestamp: number;
}

const FileOperationToast: React.FC = () => {
	const [toasts, setToasts] = useState<FileOperationToast[]>([]);

	useEffect(() => {
		const handleFileOperation = (event: CustomEvent) => {
			const { type, message, operationId } = event.detail;

			if (type === 'dismiss' && operationId) {
				setToasts((prev) => prev.filter((t) => t.operationId !== operationId));
				return;
			}

			const toastId = operationId || Math.random().toString(36).substring(2);
			const toast: FileOperationToast = {
				id: toastId,
				operationId,
				type,
				message,
				timestamp: Date.now(),
			};

			setToasts((prev) => {
				// If this is an update to an existing operation, replace it
				if (operationId) {
					const existingIndex = prev.findIndex(
						(t) => t.operationId === operationId,
					);
					if (existingIndex >= 0) {
						const updated = [...prev];
						updated[existingIndex] = toast;
						return updated;
					}
				}
				// Otherwise add new toast
				return [...prev, toast];
			});
		};

		document.addEventListener('file-operation', handleFileOperation);
		return () =>
			document.removeEventListener('file-operation', handleFileOperation);
	}, []);

	const dismissToast = (id: string, operationId?: string) => {
		setToasts((prev) => prev.filter((t) => t.id !== id));
		if (operationId) {
			// Also notify the service to clean up
			document.dispatchEvent(
				new CustomEvent('file-operation', {
					detail: { type: 'dismiss', message: '', operationId },
				}),
			);
		}
	};

	if (toasts.length === 0) return null;

	return (
		<div className="file-operation-toast-container">
			{toasts.map((toast) => (
				<div key={toast.id} className={`file-operation-toast ${toast.type}`}>
					<div className="toast-icon">
						{toast.type === 'loading' && <LoaderIcon />}
						{toast.type === 'success' && <CheckIcon />}
						{toast.type === 'error' && <AlertCircleIcon />}
					</div>
					<span className="toast-message">{toast.message}</span>
					{toast.type !== 'loading' && (
						<button
							className="toast-dismiss"
							onClick={() => dismissToast(toast.id, toast.operationId)}
						>
							×
						</button>
					)}
				</div>
			))}
		</div>
	);
};

export default FileOperationToast;
