// src/components/common/CopyField.tsx
import type React from 'react';
import { useState } from 'react';

import { t } from '@/i18n';
import { createNamedLogger } from '@/logging';
import { CopyUrlIcon } from './Icons';

const moduleLog = createNamedLogger('CopyField');

interface CopyFieldProps {
	value: string;
	label?: string;
	id?: string;
	mono?: boolean;
	icon?: React.ReactNode;
	idleLabel?: string;
	copiedLabel?: string;
	errorLabel?: string;
	disabled?: boolean;
}

const CopyField: React.FC<CopyFieldProps> = ({
	value,
	label,
	id,
	mono = false,
	icon = <CopyUrlIcon />,
	idleLabel = t('Copy'),
	copiedLabel = t('Copied!'),
	errorLabel = t('Failed to copy'),
	disabled = false,
}) => {
	const [status, setStatus] = useState<'idle' | 'copied' | 'error'>('idle');

	const handleCopy = async () => {
		try {
			await navigator.clipboard.writeText(value);
			setStatus('copied');
			setTimeout(() => setStatus('idle'), 2000);
		} catch (error) {
			moduleLog.error('Failed to copy to clipboard:', error);
			setStatus('error');
			setTimeout(() => setStatus('idle'), 2000);
		}
	};

	const buttonLabel =
		status === 'copied'
			? copiedLabel
			: status === 'error'
				? errorLabel
				: idleLabel;

	return (
		<div className='ui-field'>
			{label && <label htmlFor={id}>{label}</label>}
			<div className='ui-control-cluster'>
				<input
					id={id}
					type='text'
					value={value}
					readOnly
					className='ui-field-control'
					data-font={mono ? 'mono' : undefined}
					onFocus={(e) => e.target.select()}
				/>
				<button
					type='button'
					onClick={handleCopy}
					className='button '
					data-nowrap='true'
					disabled={disabled || status === 'copied'}
				>
					{icon}
					<span>{buttonLabel}</span>
				</button>
			</div>
		</div>
	);
};

export default CopyField;
