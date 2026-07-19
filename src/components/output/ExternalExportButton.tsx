// src/components/output/ExternalExportButton.tsx
import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { t } from '@/i18n';
import PositionedDropdown from '../common/PositionedDropdown';
import { useExternalCompiler } from '../../hooks/useExternalCompiler';
import { useFileTree } from '../../hooks/useFileTree';
import { useProperties } from '../../hooks/useProperties';
import { fileStorageService } from '../../services/FileStorageService';
import type {
	CompilerProvider,
	CompilerUIField,
	TranslatableText,
} from '../../types/compilation';
import {
	ChevronDownIcon,
	ExportIcon,
	GlobeIcon,
	OptionsIcon,
} from '../common/Icons';
import { getFilenameFromPath } from '../../utils/fileUtils';
import {
	collectValues,
	fieldDefault,
	findInputFiles,
	resolveLabel,
} from '../../utils/compilerUtils';

interface ExternalExportButtonProps {
	provider: CompilerProvider;
	className?: string;
	linkedFileInfo?: {
		fileName?: string;
		filePath?: string;
	} | null;
}

const LOG_FIELD_KEY = 'includeLog';

const ExternalExportButton: React.FC<ExternalExportButtonProps> = ({
	provider,
	className = '',
	linkedFileInfo,
}) => {
	const { isCompiling, isExporting, exportDocument } = useExternalCompiler();
	const { selectedFileId, getFile, fileTree } = useFileTree();
	const { getProperty, setProperty, registerProperty } = useProperties();
	const [isDropdownOpen, setIsDropdownOpen] = useState(false);
	const [isGroupOpen, setIsGroupOpen] = useState(false);
	const [autoMainFile, setAutoMainFile] = useState<string | undefined>();
	const dropdownRef = useRef<HTMLDivElement>(null);
	const propertiesRegistered = useRef(false);

	const projectId = fileStorageService.getCurrentProjectId() || undefined;
	const section = provider.ui?.export;
	const fields = section?.fields ?? [];
	const mainFilePropertyId = `external-${provider.id}-main-file`;
	const fieldPropertyId = useCallback(
		(key: string) => `external-export-${provider.id}-${key}`,
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

		for (const field of fields) {
			registerProperty({
				id: fieldPropertyId(field.key),
				category: 'Export',
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

	const handleExport = useCallback(async () => {
		if (!effectiveMainFile) return;
		const { format, options } = collectValues(fields, readValue);
		const resolvedFormat = format ?? provider.outputFormats[0]?.id ?? 'pdf';
		const includeLog = options[LOG_FIELD_KEY] === true;
		delete options[LOG_FIELD_KEY];

		await exportDocument(provider.id, effectiveMainFile, resolvedFormat, {
			includeLog,
			options,
		});
		setIsDropdownOpen(false);
	}, [effectiveMainFile, fields, readValue, provider, exportDocument]);

	const toggleDropdown = (e: React.MouseEvent) => {
		e.stopPropagation();
		setIsDropdownOpen(!isDropdownOpen);
	};

	const exportLabel = resolveLabel(section?.label) || t('Export');
	const isDisabled = isCompiling || isExporting || !effectiveMainFile;

	const isFieldVisible = useCallback(
		(field: CompilerUIField): boolean => {
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
						disabled={isExporting}
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
						disabled={isExporting}
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
					disabled={isExporting}
				/>
			</div>
		);
	};

	return (
		<div className={`external-export-buttons ${className}`} ref={dropdownRef}>
			<div className='compile-button-group'>
				<button
					className={`external-button export-button ${isExporting ? 'exporting' : ''}`}
					onClick={handleExport}
					disabled={isDisabled}
					title={exportLabel}
				>
					<ExportIcon />
				</button>

				<button
					className='external-button dropdown-toggle'
					onClick={toggleDropdown}
					title={t('Export Options')}
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
				</div>

				{(ungroupedFields.length > 0 || groupedFields.length > 0) && (
					<div className='dropdown-section'>
						{ungroupedFields.map(renderField)}
						{groupedFields.length > 0 && (
							<div className='format-selector-header'>
								<div className='dropdown-title'>{resolveLabel(groupLabel)}</div>
								<button
									className={`pdf-options-toggle ${isGroupOpen ? 'active' : ''}`}
									onClick={() => setIsGroupOpen(!isGroupOpen)}
									title={t('Options')}
									disabled={isExporting}
								>
									<OptionsIcon />
								</button>
							</div>
						)}
						{groupedFields.length > 0 && isGroupOpen && (
							<div className='pdf-options-section'>
								{groupedFields.map((field) => (
									<div className='pdf-option' key={field.key}>
										{renderField(field)}
									</div>
								))}
							</div>
						)}
					</div>
				)}

				<div className='dropdown-section'>
					<button
						type='button'
						className='dropdown-button'
						onClick={handleExport}
						disabled={isDisabled}
					>
						<ExportIcon />
						{exportLabel}
					</button>
				</div>
			</PositionedDropdown>
		</div>
	);
};

export default ExternalExportButton;
