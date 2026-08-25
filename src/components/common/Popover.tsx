// src/components/common/Popover.tsx
import type React from 'react';
import {
	useCallback,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from 'react';
import { createPortal } from 'react-dom';

export type PopoverAxis = 'block' | 'inline';
export type PopoverSide = 'start' | 'end';
export type PopoverAlign = 'start' | 'center' | 'end';

export type PopoverAnchor =
	| React.RefObject<HTMLElement | null>
	| HTMLElement
	| null;

interface PopoverProps {
	anchor: PopoverAnchor;
	open: boolean;
	className?: string;
	axis?: PopoverAxis;
	side?: PopoverSide;
	align?: PopoverAlign;
	spacing?: number;
	padding?: number;
	clampHeight?: boolean;
	style?: React.CSSProperties;
	onClose?: () => void;
	onMouseEnter?: () => void;
	onMouseLeave?: () => void;
	children: React.ReactNode;
}

interface Placement {
	top: number;
	left: number;
	maxHeight?: number;
}

const samePlacement = (a: Placement | null, b: Placement): boolean =>
	!!a && a.top === b.top && a.left === b.left && a.maxHeight === b.maxHeight;

const resolveAnchor = (anchor: PopoverAnchor): HTMLElement | null => {
	if (!anchor) return null;
	return anchor instanceof HTMLElement ? anchor : anchor.current;
};

const clamp = (value: number, size: number, limit: number, padding: number) =>
	Math.max(padding, Math.min(value, limit - size - padding));

const crossAxis = (
	align: PopoverAlign,
	start: number,
	end: number,
	size: number,
): number => {
	if (align === 'start') return start;
	if (align === 'center') return start + (end - start) / 2 - size / 2;
	return end - size;
};

const Popover: React.FC<PopoverProps> = ({
	anchor,
	open,
	className,
	axis = 'block',
	side = 'end',
	align = 'end',
	spacing = 4,
	padding = 8,
	clampHeight = false,
	style,
	onClose,
	onMouseEnter,
	onMouseLeave,
	children,
}) => {
	const panelRef = useRef<HTMLDivElement>(null);
	const [placement, setPlacement] = useState<Placement | null>(null);

	const measure = useCallback(() => {
		const panel = panelRef.current;
		if (!panel) return;

		const anchorEl = resolveAnchor(anchor);
		if (!anchorEl) {
			setPlacement((current) => current ?? { top: padding, left: padding });
			return;
		}

		const rect = anchorEl.getBoundingClientRect();
		const width = panel.offsetWidth;
		const height = panel.scrollHeight;
		const viewportWidth = window.innerWidth;
		const viewportHeight = window.innerHeight;

		const spaceAbove = rect.top;
		const spaceBelow = viewportHeight - rect.bottom;
		const spaceLeft = rect.left;
		const spaceRight = viewportWidth - rect.right;

		const useInline =
			axis === 'inline' &&
			(spaceRight >= width + spacing || spaceLeft >= width + spacing);

		if (useInline) {
			const preferStart = side === 'start';
			const atStart = preferStart
				? spaceLeft >= width + spacing || spaceLeft >= spaceRight
				: spaceRight < width + spacing && spaceLeft > spaceRight;

			const inlinePlacement: Placement = {
				left: clamp(
					atStart ? rect.left - width - spacing : rect.right + spacing,
					width,
					viewportWidth,
					padding,
				),
				top: clamp(
					crossAxis(align, rect.top, rect.bottom, height),
					height,
					viewportHeight,
					padding,
				),
			};

			setPlacement((current) =>
				samePlacement(current, inlinePlacement) ? current : inlinePlacement,
			);
			return;
		}

		const preferStart = side === 'start' && axis === 'block';
		const atStart = preferStart
			? spaceAbove >= height + spacing || spaceAbove >= spaceBelow
			: spaceBelow < height + spacing && spaceAbove > spaceBelow;

		const available = (atStart ? spaceAbove : spaceBelow) - spacing - padding;
		const maxHeight =
			clampHeight && height > available ? Math.max(available, 0) : undefined;
		const effectiveHeight = maxHeight ?? height;

		const blockPlacement: Placement = {
			top: clamp(
				atStart ? rect.top - effectiveHeight - spacing : rect.bottom + spacing,
				effectiveHeight,
				viewportHeight,
				padding,
			),
			left: clamp(
				crossAxis(align, rect.left, rect.right, width),
				width,
				viewportWidth,
				padding,
			),
			maxHeight,
		};

		setPlacement((current) =>
			samePlacement(current, blockPlacement) ? current : blockPlacement,
		);
	}, [anchor, axis, side, align, spacing, padding, clampHeight]);

	useLayoutEffect(() => {
		if (!open) {
			setPlacement(null);
			return;
		}

		measure();

		const panel = panelRef.current;
		const observer = panel ? new ResizeObserver(() => measure()) : null;
		if (panel && observer) observer.observe(panel);

		window.addEventListener('scroll', measure, true);
		window.addEventListener('resize', measure);

		return () => {
			observer?.disconnect();
			window.removeEventListener('scroll', measure, true);
			window.removeEventListener('resize', measure);
		};
	}, [open, measure]);

	useEffect(() => {
		if (!open || !onClose) return;

		const handlePointer = (event: MouseEvent) => {
			const target = event.target as Node;
			if (panelRef.current?.contains(target)) return;
			if (resolveAnchor(anchor)?.contains(target)) return;
			onClose();
		};
		const handleKey = (event: KeyboardEvent) => {
			if (event.key === 'Escape') onClose();
		};

		document.addEventListener('mousedown', handlePointer);
		document.addEventListener('keydown', handleKey);

		return () => {
			document.removeEventListener('mousedown', handlePointer);
			document.removeEventListener('keydown', handleKey);
		};
	}, [open, onClose, anchor]);

	if (!open) return null;

	return createPortal(
		<div
			ref={panelRef}
			className={className ? `popover-panel ${className}` : 'popover-panel'}
			style={{
				...style,
				position: 'fixed',
				top: `${placement?.top ?? 0}px`,
				left: `${placement?.left ?? 0}px`,
				right: 'auto',
				bottom: 'auto',
				...(placement?.maxHeight !== undefined
					? { maxHeight: `${placement.maxHeight}px`, overflowY: 'auto' }
					: {}),
				visibility: placement ? 'visible' : 'hidden',
			}}
			onMouseEnter={onMouseEnter}
			onMouseLeave={onMouseLeave}
		>
			{children}
		</div>,
		document.body,
	);
};

export default Popover;
