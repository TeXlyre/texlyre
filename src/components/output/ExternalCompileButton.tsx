// src/components/output/ExternalCompileButton.tsx
import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { t } from '@/i18n';
import PositionedDropdown from '../common/PositionedDropdown';
import PopoutViewerToggleButton from './PopoutViewerToggleButton';
import { useExternalCompiler } from '../../hooks/useExternalCompiler';
import { useFileTree } from '../../hooks/useFileTree';
import { useProperties } from '../../hooks/useProperties';
import { fileStorageService } from '../../services/FileStorageService';
import { genericTypesetterService } from '../../services/GenericTypesetterService';
import type {
	CompilerProvider,
	CompilerUIField,
} from '../../types/compilation';
import {
	ChevronDownIcon,
	ClearCompileIcon,
	GlobeIcon,
	PlayIcon,
	StopIcon,
	TrashIcon,
} from '../common/Icons';
import { getFilenameFromPath } from '../../utils/fileUtils';
import {
	collectValues,
	fieldDefault,
	findInputFiles,
	resolveLabel,
} from '../../utils/compilerUtils';

interface ExternalCompileButtonProps {
	provider: CompilerProvider;
	className?: string;
	onExpandExternalOutput?: () => void;
	linkedFileInfo?: {
		fileName?: string;
		filePath?: string;
	} | null;
	useSharedSettings?: boolean;
}

