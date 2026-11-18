// src/components/common/SidebarHeaderActions.tsx
import type React from 'react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { t } from '@/i18n';
import { useSettings } from '../../hooks/useSettings';
import { useWheelScroll } from '../../hooks/useWheelScroll';
import { MoreHorizontalIcon } from './Icons';
import PositionedDropdown from './PositionedDropdown';

interface SidebarHeaderAction {
	key: string;
	label: string;
	icon: React.ReactNode;
	onClick: (anchor: HTMLButtonElement) => void;
	active?: boolean;
	disabled?: boolean;
	buttonRef?: React.RefObject<HTMLButtonElement | null>;
}

interface SidebarHeaderActionsProps {
	actions: (SidebarHeaderAction | null)[];
	tabs?: boolean;
	overflowRef?: React.RefObject<HTMLButtonElement | null>;
	onOverflowOpen?: () => void;
}

const SidebarHeaderActions: React.FC<SidebarHeaderActionsProps> = ({
	actions,
	tabs = false,
	overflowRef,
	onOverflowOpen,
}) => {
	const { getSetting } = useSettings();
	const enabled = getSetting('sidebar-header-overflow')?.value === true;
	const containerRef = useRef<HTMLDivElement>(null);
	const setContainerRef = useWheelScroll(containerRef);
	const defaultOverflowRef = useRef<HTMLButtonElement>(null);
	const moreRef = overflowRef ?? defaultOverflowRef;
	const [visibleCount, setVisibleCount] = useState(actions.length);
	const actionKeys = actions
		.map((action) => action?.key ?? 'separator')
		.join('|');
	const [open, setOpen] = useState(false);
	const count = enabled
		? Math.min(visibleCount, actions.length)
		: actions.length;
	const hasOverflow = enabled && count < actions.length;

	useLayoutEffect(() => {
		const container = containerRef.current;
		if (!enabled || !container || !actionKeys) return;

		const measure = () => {
			if (!container.clientWidth) return;
			container.dataset.measuring = 'true';
			const style = getComputedStyle(container);
			const gap = Number.parseFloat(style.columnGap) || 0;
			const available =
				container.clientWidth -
				(Number.parseFloat(style.paddingLeft) || 0) -
				(Number.parseFloat(style.paddingRight) || 0);
			const width = (element: HTMLElement) => {
				const css = getComputedStyle(element);
				return (
					element.getBoundingClientRect().width +
					(Number.parseFloat(css.marginLeft) || 0) +
					(Number.parseFloat(css.marginRight) || 0)
				);
			};
			const items = Array.from(
				container.querySelectorAll<HTMLElement>('[data-sidebar-action]'),
			);
			const widths = items.map(width);
			const moreWidth = moreRef.current ? width(moreRef.current) : 0;
			delete container.dataset.measuring;

			let total =
				widths.reduce((sum, item) => sum + item, 0) +
				Math.max(0, items.length - 1) * gap;
			let fit = items.length;
			if (total > available) {
				total += moreWidth + gap;
				while (fit > 0 && total > available) {
					fit--;
					total -= widths[fit] + gap;
				}
				if (fit > 0 && items[fit - 1].dataset.sidebarAction === 'separator')
					fit--;
			}
			setVisibleCount((current) => (current === fit ? current : fit));
		};

		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(container);
		for (const button of container.children) observer.observe(button);
		return () => observer.disconnect();
	}, [actionKeys, enabled, moreRef]);

	useEffect(() => {
		if (!hasOverflow && open) setOpen(false);
	}, [hasOverflow, open]);

	const buttonClass = (active?: boolean) =>
		`${tabs ? 'view-toggle-icon ui-tab' : 'ui-icon-button'}${active ? ' active' : ''}`;

	return (
		<div
			ref={setContainerRef}
			className={tabs ? 'ui-tab-list scroll-x' : 'ui-toolbar-actions scroll-x'}
			data-role={tabs ? 'explorer-view' : undefined}
			data-gap={tabs ? undefined : 'sm'}
			data-active-style={tabs ? undefined : 'filled'}
			data-sidebar-overflow={enabled ? 'true' : undefined}
		>
			{actions.map((action, index) => {
				const hidden = index >= count;
				return action ? (
					<button
						key={action.key}
						ref={action.buttonRef}
						type='button'
						className={buttonClass(action.active)}
						data-variant={tabs ? undefined : 'subtle'}
						data-sidebar-action={action.key}
						data-overflow-hidden={hidden ? 'true' : undefined}
						aria-hidden={hidden || undefined}
						tabIndex={hidden ? -1 : undefined}
						aria-label={action.label}
						title={action.label}
						disabled={action.disabled}
						onClick={(event) => action.onClick(event.currentTarget)}
					>
						{action.icon}
					</button>
				) : (
					<div
						key='separator'
						className='action-separator'
						data-sidebar-action='separator'
						data-overflow-hidden={hidden ? 'true' : undefined}
					/>
				);
			})}
			{enabled && (
				<button
					ref={moreRef}
					type='button'
					className={buttonClass()}
					data-variant={tabs ? undefined : 'subtle'}
					data-overflow-hidden={!hasOverflow ? 'true' : undefined}
					aria-hidden={!hasOverflow || undefined}
					tabIndex={hasOverflow ? undefined : -1}
					aria-expanded={open && hasOverflow}
					aria-label={t('More')}
					title={t('More')}
					onClick={() => {
						if (!open) onOverflowOpen?.();
						setOpen(!open);
					}}
				>
					<MoreHorizontalIcon />
				</button>
			)}
			<PositionedDropdown
				isOpen={open && hasOverflow}
				triggerElement={moreRef.current}
				onClose={() => setOpen(false)}
			>
				{actions.slice(count).map(
					(action) =>
						action && (
							<button
								key={action.key}
								type='button'
								className='ui-menu-item'
								data-active={action.active ? 'true' : undefined}
								disabled={action.disabled}
								onClick={() => {
									setOpen(false);
									if (moreRef.current) action.onClick(moreRef.current);
								}}
							>
								{action.icon}
								<span>{action.label}</span>
							</button>
						),
				)}
			</PositionedDropdown>
		</div>
	);
};

export default SidebarHeaderActions;
