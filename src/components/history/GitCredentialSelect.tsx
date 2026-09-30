import type React from 'react';
import { useEffect, useMemo, useState } from 'react';

import { t } from '@/i18n';
import { useSecrets } from '@/hooks/useSecrets';
import {
	type GitCredentialChoice,
	type GitCredentialOption,
	gitSyncService,
} from '@/services/GitSyncService';

interface GitCredentialSelectProps {
	providerId: string;
	projectId: string;
	value: string;
	onChange: (value: string) => void;
	source?: GitCredentialChoice;
	onSourceChange?: (source: GitCredentialChoice) => void;
	mode?: 'history' | 'backup';
	disabled?: boolean;
	placeholder?: string;
}

const GitCredentialSelect: React.FC<GitCredentialSelectProps> = ({
	providerId,
	projectId,
	value,
	onChange,
	source: controlledSource,
	onSourceChange,
	mode = 'history',
	disabled = false,
	placeholder,
}) => {
	const { getSecret, hasSecret } = useSecrets();
	const [internalSource, setInternalSource] =
		useState<GitCredentialChoice>('new');
	const source = controlledSource ?? internalSource;
	const [options, setOptions] = useState<GitCredentialOption[]>([
		{ id: 'new', label: 'New credential' },
	]);

	useEffect(() => {
		let active = true;
		void gitSyncService
			.getCredentialOptions(providerId, projectId, { hasSecret })
			.then((loaded) => {
				if (!active) return;
				const filtered =
					mode === 'backup'
						? loaded.filter((option) => ['new', 'history'].includes(option.id))
						: loaded;
				setOptions(filtered);
				if (!filtered.some((option) => option.id === source)) {
					if (controlledSource === undefined) setInternalSource('new');
					onSourceChange?.('new');
					if (source !== 'new') onChange('');
				}
			})
			.catch(() => {
				if (active) setOptions([{ id: 'new', label: 'New credential' }]);
			});
		return () => {
			active = false;
		};
	}, [
		controlledSource,
		mode,
		onChange,
		onSourceChange,
		projectId,
		providerId,
		hasSecret,
		source,
	]);

	const labels = useMemo(
		() =>
			options.map((option) => ({
				...option,
				label: t(option.label),
			})),
		[options],
	);

	const selectSource = async (next: GitCredentialChoice) => {
		if (controlledSource === undefined) setInternalSource(next);
		onSourceChange?.(next);
		if (next === 'new') {
			onChange('');
			return;
		}
		const token = await gitSyncService.getCredentialToken(
			providerId,
			projectId,
			next,
			{ getSecret },
		);
		onChange(token ?? '');
	};

	return (
		<div className='ui-field'>
			{labels.length > 1 ? (
				<select
					value={source}
					disabled={disabled}
					onChange={(event) =>
						void selectSource(event.target.value as GitCredentialChoice)
					}
				>
					{labels.map((option) => (
						<option key={option.id} value={option.id}>
							{option.label}
						</option>
					))}
				</select>
			) : null}
			<input
				type='password'
				value={value}
				disabled={disabled || source !== 'new'}
				onChange={(event) => onChange(event.target.value)}
				placeholder={placeholder ?? t('token...')}
			/>
		</div>
	);
};

export default GitCredentialSelect;
