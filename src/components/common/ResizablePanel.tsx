// src/components/common/ResizablePanel.tsx
import type React from 'react';
import { type MouseEvent, useEffect, useRef, useState } from 'react';

interface ResizablePanelProps {
	children: React.ReactNode;
	direction: 'horizontal' | 'vertical';
	width?: number;
	height?: number;
	minWidth?: number | string;
	maxWidth?: number | string;
	minHeight?: number | string;
	maxHeight?: number | string;
	className?: string;
	handleClassName?: string;
	onResize?: (size: number) => void;
	alignment?: 'start' | 'end';
	collapsible?: boolean;
	onCollapse?: (collapsed: boolean) => void;
	collapsed?: boolean;
	defaultCollapsed?: boolean;
	maintainAlignment?: boolean;
}

const ResizablePanel: React.FC<ResizablePanelProps> = ({
	children,
	direction = 'horizontal',
	width = 250,
	height = 250,
	minWidth = 100,
	maxWidth = 500,
	minHeight = 100,
	maxHeight = 500,
	className = '',
	handleClassName = '',
	onResize,
	alignment = 'end',
	collapsible = true,
	onCollapse,
	collapsed: externalCollapsed,
	defaultCollapsed = false,
	maintainAlignment = false,
}) => {
	const [size, setSize] = useState(direction === 'horizontal' ? width : height);
	const [internalCollapsed, setInternalCollapsed] = useState(defaultCollapsed);
	const [previousSize, setPreviousSize] = useState(
		direction === 'horizontal' ? width : height,
	);
	const [resizing, setResizing] = useState(false);
	const [isHovering, setIsHovering] = useState(false);
	const panelRef = useRef<HTMLDivElement>(null);
	const startPosRef = useRef(0);
	const startSizeRef = useRef(0);

	const collapsed =
		externalCollapsed !== undefined ? externalCollapsed : internalCollapsed;

	const parseLimit = (limit: number | string, containerSize: number): number => {
		if (typeof limit === 'string' && limit.endsWith('%')) {
			const percentage = parseFloat(limit.slice(0, -1));
			return Math.round((percentage / 100) * containerSize);
		}
		return typeof limit === 'number' ? limit : parseInt(limit, 10);
	};

	const getContainerSize = (): number => {
		if (!panelRef.current?.parentElement) return direction === 'horizontal' ? 800 : 600;

		const parent = panelRef.current.parentElement;
		return direction === 'horizontal' ? parent.clientWidth : parent.clientHeight;
	};

	const getLimits = () => {
		const containerSize = getContainerSize();

		if (direction === 'horizontal') {
			return {
				min: parseLimit(minWidth, containerSize),
				max: parseLimit(maxWidth, containerSize)
			};
		} else {
			return {
				min: parseLimit(minHeight, containerSize),
				max: parseLimit(maxHeight, containerSize)
			};
		}
	};

	const handleMouseDown = (e: MouseEvent | React.TouchEvent) => {
		e.preventDefault();
		setResizing(true);

		const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
		const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

		startPosRef.current = direction === 'horizontal' ? clientX : clientY;
		startSizeRef.current = size;
		document.body.classList.add('resizing');
		document.body.classList.add(
			direction === 'horizontal' ? 'horizontal-resize' : 'vertical-resize',
		);
	};

	useEffect(() => {
		const newSize = direction === 'horizontal' ? width : height;
		setSize(newSize);
	}, [width, height, direction]);

	useEffect(() => {
		const handleWindowResize = () => {
			if (!maintainAlignment || collapsed) return;

			const { min, max } = getLimits();
			const constrainedSize = Math.max(min, Math.min(max, size));

			if (constrainedSize !== size) {
				setSize(constrainedSize);
				if (onResize) {
					onResize(constrainedSize);
				}
			}
		};

		if (maintainAlignment) {
			window.addEventListener('resize', handleWindowResize);
			return () => window.removeEventListener('resize', handleWindowResize);
		}
	}, [maintainAlignment, collapsed, size, minWidth, maxWidth, minHeight, maxHeight, onResize]);

	useEffect(() => {
		const handleMouseMove = (e: Event) => {
			if (!resizing) return;

			const mouseEvent = e as unknown as MouseEvent;
			const touchEvent = e as unknown as TouchEvent;

			const clientX = touchEvent.touches
				? touchEvent.touches[0].clientX
				: mouseEvent.clientX;
			const clientY = touchEvent.touches
				? touchEvent.touches[0].clientY
				: mouseEvent.clientY;

			const currentPos = direction === 'horizontal' ? clientX : clientY;
			const delta = currentPos - startPosRef.current;
			const adjustedDelta = alignment === 'start' ? -delta : delta;

			let newSize = startSizeRef.current + adjustedDelta;

			const { min, max } = getLimits();
			newSize = Math.max(min, Math.min(max, newSize));

			setSize(newSize);
			if (onResize) {
				onResize(newSize);
			}
		};

		const handleMouseUp = () => {
			setResizing(false);
			document.body.classList.remove('resizing');
			document.body.classList.remove('horizontal-resize');
			document.body.classList.remove('vertical-resize');
		};

		if (resizing) {
			document.addEventListener('mousemove', handleMouseMove);
			document.addEventListener('mouseup', handleMouseUp);
			document.addEventListener('touchmove', handleMouseMove);
			document.addEventListener('touchend', handleMouseUp);
		}

		return () => {
			document.removeEventListener('mousemove', handleMouseMove);
			document.removeEventListener('mouseup', handleMouseUp);
			document.removeEventListener('touchmove', handleMouseMove);
			document.removeEventListener('touchend', handleMouseUp);
		};
	}, [
		resizing,
		direction,
		minWidth,
		maxWidth,
		minHeight,
		maxHeight,
		onResize,
		alignment,
	]);

	const toggleCollapse = () => {
		const newCollapsed = !collapsed;

		if (externalCollapsed === undefined) {
			setInternalCollapsed(newCollapsed);
		}

		if (newCollapsed) {
			setPreviousSize(size);
			setSize(0);
		} else {
			const restoredSize = previousSize;
			setSize(restoredSize);

			if (onResize) {
				onResize(restoredSize);
			}
		}

		if (onCollapse) {
			onCollapse(newCollapsed);
		}
	};

	const handleDoubleClick = () => {
		if (!collapsible) return;
		toggleCollapse();
	};

	const handleMouseEnter = () => {
		setIsHovering(true);
	};

	const handleMouseLeave = () => {
		setIsHovering(false);
	};

	const getHandleClassName = () => {
		const baseClass = `resize-handle ${direction}`;
		const alignmentClass = `${direction === 'horizontal'
			? alignment === 'start'
				? 'left'
				: 'right'
			: alignment === 'start'
				? 'bottom'
				: 'top'
			}`;

		return `${baseClass} ${alignmentClass} ${handleClassName}`;
	};

	const getCollapseButtonClassName = () => {
		const baseClass = 'collapse-button';

		let directionClass = '';
		if (direction === 'horizontal') {
			directionClass = alignment === 'start' ? 'left' : 'right';
		} else {
			directionClass = alignment === 'start' ? 'top' : 'bottom';
		}

		const stateClass = collapsed ? 'collapsed' : 'expanded';

		return `${baseClass} ${directionClass} ${stateClass}`;
	};

	const getCollapseIcon = () => {
		if (direction === 'horizontal') {
			if (alignment === 'start') {
				return collapsed ? '◂' : '▸';
			}
			return collapsed ? '▸' : '◂';
		}
		if (alignment === 'start') {
			return collapsed ? '▴' : '▾';
		}
		return collapsed ? '▾' : '▴';
	};

	const { min: minLimit, max: maxLimit } = getLimits();

	const style: React.CSSProperties = {
		position: 'relative',
		display: 'flex',
		flexDirection: 'column',
		height: '100%',
		...(direction === 'horizontal'
			? {
				width: `${size}px`,
				minWidth: collapsed ? '0' : `${minLimit}px`,
				maxWidth: collapsed ? '0' : `${maxLimit}px`,
				transition: resizing ? 'none' : 'width 0.2s ease-in-out',
			}
			: {
				height: `${size}px`,
				minHeight: collapsed ? '0' : `${minLimit}px`,
				maxHeight: collapsed ? '0' : `${maxLimit}px`,
				transition: resizing ? 'none' : 'height 0.2s ease-in-out',
			}),
	};

	return (
		<div
			ref={panelRef}
			className={`resizable-panel ${resizing ? 'dragging' : ''} ${collapsed ? 'collapsed' : ''} ${className}`}
			style={style}
			onMouseEnter={handleMouseEnter}
			onMouseLeave={handleMouseLeave}
		>
			<div className={`panel-content ${collapsed ? 'hidden' : ''}`}>
				{children}
			</div>
			<div
				className={getHandleClassName()}
				onMouseDown={handleMouseDown}
				onTouchStart={handleMouseDown}
				onDoubleClick={handleDoubleClick}
			/>
			{collapsible && (isHovering || collapsed) && (
				<button
					className={`${getCollapseButtonClassName()} ${collapsed ? 'always-visible' : ''}`}
					onClick={(e) => {
						e.stopPropagation();
						toggleCollapse();
					}}
					title={collapsed ? 'Expand' : 'Collapse'}
				>
					<span className="collapse-icon">{getCollapseIcon()}</span>
				</button>
			)}
		</div>
	);
};

export default ResizablePanel;