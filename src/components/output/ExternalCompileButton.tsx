// src/components/output/ExternalCompileButton.tsx
import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { t } from '@/i18n';
import PositionedDropdown from '../common/PositionedDropdown';
import PopoutViewerToggleButton from './PopoutViewerToggleButton';
import { useExternalTypesetter } from '../../hooks/useExternalTypesetter';
import { useFileTree } from '../../hooks/useFileTree';
import { useSettings } from '../../hooks/useSettings';
import { useProperties } from '../../hooks/useProperties';
import { fileStoreService } from '../../services/FileStoreService';
import { genericTypesetterService } from '../../services/GenericTypesetterService';
import type { FileNode } from '../../types/files';
import type {
	TypesetterProvider,
	TypesetterUIField,
	TranslatableText,
} from '../../types/compilation';
import {
	ChevronDownIcon,
	ClearCompileIcon,
	GlobeIcon,
	OptionsIcon,
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
	provider: TypesetterProvider;
	className?: string;
	onExpandExternalOutput?: () => void;
	onNavigateToLinkedFile?: () => void;
	selectedDocId?: string | null;
	linkedFileInfo?: {
		fileName?: string;
		filePath?: string;
	} | null;
	shouldNavigateOnCompile?: boolean;
	useSharedSettings?: boolean;
}

const findFileById = (
	nodes: FileNode[],
	fileId: string,
): FileNode | undefined => {
	for (const node of nodes) {
		if (node.id === fileId) return node;
		if (node.children) {
			const match = findFileById(node.children, fileId);
			if (match) return match;
		}
	}
	return undefined;
};

