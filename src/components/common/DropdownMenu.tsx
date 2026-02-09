// src/components/common/DropdownMenu.tsx
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface DropdownMenuProps {
	children: React.ReactNode;
	targetRef: React.RefObject<HTMLElement>;
	isOpen: boolean;
	onClose: () => void;
	mode?: 'dropdown' | 'submenu';
	width?: number;
	maxHeight?: number;
	className?: string;
}

const DropdownMenu: React.FC<DropdownMenuProps> = ({
	children,
	targetRef,
	isOpen,
	onClose,
	mode = 'dropdown',
	width = 200,
	maxHeight = 430,
	className = '',
}) => {
	const [position, setPosition] = useState({ top: 0, left: 0 });
	const dropdownRef = useRef<HTMLDivElement>(null);
	const positionCalculated = useRef(false);

	useEffect(() => {
		if (!isOpen || !targetRef.current || positionCalculated.current) return;

		const calculatePosition = () => {
			const rect = targetRef.current!.getBoundingClientRect();
			const viewportWidth = window.innerWidth;
			const viewportHeight = window.innerHeight;
			const dropdownWidth = width;
			const dropdownHeight = maxHeight;

			let top = rect.bottom + 4;
			let left = mode === 'submenu' ? rect.right + 4 : rect.right - width;

			if (left < 4) {
				left = 4;
			} else if (left + dropdownWidth > viewportWidth - 4) {
				left = mode === 'submenu' ? rect.left - dropdownWidth - 4 : viewportWidth - dropdownWidth - 4;
			}

			if (top + dropdownHeight > viewportHeight - 4) {
				top = rect.top - dropdownHeight - 4;
				if (top < 4) {
					top = 4;
				}
			}

			setPosition({ top, left });
			positionCalculated.current = true;
		};

		requestAnimationFrame(calculatePosition);
	}, [isOpen, targetRef, mode, width, maxHeight]);

	useEffect(() => {
		if (!isOpen) {
			positionCalculated.current = false;
		}
	}, [isOpen]);

	useEffect(() => {
		if (!isOpen) return;

		const handleClickOutside = (event: MouseEvent) => {
			if (dropdownRef.current?.contains(event.target as Node)) {
				return;
			}

			if (targetRef.current?.contains(event.target as Node)) {
				return;
			}

			onClose();
		};

		const timeoutId = setTimeout(() => {
			document.addEventListener('mousedown', handleClickOutside, true);
		}, 10);

		return () => {
			clearTimeout(timeoutId);
			document.removeEventListener('mousedown', handleClickOutside, true);
		};
	}, [isOpen, onClose, targetRef]);

	if (!isOpen || !positionCalculated.current) return null;

	return createPortal(
		<div
			ref={dropdownRef}
			className={`dropdown-menu ${className}`}
			style={{
				position: 'fixed',
				top: `${position.top}px`,
				left: `${position.left}px`,
				zIndex: 1001,
				minWidth: `${width}px`,
				maxHeight: `${maxHeight}px`,
				visibility: positionCalculated.current ? 'visible' : 'hidden',
			}}>
			{children}
		</div>,
		document.body,
	);
};

export default DropdownMenu;