// src/components/common/IconButton.tsx
import type React from 'react';
import { useRef, useState } from 'react';

import { t } from '@/i18n';
import Popover from './Popover';

export interface IconButtonConfirm {
	title?: string;
	message?: string;
	warning?: string;
	items?: string[];
	confirmLabel?: string;
}

interface IconButtonProps {
	icon: React.ReactNode;
	label: string;
	tooltip?: string;
	variant?: 'primary' | 'danger' | 'warn';
	disabled?: boolean;
	confirm?: IconButtonConfirm;
	onClick?: () => void;
}

const IconButton: React.FC<IconButtonProps> = ({
	icon,
	label,
	tooltip,
	variant,
	disabled = false,
	confirm,
	onClick,
}) => {
	const wrapperRef = useRef<HTMLSpanElement>(null);
	const [hovered, setHovered] = useState(false);
	const [confirming, setConfirming] = useState(false);
	const needsConfirm = variant === 'danger' || !!confirm;

	const handleTrigger = () => {
		setHovered(false);
		if (needsConfirm) {
			setConfirming(!confirming);
			return;
		}
		onClick?.();
	};

	const handleConfirm = () => {
		setHovered(false);
		setConfirming(false);
		onClick?.();
	};

	return (
		<span
			ref={wrapperRef}
			className='icon-button-wrapper'
			onMouseEnter={() => setHovered(true)}
			onMouseLeave={() => setHovered(false)}
			onFocus={() => setHovered(true)}
			onBlur={() => setHovered(false)}
		>
			<button
				type='button'
				className={`button icon-only${variant ? ` ${variant}` : ''}`}
				aria-label={label}
				disabled={disabled}
				onClick={handleTrigger}
			>
				{icon}
			</button>

			<Popover
				anchor={wrapperRef}
				open={hovered && !confirming}
				className='icon-button-tooltip'
				side='start'
			>
				<strong>{label}</strong>
				{tooltip && <span>{tooltip}</span>}
			</Popover>

			<Popover
				anchor={wrapperRef}
				open={confirming}
				className='icon-button-confirm'
				side='start'
				clampHeight
				onClose={() => setConfirming(false)}
			>
				<strong className='icon-button-confirm-title'>
					{confirm?.title ?? label}
				</strong>
				{confirm?.message && <p>{confirm.message}</p>}
				{confirm?.items && confirm.items.length > 0 && (
					<ul>
						{confirm.items.map((item) => (
							<li key={item}>{item}</li>
						))}
					</ul>
				)}
				<p className='icon-button-confirm-warning'>
					{confirm?.warning ?? t('This action cannot be undone.')}
				</p>
				<div className='icon-button-confirm-actions'>
					<button
						type='button'
						className='button secondary smaller'
						onClick={() => {
							setHovered(false);
							setConfirming(false);
						}}
					>
						{t('Cancel')}
					</button>
					<button
						type='button'
						className='button danger smaller'
						onClick={handleConfirm}
					>
						{confirm?.confirmLabel ?? t('Confirm')}
					</button>
				</div>
			</Popover>
		</span>
	);
};

export default IconButton;
