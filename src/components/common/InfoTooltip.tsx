// src/components/common/InfoTooltip.tsx
import type React from 'react';
import { useRef, useState } from 'react';

import { InfoIcon } from './Icons';
import Popover from './Popover';

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
	const buttonRef = useRef<HTMLButtonElement>(null);

	return (
		<>
			<button
				ref={buttonRef}
				type='button'
				className={`ui-icon-button ${className}`}
				data-variant='ghost'
				data-size='xs'
				onMouseEnter={() => setShowTooltip(true)}
				onMouseLeave={() => setShowTooltip(false)}
				onClick={() => setShowTooltip(!showTooltip)}
			>
				<InfoIcon />
			</button>
			<Popover
				anchor={buttonRef}
				open={showTooltip}
				className='ui-tooltip'
				axis='inline'
				align='center'
				spacing={12}
				clampHeight
				onMouseEnter={() => setShowTooltip(true)}
				onMouseLeave={() => setShowTooltip(false)}
			>
				{title && <h4 className='ui-tooltip-title'>{title}</h4>}
				<div onMouseDown={(event) => event.stopPropagation()}>{content}</div>
			</Popover>
		</>
	);
};

export default InfoTooltip;
