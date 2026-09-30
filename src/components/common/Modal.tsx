// src/components/common/Modal.tsx
import type React from 'react';
import { type ReactNode, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

import { t } from '@/i18n';
import { CloseIcon } from './Icons';

interface ModalProps {
	isOpen: boolean;
	onClose: () => void;
	title: string;
	icon?: React.ComponentType;
	children: ReactNode;
	size?: 'small' | 'medium' | 'large' | 'wide';
	showCloseButton?: boolean;
	headerActions?: ReactNode;
	closeOnClickOutside?: boolean;
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
	closeOnClickOutside = true,
}) => {
	const modalRef = useRef<HTMLDivElement>(null);
	const IconComponent = icon;

	useEffect(() => {
		const handleEscape = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				if (document.querySelector('.popover-panel')) return;
				onClose();
			}
		};

		const handleClickOutside = (event: MouseEvent) => {
			if (!closeOnClickOutside) return;

			if (
				modalRef.current &&
				!modalRef.current.contains(event.target as Node)
			) {
				const clickedElement = event.target as Element;
				const isInsideAnyModal = clickedElement.closest(
					'[data-role="modal"], .popover-panel',
				);

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

			const openModals = document.querySelectorAll('.modal-overlay');
			if (openModals.length <= 1) {
				document.body.style.overflow = 'auto';
			}
		};
	}, [isOpen, onClose, closeOnClickOutside]);

	if (!isOpen) return null;

	return createPortal(
		<div className='modal-overlay'>
			<div
				className='ui-panel'
				data-role='modal'
				data-size={size}
				ref={modalRef}
			>
				<div className='ui-panel-header' data-role='modal'>
					<h2 className='ui-panel-title'>
						{IconComponent && (
							<span>
								<IconComponent />
							</span>
						)}{' '}
						{title}
					</h2>
					<div className='ui-toolbar-actions' data-gap='sm'>
						{headerActions}
						{showCloseButton && (
							<button
								type='button'
								aria-label={t('Close modal')}
								className='ui-icon-button'
								data-role='modal-close'
								data-variant='subtle'
								onClick={onClose}
								title={t('Close modal')}
							>
								<CloseIcon />
							</button>
						)}
					</div>
				</div>
				<div className='ui-panel-content' data-role='modal' data-overflow='y'>
					{children}
				</div>
			</div>
		</div>,
		document.body,
	);
};

export default Modal;
