// src/components/common/ResizablePanel.tsx
import type React from 'react';
import {
	createContext,
	type MouseEvent,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from 'react';

import { t } from '@/i18n';

type PanelDirection = 'horizontal' | 'vertical';
type PanelAlignment = 'start' | 'end';

type StackSizes = Record<string, number>;

type StackResizeInput = {
	sizes: StackSizes;
	order: string[];
	collapsed: Record<string, boolean>;
	minimums: Record<string, number>;
	panelId: string;
	alignment: PanelAlignment;
	deltaPercent: number;
};

const normalizeStackSizes = (sizes: StackSizes): StackSizes => {
	const entries = Object.entries(sizes);
	if (entries.length === 0) return sizes;
	const positive = entries.map(
		([id, size]) => [id, Math.max(0, size)] as const,
	);
	const total = positive.reduce((sum, [, size]) => sum + size, 0);
	if (total <= 0) {
		const equal = 100 / positive.length;
		return Object.fromEntries(positive.map(([id]) => [id, equal]));
	}
	return Object.fromEntries(
		positive.map(([id, size]) => [id, (size / total) * 100]),
	);
};

export const resizeStackSizes = ({
	sizes,
	order,
	collapsed,
	minimums,
	panelId,
	alignment,
	deltaPercent,
}: StackResizeInput): StackSizes => {
	const expanded = order.filter((id) => !collapsed[id]);
	const index = expanded.indexOf(panelId);
	if (index < 0) return sizes;

	const neighborIndex = alignment === 'start' ? index + 1 : index - 1;
	const neighborId = expanded[neighborIndex];
	if (!neighborId) return sizes;

	const panelStart = sizes[panelId] ?? 0;
	const neighborStart = sizes[neighborId] ?? 0;
	const panelMin = minimums[panelId] ?? 5;
	const neighborMin = minimums[neighborId] ?? 5;
	const signedDelta = alignment === 'start' ? deltaPercent : -deltaPercent;
	const delta = Math.max(
		panelMin - panelStart,
		Math.min(neighborStart - neighborMin, signedDelta),
	);

	return {
		...sizes,
		[panelId]: panelStart + delta,
		[neighborId]: neighborStart - delta,
	};
};

interface ResizablePanelStackContextValue {
	direction: PanelDirection;
	sizes: StackSizes;
	collapsed: Record<string, boolean>;
	order: string[];
	register: (
		id: string,
		defaultPercent: number,
		minPercent: number,
		collapsed: boolean,
	) => void;
	unregister: (id: string) => void;
	setPanelCollapsed: (id: string, collapsed: boolean) => void;
	resizePanel: (
		id: string,
		alignment: PanelAlignment,
		deltaPercent: number,
		startSizes: StackSizes,
	) => void;
	finishResize: () => void;
	canResize: (id: string, alignment: PanelAlignment) => boolean;
}

const ResizablePanelStackContext =
	createContext<ResizablePanelStackContextValue | null>(null);

interface ResizablePanelGroupProps {
	children: ReactNode;
	direction?: PanelDirection;
	className?: string;
	defaultSizes?: StackSizes;
	onSizesChange?: (sizes: StackSizes) => void;
	onSizesChangeEnd?: (sizes: StackSizes) => void;
}

export const ResizablePanelGroup: React.FC<ResizablePanelGroupProps> = ({
	children,
	direction = 'vertical',
	className = '',
	defaultSizes = {},
	onSizesChange,
	onSizesChangeEnd,
}) => {
	const [sizes, setSizes] = useState<StackSizes>(() =>
		normalizeStackSizes(defaultSizes),
	);
	const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
	const [order, setOrder] = useState<string[]>([]);
	const minimumsRef = useRef<Record<string, number>>({});
	const sizesRef = useRef(sizes);

	useEffect(() => {
		sizesRef.current = sizes;
	}, [sizes]);

	const register = useCallback(
		(
			id: string,
			defaultPercent: number,
			minPercent: number,
			isCollapsed: boolean,
		) => {
			minimumsRef.current[id] = minPercent;
			setOrder((current) =>
				current.includes(id) ? current : [...current, id],
			);
			setCollapsed((current) =>
				current[id] === isCollapsed
					? current
					: { ...current, [id]: isCollapsed },
			);
			setSizes((current) => {
				if (current[id] !== undefined) return current;
				const next = normalizeStackSizes({ ...current, [id]: defaultPercent });
				sizesRef.current = next;
				return next;
			});
		},
		[],
	);

	const unregister = useCallback((id: string) => {
		delete minimumsRef.current[id];
		setOrder((current) => current.filter((value) => value !== id));
		setCollapsed((current) => {
			const next = { ...current };
			delete next[id];
			return next;
		});
		setSizes((current) => {
			if (current[id] === undefined) return current;
			const next = { ...current };
			delete next[id];
			const normalized = normalizeStackSizes(next);
			sizesRef.current = normalized;
			return normalized;
		});
	}, []);

	const setPanelCollapsed = useCallback((id: string, isCollapsed: boolean) => {
		setCollapsed((current) =>
			current[id] === isCollapsed ? current : { ...current, [id]: isCollapsed },
		);
	}, []);

	const resizePanel = useCallback(
		(
			id: string,
			alignment: PanelAlignment,
			deltaPercent: number,
			startSizes: StackSizes,
		) => {
			setSizes(() => {
				const next = resizeStackSizes({
					sizes: startSizes,
					order,
					collapsed,
					minimums: minimumsRef.current,
					panelId: id,
					alignment,
					deltaPercent,
				});
				sizesRef.current = next;
				onSizesChange?.(next);
				return next;
			});
		},
		[collapsed, onSizesChange, order],
	);

	const finishResize = useCallback(() => {
		onSizesChangeEnd?.(sizesRef.current);
	}, [onSizesChangeEnd]);

	const canResize = useCallback(
		(id: string, alignment: PanelAlignment) => {
			const expanded = order.filter((panelId) => !collapsed[panelId]);
			const index = expanded.indexOf(id);
			if (index < 0) return false;
			return alignment === 'start' ? index < expanded.length - 1 : index > 0;
		},
		[collapsed, order],
	);

	const value = useMemo<ResizablePanelStackContextValue>(
		() => ({
			direction,
			sizes,
			collapsed,
			order,
			register,
			unregister,
			setPanelCollapsed,
			resizePanel,
			finishResize,
			canResize,
		}),
		[
			direction,
			sizes,
			collapsed,
			order,
			register,
			unregister,
			setPanelCollapsed,
			resizePanel,
			finishResize,
			canResize,
		],
	);

	return (
		<ResizablePanelStackContext.Provider value={value}>
			<div className={`resizable-panel-group ${direction} ${className}`.trim()}>
				{children}
			</div>
		</ResizablePanelStackContext.Provider>
	);
};

interface ResizablePanelProps {
	children: React.ReactNode;
	direction: PanelDirection;
	width?: number;
	height?: number;
	minWidth?: number | string;
	maxWidth?: number | string;
	minHeight?: number | string;
	maxHeight?: number | string;
	className?: string;
	handleClassName?: string;
	onResize?: (size: number) => void;
	alignment?: PanelAlignment;
	collapsible?: boolean;
	onCollapse?: (collapsed: boolean) => void;
	collapsed?: boolean;
	defaultCollapsed?: boolean;
	maintainAlignment?: boolean;
	stackId?: string;
	stackDefaultSize?: number;
	stackMinSize?: number;
	stackCollapsedSize?: number;
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
	stackId,
	stackDefaultSize = 33.333,
	stackMinSize = 10,
	stackCollapsedSize,
}) => {
	const stack = useContext(ResizablePanelStackContext);
	const isStacked = Boolean(stack && stackId);
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
	const stackStartSizesRef = useRef<StackSizes>({});
	const inlineDirectionRef = useRef<1 | -1>(1);

	const collapsed =
		externalCollapsed !== undefined ? externalCollapsed : internalCollapsed;
	const initialCollapsedRef = useRef(collapsed);
	const stackRegister = stack?.register;
	const stackUnregister = stack?.unregister;
	const stackSetPanelCollapsed = stack?.setPanelCollapsed;
	const stackResizePanel = stack?.resizePanel;
	const stackFinishResize = stack?.finishResize;

	useEffect(() => {
		if (!isStacked || !stackId || !stackRegister || !stackUnregister) return;
		stackRegister(
			stackId,
			stackDefaultSize,
			stackMinSize,
			initialCollapsedRef.current,
		);
		return () => stackUnregister(stackId);
	}, [
		isStacked,
		stackId,
		stackDefaultSize,
		stackMinSize,
		stackRegister,
		stackUnregister,
	]);

	useEffect(() => {
		if (!isStacked || !stackId || !stackSetPanelCollapsed) return;
		stackSetPanelCollapsed(stackId, collapsed);
	}, [collapsed, isStacked, stackId, stackSetPanelCollapsed]);

	const getLimits = useCallback(() => {
		const containerSize = (() => {
			if (!panelRef.current?.parentElement)
				return direction === 'horizontal' ? 800 : 600;
			const parent = panelRef.current.parentElement;
			return direction === 'horizontal'
				? parent.clientWidth
				: parent.clientHeight;
		})();

		const parse = (limit: number | string): number => {
			if (typeof limit === 'string' && limit.endsWith('%')) {
				const percentage = parseFloat(limit.slice(0, -1));
				return Math.round((percentage / 100) * containerSize);
			}
			return typeof limit === 'number' ? limit : parseInt(limit, 10);
		};

		if (direction === 'horizontal') {
			return { min: parse(minWidth), max: parse(maxWidth) };
		}
		return { min: parse(minHeight), max: parse(maxHeight) };
	}, [direction, minWidth, maxWidth, minHeight, maxHeight]);

	const handleMouseDown = (e: MouseEvent | React.TouchEvent) => {
		e.preventDefault();
		setResizing(true);

		const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
		const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

		startPosRef.current = direction === 'horizontal' ? clientX : clientY;
		startSizeRef.current = size;
		inlineDirectionRef.current =
			direction === 'horizontal' &&
			panelRef.current &&
			getComputedStyle(panelRef.current).direction === 'rtl'
				? -1
				: 1;
		if (isStacked && stack) stackStartSizesRef.current = { ...stack.sizes };
		document.body.classList.add('resizing');
		document.body.classList.add(
			direction === 'horizontal' ? 'horizontal-resize' : 'vertical-resize',
		);
	};

	useEffect(() => {
		if (isStacked) return;
		const newSize = direction === 'horizontal' ? width : height;
		if (!collapsed && !resizing) {
			setSize(newSize);
		}
	}, [width, height, direction, collapsed, resizing, isStacked]);

	useEffect(() => {
		const handleWindowResize = () => {
			if (isStacked || !maintainAlignment || collapsed) return;

			const { min, max } = getLimits();
			const constrainedSize = Math.max(min, Math.min(max, size));

			if (constrainedSize !== size) {
				setSize(constrainedSize);
				if (onResize) onResize(constrainedSize);
			}
		};

		if (maintainAlignment) {
			window.addEventListener('resize', handleWindowResize);
			return () => window.removeEventListener('resize', handleWindowResize);
		}
	}, [maintainAlignment, collapsed, size, onResize, getLimits, isStacked]);

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
			const delta =
				(currentPos - startPosRef.current) * inlineDirectionRef.current;

			if (isStacked && stackResizePanel && stackId) {
				const parent = panelRef.current?.parentElement;
				const containerSize =
					direction === 'horizontal'
						? (parent?.clientWidth ?? 0)
						: (parent?.clientHeight ?? 0);
				if (containerSize <= 0) return;
				stackResizePanel(
					stackId,
					alignment,
					(delta / containerSize) * 100,
					stackStartSizesRef.current,
				);
				return;
			}

			const adjustedDelta = alignment === 'start' ? -delta : delta;
			let newSize = startSizeRef.current + adjustedDelta;
			const { min, max } = getLimits();
			newSize = Math.max(min, Math.min(max, newSize));
			setSize(newSize);
			if (onResize) onResize(newSize);
		};

		const handleMouseUp = () => {
			setResizing(false);
			if (isStacked) stackFinishResize?.();
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
		onResize,
		alignment,
		getLimits,
		isStacked,
		stackResizePanel,
		stackFinishResize,
		stackId,
	]);

	const toggleCollapse = () => {
		const newCollapsed = !collapsed;
		if (externalCollapsed === undefined) setInternalCollapsed(newCollapsed);

		if (!isStacked) {
			if (newCollapsed) {
				setPreviousSize(size);
				setSize(0);
			} else {
				const restoredSize = previousSize;
				setSize(restoredSize);
				requestAnimationFrame(() => onResize?.(restoredSize));
			}
		}

		onCollapse?.(newCollapsed);
	};

	const handleDoubleClick = () => {
		if (!collapsible) return;
		toggleCollapse();
	};

	const getHandleClassName = () => {
		const baseClass = `resize-handle ${direction}`;
		const alignmentClass =
			direction === 'horizontal'
				? alignment
				: alignment === 'start'
					? 'bottom'
					: 'top';
		return `${baseClass} ${alignmentClass} ${handleClassName}`;
	};

	const getCollapseButtonClassName = () => {
		const baseClass = 'collapse-button';
		const directionClass =
			direction === 'horizontal'
				? alignment
				: alignment === 'start'
					? 'top'
					: 'bottom';
		const stateClass = collapsed ? 'collapsed' : 'expanded';
		return `${baseClass} ${directionClass} ${stateClass}`;
	};

	const getCollapseIcon = () => {
		if (direction === 'horizontal') {
			if (alignment === 'start') return collapsed ? t('◂') : t('▸');
			return collapsed ? t('▸') : t('◂');
		}
		if (alignment === 'start') return collapsed ? '▴' : '▾';
		return collapsed ? '▾' : '▴';
	};

	const { min: minLimit, max: maxLimit } = getLimits();
	const stackSize =
		stackId && stack ? (stack.sizes[stackId] ?? stackDefaultSize) : 0;
	type ResizablePanelStyle = React.CSSProperties & {
		'--ui-resizable-size'?: string;
		'--ui-resizable-min-size'?: string;
		'--ui-resizable-max-size'?: string;
	};

	const style: ResizablePanelStyle = isStacked
		? {
				position: 'relative',
				display: 'flex',
				flexDirection: 'column',
				minWidth: 0,
				minHeight: 0,
				order: collapsed ? 1 : 0,
				...(collapsed
					? stackCollapsedSize !== undefined
						? direction === 'vertical'
							? {
									flex: `0 0 ${stackCollapsedSize}px`,
									height: `${stackCollapsedSize}px`,
									maxHeight: `${stackCollapsedSize}px`,
								}
							: {
									flex: `0 0 ${stackCollapsedSize}px`,
									width: `${stackCollapsedSize}px`,
									maxWidth: `${stackCollapsedSize}px`,
								}
						: {
								flex: '0 0 auto',
								height: 'auto',
								width: 'auto',
								maxHeight: 'none',
								maxWidth: 'none',
							}
					: {
							flexGrow: stackSize,
							flexShrink: 1,
							flexBasis: 0,
						}),
			}
		: {
				'--ui-resizable-size': `${size}px`,
				'--ui-resizable-min-size': collapsed ? '0' : `${minLimit}px`,
				'--ui-resizable-max-size': collapsed ? '0' : `${maxLimit}px`,
			};

	const showResizeHandle =
		!collapsed &&
		(!isStacked || (stackId && stack?.canResize(stackId, alignment)));
	const hideContent = collapsed && !isStacked;

	return (
		<div
			ref={panelRef}
			className={`resizable-panel ${direction} ${isStacked ? 'stacked' : ''} ${resizing ? 'dragging' : ''} ${collapsed ? 'collapsed' : ''} ${className}`.trim()}
			style={style}
			onMouseEnter={() => setIsHovering(true)}
			onMouseLeave={() => setIsHovering(false)}
		>
			<div className={`panel-content ${hideContent ? 'hidden' : ''}`}>
				{children}
			</div>
			{showResizeHandle && (
				<div
					className={getHandleClassName()}
					onMouseDown={handleMouseDown}
					onTouchStart={handleMouseDown}
					onDoubleClick={handleDoubleClick}
				/>
			)}
			{!isStacked && collapsible && (isHovering || collapsed) && (
				<button
					type='button'
					className={`${getCollapseButtonClassName()} ${collapsed ? 'always-visible' : ''}`}
					onClick={(e) => {
						e.stopPropagation();
						toggleCollapse();
					}}
					title={collapsed ? t('Expand') : t('Collapse')}
				>
					<span className='collapse-icon'>{getCollapseIcon()}</span>
				</button>
			)}
		</div>
	);
};

export default ResizablePanel;
