// src/components/project/ProjectForm.tsx
import type React from 'react';
import { useEffect, useMemo, useState } from 'react';

import { t } from '@/i18n';
import { compilerRegistryService } from '../../services/CompilerRegistryService';
import type { Project, ProjectType } from '../../types/projects.ts';
import { TagInput } from '../common/TagInput';

interface ProjectFormProps {
	project?: Project;
	onSubmit: (projectData: {
		name: string;
		description: string;
		type: ProjectType;
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

	/* biome-ignore lint/correctness/useExhaustiveDependencies: registryVersion invalidates the registry snapshot. */
	const compilerOptions = useMemo(
		() => compilerRegistryService.listForProjectType(type),
		[type, registryVersion],
	);

	useEffect(() => {
		if (compilerId && compilerOptions.some(({ id }) => id === compilerId)) {
			return;
		}

		setCompilerId(compilerOptions[0]?.id);
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
							{projectTypeOptions.find((option) => option.projectType === type)
								?.label ?? type}
						</span>
						<div className='field-note'>
							{t('Open the project to edit its typesetter type')}
						</div>
					</div>
				) : (
					<select
						id='project-type'
						value={type}
						onChange={(e) => setType(e.target.value as ProjectType)}
						disabled={isSubmitting}
					>
						{projectTypeOptions.map((option) => (
							<option key={option.projectType} value={option.projectType}>
								{option.label}
							</option>
						))}
					</select>
				)}
			</div>

			{compilerOptions.length > 1 && (
				<div className='form-group'>
					<label htmlFor='project-compiler'>{t('Compiler')}</label>

					{disableNameAndDescription ? (
						<div className='disabled-field'>
							<span>
								{compilerOptions.find(({ id }) => id === compilerId)?.label ??
									compilerOptions[0].label}
							</span>
							<div className='field-note'>
								{t('Open the project to edit its compiler')}
							</div>
						</div>
					) : (
						<select
							id='project-compiler'
							value={compilerId ?? ''}
							onChange={(e) => setCompilerId(e.target.value)}
							disabled={isSubmitting}
						>
							{compilerOptions.map((provider) => (
								<option key={provider.id} value={provider.id}>
									{provider.label}
								</option>
							))}
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
