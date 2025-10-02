// src/components/common/Modal.tsx
import type React from 'react';
import { type ReactNode, useEffect, useRef } from 'react';

import { CloseIcon } from './Icons';

interface ModalProps {
	isOpen: boolean;
	onClose: () => void;
	title: string;
	icon?: React.ComponentType;
	children: ReactNode;
	size?: 'small' | 'medium' | 'large';
	showCloseButton?: boolean;
	headerActions?: ReactNode;
}

const Modal: React.FC<ModalProps> = ({
	isOpen,
	onClose,
	title,
	icon,
	children,
	size = 'medium',
	showCloseButton = true,
	headerActions,
}) => {
	const modalRef = useRef<HTMLDivElement>(null);
	const IconComponent = icon;

	useEffect(() => {
		const handleEscape = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				onClose();
			}
		};

		const handleClickOutside = (event: MouseEvent) => {
			if (
				modalRef.current &&
				!modalRef.current.contains(event.target as Node)
			) {
				// Check if the click is inside any modal
				const clickedElement = event.target as Element;
				const isInsideAnyModal = clickedElement.closest('.modal-container');

				// Only close if the click is not inside any modal
				if (!isInsideAnyModal) {
					onClose();
				}
			}
		};

		if (isOpen) {
			document.addEventListener('keydown', handleEscape);
			document.addEventListener('mousedown', handleClickOutside);
			document.body.style.overflow = 'hidden';
		}

		return () => {
			document.removeEventListener('keydown', handleEscape);
			document.removeEventListener('mousedown', handleClickOutside);
			// Only restore body overflow if no other modals are open
			const openModals = document.querySelectorAll('.modal-overlay');
			if (openModals.length <= 1) {
				document.body.style.overflow = 'auto';
			}
		};
	}, [isOpen, onClose]);

	if (!isOpen) return null;

	return (
		<div className="modal-overlay">
			<div className={`modal-container modal-${size}`} ref={modalRef}>
				<div className="modal-header">
					<h2>
						{IconComponent && (
							<span>
								<IconComponent />
							</span>
						)}{' '}
						{title}
					</h2>
					<div style={{ display: 'flex', gap: '0.5rem' }}>
						{headerActions}
						{showCloseButton && (
							<button className="modal-close-button" onClick={onClose}>
								<CloseIcon />
							</button>
						)}
					</div>
				</div>
				<div className="modal-content">{children}</div>
			</div>
		</div>
	);
};

export default Modal;
