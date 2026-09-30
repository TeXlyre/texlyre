// src/components/common/DropdownMenu.tsx
import type React from 'react';

import Popover from './Popover';

interface DropdownMenuProps {
	children: React.ReactNode;
	targetRef: React.RefObject<HTMLElement | null>;
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
}) => (
	<Popover
		anchor={targetRef}
		open={isOpen}
		className={className ? `ui-menu ${className}` : 'ui-menu'}
		axis={mode === 'submenu' ? 'inline' : 'block'}
		align={mode === 'submenu' ? 'start' : 'end'}
		clampHeight
		style={{
			zIndex: 'var(--z-dropdown)',
			minWidth: `${width}px`,
			maxHeight: `${maxHeight}px`,
		}}
		onClose={onClose}
	>
		{children}
	</Popover>
);

export default DropdownMenu;
