// src/components/common/InfoTooltip.tsx
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { InfoIcon } from './Icons';

interface InfoTooltipProps {
	content: React.ReactNode;
	title?: string;
	className?: string;
}

const InfoTooltip: React.FC<InfoTooltipProps> = ({
	content,
	title,
	className = '',
}) => {
	const [showTooltip, setShowTooltip] = useState(false);
	const [position, setPosition] = useState({ top: 0, left: 0 });
	const buttonRef = useRef<HTMLButtonElement>(null);
	const tooltipRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!showTooltip || !buttonRef.current || !tooltipRef.current) return;

		const updatePosition = () => {
			if (!buttonRef.current || !tooltipRef.current) return;

			const buttonRect = buttonRef.current.getBoundingClientRect();
			const tooltipRect = tooltipRef.current.getBoundingClientRect();
			const spacing = 12;
			const padding = 8;

			const viewportWidth = window.innerWidth;
			const viewportHeight = window.innerHeight;

			const spaceRight = viewportWidth - buttonRect.right;
			const spaceLeft = buttonRect.left;
			const spaceBelow = viewportHeight - buttonRect.bottom;
			const spaceAbove = buttonRect.top;

			let top = 0;
			let left = 0;

			if (spaceRight >= tooltipRect.width + spacing) {
				left = buttonRect.right + spacing;
				top = buttonRect.top + buttonRect.height / 2 - tooltipRect.height / 2;
			} else if (spaceLeft >= tooltipRect.width + spacing) {
				left = buttonRect.left - tooltipRect.width - spacing;
				top = buttonRect.top + buttonRect.height / 2 - tooltipRect.height / 2;
			} else if (spaceBelow >= tooltipRect.height + spacing) {
				top = buttonRect.bottom + spacing;
				left = buttonRect.left + buttonRect.width / 2 - tooltipRect.width / 2;
			} else if (spaceAbove >= tooltipRect.height + spacing) {
				top = buttonRect.top - tooltipRect.height - spacing;
				left = buttonRect.left + buttonRect.width / 2 - tooltipRect.width / 2;
			} else {
				left = buttonRect.right + spacing;
				top = buttonRect.top + buttonRect.height / 2 - tooltipRect.height / 2;
			}

			top = Math.max(
				padding,
				Math.min(top, viewportHeight - tooltipRect.height - padding),
			);
			left = Math.max(
				padding,
				Math.min(left, viewportWidth - tooltipRect.width - padding),
			);

			setPosition({ top, left });
		};

		updatePosition();

		window.addEventListener('scroll', updatePosition, true);
		window.addEventListener('resize', updatePosition);

		return () => {
			window.removeEventListener('scroll', updatePosition, true);
			window.removeEventListener('resize', updatePosition);
		};
	}, [showTooltip]);

	return (
		<>
			<button
				ref={buttonRef}
				type='button'
				className={`info-tooltip-trigger ${className}`}
				onMouseEnter={() => setShowTooltip(true)}
				onMouseLeave={() => setShowTooltip(false)}
				onClick={() => setShowTooltip(!showTooltip)}
			>
				<InfoIcon />
			</button>
			{showTooltip &&
				createPortal(
					<div
						className='info-tooltip'
						ref={tooltipRef}
						style={{
							top: `${position.top}px`,
							left: `${position.left}px`,
							right: 'auto',
						}}
						onMouseEnter={() => setShowTooltip(true)}
						onMouseLeave={() => setShowTooltip(false)}
					>
						{title && <h4 className='info-tooltip-title'>{title}</h4>}
						<div className='info-tooltip-content'>{content}</div>
					</div>,
					document.body,
				)}
		</>
	);
};

export default InfoTooltip;
