// src/components/common/PositionedDropdown.tsx
import type React from 'react';

import Popover from './Popover';

interface PositionedDropdownProps {
	children: React.ReactNode;
	isOpen: boolean;
	triggerElement: HTMLElement | null;
	className?: string;
	spacing?: number;
	padding?: number;
	align?: 'left' | 'right';
	onClose?: () => void;
}

const PositionedDropdown: React.FC<PositionedDropdownProps> = ({
	children,
	isOpen,
	triggerElement,
	className = '',
	spacing = 4,
	padding = 8,
	align = 'right',
	onClose,
}) => (
	<Popover
		anchor={triggerElement}
		open={isOpen}
		className={className}
		align={align === 'right' ? 'end' : 'start'}
		spacing={spacing}
		padding={padding}
		clampHeight
		style={{ zIndex: 1001, width: 'max-content' }}
		onClose={onClose}
	>
		{children}
	</Popover>
);

export default PositionedDropdown;