const ExternalCompileButton: React.FC<ExternalCompileButtonProps> = ({
	provider,
	className = '',
	onExpandExternalOutput,
	linkedFileInfo,
	useSharedSettings = false,
}) => {
	const { isCompiling, isExporting, compileDocument, clearCache } =
		useExternalCompiler();
	const { selectedFileId, getFile, fileTree } = useFileTree();
	const { getProperty, setProperty, registerProperty } = useProperties();
	const [isDropdownOpen, setIsDropdownOpen] = useState(false);
	const [autoMainFile, setAutoMainFile] = useState<string | undefined>();
	const dropdownRef = useRef<HTMLDivElement>(null);
	const propertiesRegistered = useRef(false);

	const projectId = fileStorageService.getCurrentProjectId() || undefined;
	const fields = provider.ui?.compile?.fields ?? [];
	const mainFilePropertyId = `external-${provider.id}-main-file`;
	const autoCompilePropertyId = `external-${provider.id}-auto-compile-on-save`;
	const fieldPropertyId = useCallback(
		(key: string) => `external-${provider.id}-${key}`,
		[provider.id],
	);

	const availableFiles = useMemo(
		() => findInputFiles(fileTree, provider.inputExtensions),
		[fileTree, provider.inputExtensions],
	);

	/* biome-ignore lint/correctness/useExhaustiveDependencies: One-time registration guarded by ref; fields and provider metadata are read for initial registration only. */
	useEffect(() => {
		if (propertiesRegistered.current) return;
		propertiesRegistered.current = true;

		registerProperty({
			id: mainFilePropertyId,
			category: 'Compilation',
			subcategory: provider.label,
			defaultValue: undefined,
		});

		registerProperty({
			id: autoCompilePropertyId,
			category: 'Compilation',
			subcategory: provider.label,
			defaultValue: false,
		});

		for (const field of fields) {
			registerProperty({
				id: fieldPropertyId(field.key),
				category: 'Compilation',
				subcategory: provider.label,
				defaultValue: fieldDefault(field),
			});
		}
	}, [registerProperty]);

	useEffect(() => {
		const resolveAuto = async () => {
			if (
				linkedFileInfo?.filePath &&
				availableFiles.includes(linkedFileInfo.filePath)
			) {
				setAutoMainFile(linkedFileInfo.filePath);
				return;
			}
			if (selectedFileId) {
				const file = await getFile(selectedFileId);
				if (file && availableFiles.includes(file.path)) {
					setAutoMainFile(file.path);
					return;
				}
			}
			setAutoMainFile(availableFiles[0]);
		};
		resolveAuto();
	}, [selectedFileId, getFile, availableFiles, linkedFileInfo]);

	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			const target = event.target as Node;
			if (dropdownRef.current && !dropdownRef.current.contains(target)) {
				const portaled = document.querySelector('.external-dropdown');
				if (portaled?.contains(target)) return;
				setIsDropdownOpen(false);
			}
		};
		document.addEventListener('mousedown', handleClickOutside);
		return () => document.removeEventListener('mousedown', handleClickOutside);
	}, []);

	const propMainFile = getProperty(mainFilePropertyId, {
		scope: 'project',
		projectId,
	}) as string | undefined;
	const effectiveMainFile = propMainFile || autoMainFile;

	const effectiveAutoCompileOnSave =
		getProperty(autoCompilePropertyId, { scope: 'project', projectId }) ===
		true;

	const readValue = useCallback(
		(key: string): unknown =>
			getProperty(fieldPropertyId(key), { scope: 'project', projectId }),
		[getProperty, projectId, fieldPropertyId],
	);

	const writeValue = useCallback(
		(key: string, value: string | number | boolean) => {
			setProperty(fieldPropertyId(key), value, { scope: 'project', projectId });
		},
		[setProperty, projectId, fieldPropertyId],
	);

	const handleMainFileChange = (filePath: string) => {
		setProperty(
			mainFilePropertyId,
			filePath === 'auto' ? undefined : filePath,
			{ scope: 'project', projectId },
		);
	};

	const handleCompile = useCallback(async () => {
		if (!effectiveMainFile) return;

		onExpandExternalOutput?.();

		const { format, options } = collectValues(fields, readValue);
		const resolvedFormat = format ?? provider.outputFormats[0]?.id ?? 'pdf';
		await compileDocument(
			provider.id,
			effectiveMainFile,
			resolvedFormat,
			options,
		);
	}, [
		effectiveMainFile,
		fields,
		readValue,
		provider,
		compileDocument,
		onExpandExternalOutput,
	]);

	const compileStateRef = useRef({ isCompiling, handleCompile });
	compileStateRef.current = { isCompiling, handleCompile };

	useEffect(() => {
		if (!useSharedSettings || !effectiveAutoCompileOnSave) return;

		const handleFileSaved = async () => {
			const state = compileStateRef.current;
			if (state.isCompiling) return;
			await state.handleCompile();
		};

		document.addEventListener('file-saved', handleFileSaved);
		return () => document.removeEventListener('file-saved', handleFileSaved);
	}, [useSharedSettings, effectiveAutoCompileOnSave]);

	const handleAutoCompileOnSaveChange = (checked: boolean) => {
		setProperty(autoCompilePropertyId, checked, {
			scope: 'project',
			projectId,
		});
	};

	const handleClearCache = useCallback(async () => {
		await clearCache(provider.id);
	}, [clearCache, provider.id]);

	const handleClearAndCompile = useCallback(async () => {
		await clearCache(provider.id);
		await handleCompile();
	}, [clearCache, provider.id, handleCompile]);

	const toggleDropdown = (e: React.MouseEvent) => {
		e.stopPropagation();
		setIsDropdownOpen(!isDropdownOpen);
	};

	const status = genericTypesetterService.getConnectionStatus(provider.id);
	const isDisabled = isCompiling || isExporting || !effectiveMainFile;

	const renderField = (field: CompilerUIField) => {
		const stored = readValue(field.key);
		const value = stored === undefined ? fieldDefault(field) : stored;

		if (field.kind === 'boolean') {
			return (
				<label className='dropdown-checkbox' key={field.key}>
					<input
						type='checkbox'
						checked={value === true}
						onChange={(e) => writeValue(field.key, e.target.checked)}
						disabled={isCompiling}
					/>
					{resolveLabel(field.label)}
				</label>
			);
		}

		if (field.kind === 'select') {
			return (
				<div className='dropdown-section' key={field.key}>
					<div className='dropdown-title'>{resolveLabel(field.label)}</div>
					<select
						value={String(value)}
						onChange={(e) => writeValue(field.key, e.target.value)}
						className='dropdown-select'
						disabled={isCompiling}
					>
						{(field.options ?? []).map((option) => (
							<option key={option.value} value={option.value}>
								{resolveLabel(option.label)}
							</option>
						))}
					</select>
				</div>
			);
		}

		return (
			<div className='dropdown-section' key={field.key}>
				<div className='dropdown-title'>{resolveLabel(field.label)}</div>
				<input
					type={field.kind === 'number' ? 'number' : 'text'}
					value={String(value)}
					onChange={(e) =>
						writeValue(
							field.key,
							field.kind === 'number' ? Number(e.target.value) : e.target.value,
						)
					}
					className='dropdown-select'
					disabled={isCompiling}
				/>
			</div>
		);
	};

	return (
		<div className={`external-compile-buttons ${className}`} ref={dropdownRef}>
			<div className='compile-button-group'>
				<button
					className={`external-button compile-button ${isCompiling ? 'compiling' : ''}`}
					onClick={handleCompile}
					disabled={isDisabled}
					title={
						status === 'error'
							? t('Compiler connection error')
							: t('Compile {typesetter}', { typesetter: provider.label })
					}
				>
					{isCompiling ? <StopIcon /> : <PlayIcon />}
					{/* <span>{provider.label}</span> */}
				</button>

				<PopoutViewerToggleButton
					className='popout-viewer-button'
					buttonClassName='external-button'
					projectId={projectId || 'default'}
					title={t('Open output in new window')}
				/>

				<button
					className='external-button dropdown-toggle'
					onClick={toggleDropdown}
					title={t('Compilation Options')}
				>
					<ChevronDownIcon />
					<span className='external-button-status' aria-hidden='true'>
						<GlobeIcon />
					</span>
				</button>
			</div>

			<PositionedDropdown
				isOpen={isDropdownOpen}
				triggerElement={
					dropdownRef.current?.querySelector(
						'.compile-button-group',
					) as HTMLElement
				}
				className='external-dropdown'
			>
				<div className='dropdown-section'>
					<div className='dropdown-title'>{t('Main File:')}</div>
					<div className='dropdown-value' title={effectiveMainFile}>
						{getFilenameFromPath(effectiveMainFile, '.tex') ||
							t('No input file')}
					</div>
					<select
						value={propMainFile || 'auto'}
						onChange={(e) => handleMainFileChange(e.target.value)}
						className='dropdown-select'
						disabled={isCompiling}
					>
						<option value='auto'>{t('Auto-detect')}</option>
						{availableFiles.map((filePath) => (
							<option key={filePath} value={filePath}>
								{getFilenameFromPath(filePath, '.tex')}
							</option>
						))}
					</select>
				</div>

				{fields.length > 0 && (
					<div className='dropdown-section'>{fields.map(renderField)}</div>
				)}

				<div className='dropdown-section'>
					{useSharedSettings && (
						<label className='dropdown-checkbox'>
							<input
								type='checkbox'
								checked={effectiveAutoCompileOnSave}
								onChange={(e) =>
									handleAutoCompileOnSaveChange(e.target.checked)
								}
								disabled={isCompiling}
							/>

							{t('Auto-compile on save')}
						</label>
					)}

					<div
						className='cache-item'
						onClick={handleClearCache}
						title={t('Clear compilation cache')}
					>
						<TrashIcon />
						{t('Clear Cache')}
					</div>
					<div
						className='cache-item'
						onClick={handleClearAndCompile}
						title={t('Clear cache and compile')}
					>
						<ClearCompileIcon />
						{t('Clear & Compile')}
					</div>
				</div>
			</PositionedDropdown>
		</div>
	);
};

export default ExternalCompileButton;
