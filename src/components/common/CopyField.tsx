// src/components/common/CopyField.tsx
import type React from 'react';
import { useState } from 'react';

import { t } from '@/i18n';
import { CopyUrlIcon } from './Icons';

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
			console.error('[CopyField] Failed to copy to clipboard:', error);
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
		<div className='copy-field'>
			{label && <label htmlFor={id}>{label}</label>}
			<div className='copy-field-input-group'>
				<input
					id={id}
					type='text'
					value={value}
					readOnly
					className={`copy-field-input${mono ? ' mono' : ''}`}
					onFocus={(e) => e.target.select()}
				/>
				<button
					type='button'
					onClick={handleCopy}
					className={`button smaller copy-field-button copy-field-button--${status}`}
					disabled={disabled || status === 'copied'}
				>
					{icon}
					<span className='copy-field-button-label'>{buttonLabel}</span>
				</button>
			</div>
		</div>
	);
};

export default CopyField;
