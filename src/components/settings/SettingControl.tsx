// src/components/settings/SettingControl.tsx
import type React from 'react';

import { t } from '@/i18n';
import type { Setting } from '../../contexts/SettingsContext';
import { SettingsCodeMirror } from './SettingsCodeMirror';
import SettingsLanguage from './SettingsLanguage';
import { NumberInput } from '../common/NumberInput';

interface SettingControlProps {
	setting: Setting & {
		label: React.ReactNode;
		description?: React.ReactNode;
	};
	onLocalUpdate?: (value: unknown) => void;
}

const SettingControl: React.FC<SettingControlProps> = ({
	setting,
	onLocalUpdate,
}) => {
	const value =
		setting.value !== undefined ? setting.value : setting.defaultValue;
	const disabled = Boolean(setting.disabled);

	const handleChange = (newValue: unknown) => {
		if (disabled) return;

		if (onLocalUpdate) {
			onLocalUpdate(newValue);
		}
	};

	const renderControl = () => {
		switch (setting.type) {
			case 'checkbox':
				return (
					<label className='checkbox-control'>
						<input
							type='checkbox'
							checked={Boolean(value)}
							disabled={disabled}
							onChange={(e) => handleChange(e.target.checked)}
						/>
						<span>{setting.label}</span>
					</label>
				);

			case 'select':
				return (
					<div className='select-control ui-field' data-gap='xs'>
						<label>{setting.label}</label>
						<select
							value={String(value)}
							disabled={disabled}
							onChange={(e) => {
								const selectedOption = setting.options?.find(
									(option) => String(option.value) === e.target.value,
								);
								handleChange(
									selectedOption ? selectedOption.value : e.target.value,
								);
							}}
						>
							{setting.options?.map((option) => (
								<option key={String(option.value)} value={String(option.value)}>
									{option.label}
								</option>
							))}
						</select>
					</div>
				);

			case 'text':
				return (
					<div className='text-control ui-field' data-gap='xs'>
						<label>{setting.label}</label>
						<input
							type='text'
							value={String(value)}
							dir={setting.forceLTR === false ? undefined : 'ltr'}
							disabled={disabled}
							onChange={(e) => handleChange(e.target.value)}
						/>
					</div>
				);

			case 'codemirror':
				return (
					<SettingsCodeMirror
						setting={{
							...setting,
							codeMirrorOptions: {
								...setting.codeMirrorOptions,
								readOnly: disabled || setting.codeMirrorOptions?.readOnly,
							},
						}}
						value={value as string}
						onChange={(value) => handleChange(value)}
					/>
				);

			case 'custom':
				return setting.render?.({
					setting,
					value,
					disabled,
					onChange: handleChange,
				});

			case 'language-select':
				return (
					<SettingsLanguage setting={setting} onLocalUpdate={onLocalUpdate} />
				);

			case 'number':
				return (
					<div className='number-control ui-field' data-gap='xs'>
						<label>{setting.label}</label>
						<NumberInput
							value={Number(value)}
							min={setting.min}
							max={setting.max}
							step={setting.step}
							disabled={disabled}
							onChange={handleChange}
						/>
					</div>
				);

			case 'color':
				return (
					<div className='ui-field' data-gap='xs'>
						<label>{setting.label}</label>
						<input
							className='ui-field-control'
							data-width='short'
							type='color'
							value={String(value)}
							disabled={disabled}
							onChange={(e) => handleChange(e.target.value)}
						/>
					</div>
				);

			default:
				return (
					<div>
						{t('Unsupported setting type:')}
						{setting.type}
					</div>
				);
		}
	};

	return (
		<div
			className='ui-stack'
			data-gap='xs'
			data-disabled={disabled ? 'true' : undefined}
		>
			{renderControl()}
			{disabled && setting.disabledReason && (
				<div className='ui-badge' data-variant='label' data-tone='warning'>
					{setting.disabledReason}
				</div>
			)}
			{setting.description && setting.type !== 'language-select' && (
				<div className='ui-note ui-field-hint'>{setting.description}</div>
			)}
		</div>
	);
};

export default SettingControl;
