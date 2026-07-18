// src/components/project/ProjectForm.tsx
import type React from 'react';
import { useEffect, useMemo, useState } from 'react';

import { t } from '@/i18n';
import { compilerRegistryService } from '../../services/CompilerRegistryService';
import type {
	Project,
	ProjectGroup,
	ProjectType,
} from '../../types/projects.ts';
import { TagInput } from '../common/TagInput';

interface ProjectFormProps {
	project?: Project;
	onSubmit: (projectData: {
		name: string;
		description: string;
		type: ProjectType;
		group?: ProjectGroup;
		compilerId?: string;
		tags: string[];
		docUrl?: string;
		isFavorite: boolean;
	}) => void;
	onCancel: () => void;
	isSubmitting?: boolean;
	simpleMode?: boolean;
	disableNameAndDescription?: boolean;
}

const ProjectForm: React.FC<ProjectFormProps> = ({
	project,
	onSubmit,
	onCancel,
	isSubmitting = false,
	simpleMode = false,
	disableNameAndDescription = false,
}) => {
	const [name, setName] = useState('');
	const [description, setDescription] = useState('');
	const [type, setType] = useState<ProjectType>('latex');
	const [compilerId, setCompilerId] = useState<string | undefined>();
	const [registryVersion, setRegistryVersion] = useState(
		compilerRegistryService.getVersion(),
	);
	const [tags, setTags] = useState<string[]>([]);
	const [docUrl, setDocUrl] = useState('');
	const [isFavorite, setIsFavorite] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(
		() =>
			compilerRegistryService.onChange(() =>
				setRegistryVersion(compilerRegistryService.getVersion()),
			),
		[],
	);

	/* biome-ignore lint/correctness/useExhaustiveDependencies: registryVersion invalidates the registry snapshot. */
	const projectTypeOptions = useMemo(
		() => compilerRegistryService.listProjectTypes(),
		[registryVersion],
	);

	const selectedProvider = compilerId
		? compilerRegistryService.get(compilerId)
		: compilerRegistryService.getForProjectType(type);
	const selectedGroup = selectedProvider
		? compilerRegistryService.getProjectGroup(selectedProvider)
		: type;
	const selectedSource =
		selectedProvider?.source ??
		(compilerId?.startsWith('internal:') ? 'builtin' : 'chelys');
	const selectedProjectTypeOptions = projectTypeOptions.some(
		(option) =>
			option.projectType === selectedGroup && option.source === selectedSource,
	)
		? projectTypeOptions
		: [
				...projectTypeOptions,
				{
					projectType: selectedGroup,
					label: `${type} (${t('Unavailable')})`,
					source: selectedSource,
					compilerId: compilerId ?? '',
					unavailable: true,
				},
			];

	/* biome-ignore lint/correctness/useExhaustiveDependencies: registryVersion invalidates the registry snapshot. */
	const compilerOptions = useMemo(
		() => compilerRegistryService.listForProjectGroup(selectedGroup),
		[selectedGroup, registryVersion],
	);

	const internalCompilerOptions = compilerOptions.filter(
		({ source }) => source === 'builtin',
	);
	const externalCompilerOptions = compilerOptions.filter(
		({ source }) => source !== 'builtin',
	);

	useEffect(() => {
		if (
			!compilerOptions.length ||
			(compilerId && compilerOptions.some(({ id }) => id === compilerId))
		) {
			return;
		}

		const provider = compilerOptions[0];
		setCompilerId(provider.id);
		setType(provider.projectType as ProjectType);
	}, [compilerOptions, compilerId]);

	useEffect(() => {
		if (!project) {
			return;
		}

		setName(project.name);
		setDescription(project.description || '');
		setType(project.type);
		setCompilerId(project.compilerId);
		setTags(project.tags || []);
		setDocUrl(project.docUrl || '');
		setIsFavorite(project.isFavorite);
	}, [project]);

	const handleSubmit = (e: React.SyntheticEvent<HTMLFormElement>) => {
		e.preventDefault();

		if (!name.trim()) {
			setError(t('Project name is required'));
			return;
		}

		onSubmit({
			name: name.trim(),
			description: description.trim(),
			type,
			group: selectedGroup as ProjectGroup,
			compilerId,
			tags,
			docUrl: docUrl || undefined,
			isFavorite,
		});
	};

	return (
		<form className='project-form' onSubmit={handleSubmit}>
			{error && <div className='form-error'>{error}</div>}

			<div className='form-group'>
				<label htmlFor='project-name'>
					{t('Project Name')}
					<span className='required'>*</span>
				</label>

				{disableNameAndDescription ? (
					<div className='disabled-field'>
						<span>{name}</span>
						<div className='field-note'>
							{t('Open the project to edit its name')}
						</div>
					</div>
				) : (
					<input
						type='text'
						id='project-name'
						value={name}
						onChange={(e) => setName(e.target.value)}
						disabled={isSubmitting || disableNameAndDescription}
						required
					/>
				)}
			</div>

			<div className='form-group'>
				<label htmlFor='project-description'>{t('Description')}</label>

				{disableNameAndDescription ? (
					<div className='disabled-field'>
						<span>{description || 'No description'}</span>
						<div className='field-note'>
							{t('Open the project to edit its description')}
						</div>
					</div>
				) : (
					<textarea
						id='project-description'
						value={description}
						onChange={(e) => setDescription(e.target.value)}
						disabled={isSubmitting || disableNameAndDescription}
						rows={3}
					/>
				)}
			</div>

			<div className='form-group'>
				<label htmlFor='project-type'>{t('Typesetter Type')}</label>

				{disableNameAndDescription ? (
					<div className='disabled-field'>
						<span>
							{selectedProjectTypeOptions.find(
								(option) =>
									option.projectType === selectedGroup &&
									option.source === selectedSource,
							)?.label ?? selectedGroup}
						</span>
						<div className='field-note'>
							{t('Open the project to edit its typesetter type')}
						</div>
					</div>
				) : (
					<select
						id='project-type'
						value={`${selectedSource}:${selectedGroup}`}
						onChange={(e) => {
							const option = selectedProjectTypeOptions.find(
								({ source, projectType }) =>
									`${source}:${projectType}` === e.target.value,
							);
							const provider = option
								? compilerRegistryService.get(option.compilerId)
								: undefined;

							if (!provider) return;
							setType(provider.projectType as ProjectType);
							setCompilerId(provider.id);
						}}
						disabled={isSubmitting}
					>
						{(['builtin', 'chelys'] as const).map((source) => {
							const options = selectedProjectTypeOptions.filter(
								(option) => option.source === source,
							);
							if (!options.length) return null;

							return (
								<optgroup
									key={source}
									label={source === 'builtin' ? t('Internal') : t('External')}
								>
									{options.map((option) => (
										<option
											key={`${source}:${option.projectType}`}
											value={`${source}:${option.projectType}`}
											disabled={'unavailable' in option}
										>
											{option.label}
										</option>
									))}
								</optgroup>
							);
						})}
					</select>
				)}
			</div>

			{selectedGroup !== type && (
				<div className='form-group'>
					<label htmlFor='project-compiler'>{t('Compiler')}</label>

					{disableNameAndDescription ? (
						<div className='disabled-field'>
							<span>
								{compilerOptions.find(({ id }) => id === compilerId)?.label ??
									compilerOptions[0]?.label}
							</span>
							<div className='field-note'>
								{t('Open the project to edit its compiler')}
							</div>
						</div>
					) : (
						<select
							id='project-compiler'
							value={compilerId ?? ''}
							onChange={(e) => {
								const provider = compilerRegistryService.get(e.target.value);
								if (!provider) return;

								setType(provider.projectType as ProjectType);
								setCompilerId(provider.id);
							}}
							disabled={isSubmitting}
						>
							{internalCompilerOptions.length > 0 && (
								<optgroup label={t('Internal')}>
									{internalCompilerOptions.map((provider) => (
										<option key={provider.id} value={provider.id}>
											{provider.label}
										</option>
									))}
								</optgroup>
							)}
							{externalCompilerOptions.length > 0 && (
								<optgroup label={t('External')}>
									{externalCompilerOptions.map((provider) => (
										<option key={provider.id} value={provider.id}>
											{provider.label}
										</option>
									))}
								</optgroup>
							)}
						</select>
					)}
				</div>
			)}

			{!simpleMode && (
				<>
					<div className='form-group'>
						<label htmlFor='project-tags'>{t('Tags')}</label>
						<TagInput
							values={tags}
							onChange={setTags}
							placeholder={t('Add tags (press Enter or comma to add)')}
							disabled={isSubmitting}
						/>
					</div>

					{!project && (
						<div className='form-group checkbox-group'>
							<label>
								<input
									type='checkbox'
									checked={isFavorite}
									onChange={(e) => setIsFavorite(e.target.checked)}
									disabled={isSubmitting}
								/>
								<span>{t('Add to favorites')}</span>
							</label>
						</div>
					)}
				</>
			)}

			<div className='form-actions'>
				<button
					type='button'
					className='button secondary'
					onClick={onCancel}
					disabled={isSubmitting}
				>
					{t('Cancel')}
				</button>

				<button
					type='submit'
					className='button primary'
					disabled={isSubmitting}
				>
					{isSubmitting
						? project
							? t('Updating...')
							: t('Creating...')
						: project
							? t('Update Project')
							: t('Create Project')}
				</button>
			</div>
		</form>
	);
};

export default ProjectForm;
