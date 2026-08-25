// src/components/settings/ToolConfigForm.tsx
import type React from 'react';
import { useMemo, useState } from 'react';

import { t } from '@/i18n';
import type { Setting } from '../../contexts/SettingsContext';
import type {
	ToolConfigBlock,
	ToolConfigField,
	ToolConfigFieldValues,
	ToolConfigKind,
} from '../../types/toolConfig';
import { SettingsCodeMirror } from './SettingsCodeMirror';

interface ToolConfigFormProps {
	kind: ToolConfigKind;
	config: ToolConfigBlock | null;
	onSave: (config: ToolConfigBlock) => void;
	onCancel: () => void;
}

interface ToolConfigJsonEditorProps {
	value: string;
	height?: number;
	onChange: (value: string) => void;
}

export const ToolConfigJsonEditor: React.FC<ToolConfigJsonEditorProps> = ({
	value,
	height = 14,
	onChange,
}) => {
	const setting = useMemo<Setting>(
		() => ({
			id: 'tool-config-json',
			category: '',
			type: 'codemirror',
			label: '',
			defaultValue: '',
			codeMirrorOptions: {
				language: 'json',
				height,
				lineNumbers: true,
				wordWrap: true,
			},
		}),
		[height],
	);

	return (
		<SettingsCodeMirror setting={setting} value={value} onChange={onChange} />
	);
};

const ToolConfigForm: React.FC<ToolConfigFormProps> = ({
	kind,
	config,
	onSave,
	onCancel,
}) => {
	const [values, setValues] = useState<ToolConfigFieldValues>(() =>
		kind.toFieldValues(config),
	);
	const [jsonMode, setJsonMode] = useState(false);
	const [jsonDraft, setJsonDraft] = useState(() =>
		JSON.stringify(config ?? {}, null, 2),
	);
	const [error, setError] = useState<string | null>(null);

	const setValue = (key: string, value: string) => {
		setValues((prev) => ({ ...prev, [key]: value }));
	};

	const enterJsonMode = () => {
		setJsonDraft(JSON.stringify(kind.toStoredConfig(values, config), null, 2));
		setJsonMode(true);
	};

	const leaveJsonMode = () => {
		try {
			const parsed = JSON.parse(jsonDraft);
			setValues(kind.toFieldValues(kind.normalize(parsed)));
			setError(null);
			setJsonMode(false);
		} catch {
			setError(t('The recipe is not valid JSON.'));
		}
	};

	const handleSave = () => {
		let candidate: unknown;

		if (jsonMode) {
			try {
				candidate = JSON.parse(jsonDraft);
			} catch {
				setError(t('The recipe is not valid JSON.'));
				return;
			}
		} else {
			candidate = kind.toStoredConfig(values, config);
		}

		const normalized = kind.normalize(candidate);

		if (!normalized) {
			setError(t('The recipe is incomplete. Check the required fields.'));
			return;
		}

		onSave(normalized);
	};

	const renderField = (field: ToolConfigField) => {
		const value = values[field.key] ?? '';

		return (
			<div key={field.key} className='form-group'>
				<label htmlFor={`tool-config-${field.key}`}>{t(field.label)}</label>
				{field.kind === 'select' ? (
					<select
						id={`tool-config-${field.key}`}
						value={value}
						onChange={(e) => setValue(field.key, e.target.value)}
					>
						{field.options?.map((option) => (
							<option key={option.value} value={option.value}>
								{option.label}
							</option>
						))}
					</select>
				) : field.kind === 'textarea' ? (
					<textarea
						id={`tool-config-${field.key}`}
						rows={6}
						value={value}
						dir='ltr'
						onChange={(e) => setValue(field.key, e.target.value)}
					/>
				) : (
					<input
						id={`tool-config-${field.key}`}
						type='text'
						value={value}
						dir='ltr'
						placeholder={field.placeholder}
						onChange={(e) => setValue(field.key, e.target.value)}
					/>
				)}
				{field.help && <small>{t(field.help)}</small>}
			</div>
		);
	};

	return (
		<div className='tool-config-form'>
			<div className='tool-config-form-header'>
				<h4>{config ? t('Edit recipe') : t('Add recipe')}</h4>
				<button
					className='button secondary smaller'
					onClick={jsonMode ? leaveJsonMode : enterJsonMode}
				>
					{jsonMode ? t('Edit fields') : t('Edit as JSON')}
				</button>
			</div>

			{error && <div className='error-message'>{error}</div>}

			{jsonMode ? (
				<ToolConfigJsonEditor value={jsonDraft} onChange={setJsonDraft} />
			) : (
				kind.fields.map(renderField)
			)}

			<div className='form-actions'>
				<button className='button secondary' onClick={onCancel}>
					{t('Cancel')}
				</button>
				<button className='button primary' onClick={handleSave}>
					{t('Save')}
				</button>
			</div>
		</div>
	);
};

export default ToolConfigForm;