const ExternalCompileButton: React.FC<ExternalCompileButtonProps> = ({
	provider,
	className = '',
	onExpandExternalOutput,
	onNavigateToLinkedFile,
	selectedDocId,
	linkedFileInfo,
	shouldNavigateOnCompile = false,
	useSharedSettings = false,
}) => {
	const { isCompiling, isExporting, compileDocument, clearCache } =
		useExternalTypesetter();
	const { selectedFileId, fileTree } = useFileTree();
	const { getSetting } = useSettings();
	const { getProperty, setProperty, registerProperty } = useProperties();
	const [isDropdownOpen, setIsDropdownOpen] = useState(false);
	const [isGroupOpen, setIsGroupOpen] = useState(false);
	const [autoMainFile, setAutoMainFile] = useState<string | undefined>();
	const dropdownRef = useRef<HTMLDivElement>(null);
	const propertiesRegistered = useRef(false);

	const projectId = fileStoreService.getCurrentProjectId() || undefined;
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
	const selectedLinkedFilePath =
		selectedDocId === undefined || selectedDocId
			? linkedFileInfo?.filePath
			: undefined;

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
		if (
			selectedLinkedFilePath &&
			availableFiles.includes(selectedLinkedFilePath)
		) {
			setAutoMainFile(selectedLinkedFilePath);
			return;
		}

		if (selectedFileId) {
			const file = findFileById(fileTree, selectedFileId);
			if (file && availableFiles.includes(file.path)) {
				setAutoMainFile(file.path);
				return;
			}
		}

		if (autoMainFile && availableFiles.includes(autoMainFile)) return;
		setAutoMainFile(availableFiles[0]);
	}, [
		selectedLinkedFilePath,
		selectedFileId,
		fileTree,
		availableFiles,
		autoMainFile,
	]);

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

	const shouldNavigateToMain = useCallback((): boolean => {
		const navigationSetting =
			(getSetting('external-typesetter-auto-navigate-to-main')
				?.value as string) ?? 'conditional';

		if (navigationSetting === 'never') return false;
		if (navigationSetting === 'always') return true;

		if (navigationSetting === 'conditional') {
			if (selectedFileId) {
				const currentFile = findFileById(fileTree, selectedFileId);
				if (currentFile && availableFiles.includes(currentFile.path)) {
					return false;
				}
			}

			if (
				selectedLinkedFilePath &&
				availableFiles.includes(selectedLinkedFilePath)
			) {
				return false;
			}

			return true;
		}

		return false;
	}, [
		getSetting,
		selectedFileId,
		fileTree,
		availableFiles,
		selectedLinkedFilePath,
	]);

	const runCompile = useCallback(
		async (navigateToMain: boolean) => {
			if (!effectiveMainFile) return;

			onExpandExternalOutput?.();

			if (navigateToMain && shouldNavigateOnCompile && shouldNavigateToMain()) {
				if (
					linkedFileInfo?.filePath === effectiveMainFile &&
					onNavigateToLinkedFile
				) {
					onNavigateToLinkedFile();
				} else {
					document.dispatchEvent(
						new CustomEvent('navigate-to-compiled-file', {
							detail: { filePath: effectiveMainFile },
						}),
					);
				}
			}

			const { format, options } = collectValues(fields, readValue);
			const resolvedFormat = format ?? provider.outputFormats[0]?.id ?? 'pdf';
			await compileDocument(
				provider.id,
				effectiveMainFile,
				resolvedFormat,
				options,
			);
		},
		[
			effectiveMainFile,
			onExpandExternalOutput,
			shouldNavigateOnCompile,
			shouldNavigateToMain,
			linkedFileInfo,
			onNavigateToLinkedFile,
			fields,
			readValue,
			provider,
			compileDocument,
		],
	);

	const handleCompile = useCallback(async () => {
		await runCompile(true);
	}, [runCompile]);

	const compileStateRef = useRef({ isCompiling, runCompile });
	compileStateRef.current = { isCompiling, runCompile };

	useEffect(() => {
		if (!useSharedSettings || !effectiveAutoCompileOnSave) return;

		const handleFileSaved = async () => {
			const state = compileStateRef.current;
			if (state.isCompiling) return;
			await state.runCompile(false);
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

	const isFieldVisible = useCallback(
		(field: TypesetterUIField): boolean => {
			if (!field.showWhen) return true;
			const dep = fields.find((f) => f.key === field.showWhen?.field);
			if (!dep) return true;
			const stored = readValue(dep.key);
			const resolved =
				stored === undefined || stored === null || stored === ''
					? fieldDefault(dep)
					: stored;
			return field.showWhen.in.includes(String(resolved));
		},
		[fields, readValue],
	);

	const visibleFields = fields.filter(isFieldVisible);
	const ungroupedFields = visibleFields.filter((f) => !f.group);
	const groupKey = visibleFields.find((f) => f.group)?.group;
	const groupedFields = groupKey
		? visibleFields.filter((f) => f.group === groupKey)
		: [];
	const groupLabel: TranslatableText = groupKey
		? `${groupKey.toUpperCase()} Options`
		: 'Options';

	const renderField = (field: TypesetterUIField) => {
		const stored = readValue(field.key);
		const value = stored === undefined ? fieldDefault(field) : stored;

		if (field.kind === 'boolean') {
			return (
				<label className='ui-menu-item checkbox-control' key={field.key}>
					<br />
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
				<div className='ui-menu-section' data-variant='control' key={field.key}>
					<div className='ui-menu-title' data-variant='control'>
						{resolveLabel(field.label)}
					</div>
					<select
						value={String(value)}
						onChange={(e) => writeValue(field.key, e.target.value)}
						className='ui-field-control'
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
			<div className='ui-menu-section' data-variant='control' key={field.key}>
				<div className='ui-menu-title' data-variant='control'>
					{resolveLabel(field.label)}
				</div>
				<input
					type={field.kind === 'number' ? 'number' : 'text'}
					value={String(value)}
					onChange={(e) =>
						writeValue(
							field.key,
							field.kind === 'number' ? Number(e.target.value) : e.target.value,
						)
					}
					className='ui-field-control'
					disabled={isCompiling}
				/>
			</div>
		);
	};

	return (
		<div className={`ui-control-cluster ${className}`} ref={dropdownRef}>
			<div
				className='ui-button-group ui-split-button'
				data-variant='joined'
				data-size='control'
				data-trigger-group='true'
			>
				<button
					type='button'
					className={`ui-split-main compile-button ${isCompiling ? 'compiling' : ''}`}
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
					projectId={projectId || 'default'}
					title={t('Open output in new window')}
				/>

				<button
					type='button'
					className='ui-split-toggle dropdown-toggle'
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
						'[data-trigger-group]',
					) as HTMLElement
				}
				className='external-dropdown'
			>
				<div className='ui-menu-section' data-variant='control'>
					<div className='ui-menu-title' data-variant='control'>
						{t('Main File:')}
					</div>
					<div className='ui-menu-value' title={effectiveMainFile}>
						{getFilenameFromPath(effectiveMainFile, '.tex') ||
							t('No input file')}
					</div>
					<select
						value={propMainFile || 'auto'}
						onChange={(e) => handleMainFileChange(e.target.value)}
						className='ui-field-control'
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

				{(ungroupedFields.length > 0 || groupedFields.length > 0) && (
					<div className='ui-menu-section' data-variant='control'>
						{ungroupedFields.map(renderField)}
						{groupedFields.length > 0 && (
							<div className='ui-toolbar' data-justify='between' data-gap='sm'>
								<div className='ui-menu-title' data-variant='control'>
									{resolveLabel(groupLabel)}
								</div>
								<button
									type='button'
									className={`ui-icon-button ${isGroupOpen ? 'active' : ''}`}
									data-variant='control'
									onClick={() => setIsGroupOpen(!isGroupOpen)}
									title={t('Options')}
									disabled={isCompiling}
								>
									<OptionsIcon />
								</button>
							</div>
						)}
						{groupedFields.length > 0 && isGroupOpen && (
							<div
								className='ui-card ui-stack'
								data-surface='secondary'
								data-padding='sm'
								data-gap='sm'
							>
								{groupedFields.map((field) => (
									<div className='ui-field' key={field.key}>
										{renderField(field)}
									</div>
								))}
							</div>
						)}
					</div>
				)}

				<div className='ui-menu-section' data-variant='control'>
					{useSharedSettings && (
						<label className='ui-menu-item checkbox-control'>
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
						className='ui-menu-item'
						onClick={handleClearCache}
						title={t('Clear compilation cache')}
					>
						<TrashIcon />
						{t('Clear Cache')}
					</div>
					<div
						className='ui-menu-item'
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
