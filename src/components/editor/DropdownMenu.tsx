import type React from "react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface DropdownMenuProps {
	children: React.ReactNode;
	targetRef: React.RefObject<HTMLElement>;
	isOpen: boolean;
	onClose: () => void;
}

const DropdownMenu: React.FC<DropdownMenuProps> = ({
	children,
	targetRef,
	isOpen,
	onClose,
}) => {
	const [position, setPosition] = useState({ top: 0, left: 0 });
	const dropdownRef = useRef<HTMLDivElement>(null);
	const positionCalculated = useRef(false);

	useEffect(() => {
		if (!isOpen || !targetRef.current || positionCalculated.current) return;

		const rect = targetRef.current.getBoundingClientRect();

		let top = rect.bottom + 4;
		let left = rect.right - 200;

		const viewportWidth = window.innerWidth;
		const viewportHeight = window.innerHeight;
		const dropdownWidth = 200;
		const dropdownHeight = 250;

		if (left < 4) {
			left = 4;
		} else if (left + dropdownWidth > viewportWidth - 4) {
			left = viewportWidth - dropdownWidth - 4;
		}

		if (top + dropdownHeight > viewportHeight - 4) {
			top = rect.top - dropdownHeight - 4;
			if (top < 4) {
				top = 4;
			}
		}

		setPosition({ top, left });
		positionCalculated.current = true;
	}, [isOpen, targetRef]);

	useEffect(() => {
		if (!isOpen) {
			positionCalculated.current = false;
		}
	}, [isOpen]);

	useEffect(() => {
		if (!isOpen) return;

		const handleClickOutside = (event: MouseEvent) => {
			// Don't close if clicking inside the dropdown
			if (dropdownRef.current?.contains(event.target as Node)) {
				return;
			}

			// Don't close if clicking the trigger button (let the button handle it)
			if (targetRef.current?.contains(event.target as Node)) {
				return;
			}

			// Close for any other clicks
			onClose();
		};

		// Use a slight delay to ensure the dropdown is fully rendered
		const timeoutId = setTimeout(() => {
			document.addEventListener("mousedown", handleClickOutside, true);
		}, 10);

		return () => {
			clearTimeout(timeoutId);
			document.removeEventListener("mousedown", handleClickOutside, true);
		};
	}, [isOpen, onClose, targetRef]);

	if (!isOpen) return null;

	return createPortal(
		<div
			ref={dropdownRef}
			className="dropdown-menu"
			style={{
				position: "fixed",
				top: `${position.top}px`,
				left: `${position.left}px`,
				zIndex: 1001,
				minWidth: "200px",
			}}
			// Remove onClick stopPropagation to allow clicks to bubble
		>
			{children}
		</div>,
		document.body,
	);
};

export default DropdownMenu;
