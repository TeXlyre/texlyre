// src/components/output/TypstExportButton.tsx
import type React from 'react';
import { useEffect, useRef, useState } from 'react';

import { t } from '@/i18n';
import PositionedDropdown from '../common/PositionedDropdown';
import { useCollab } from '../../hooks/useCollab';
import { useFileTree } from '../../hooks/useFileTree';
import { useTypst } from '../../hooks/useTypst';
import { useProperties } from '../../hooks/useProperties';
import type { DocumentList } from '../../types/documents';
import type { TypstPdfOptions } from '../../types/typst';
import type { FileNode } from '../../types/files';
import type { TypstOutputFormat } from '../../types/typst';
import {
	getStandardGroups,
	isStandardEnabled,
	parseStandards,
	serializeStandards,
	toggleStandard,
} from '../../utils/pdfStandardsUtils';
import {
	isTypstFile,
	isTemporaryFile,
	getFilenameFromPath,
} from '../../utils/fileUtils';
import { fileStoreService } from '../../services/FileStoreService';
import { ChevronDownIcon, OptionsIcon, ExportIcon } from '../common/Icons';

interface TypstExportButtonProps {
	className?: string;
	selectedDocId?: string | null;
	documents?: Array<{ id: string; name: string }>;
	linkedFileInfo?: {
		fileName?: string;
		filePath?: string;
		fileId?: string;
	} | null;
	useSharedSettings?: boolean;
}

const TypstExportButton: React.FC<TypstExportButtonProps> = ({
	className = '',
	selectedDocId,
	documents,
	linkedFileInfo,
	useSharedSettings = false,
}) => {
	const { exportDocument } = useTypst();
	const { selectedFileId, fileTree } = useFileTree();
	const { data: doc, changeData: changeDoc } = useCollab<DocumentList>();
	const { getProperty, setProperty, registerProperty } = useProperties();
	const [isDropdownOpen, setIsDropdownOpen] = useState(false);
	const [isExporting, setIsExporting] = useState(false);
	const [autoMainFile, setAutoMainFile] = useState<string | undefined>();
	const [availableTypstFiles, setAvailableTypstFiles] = useState<string[]>([]);
	const [isPdfOptionsOpen, setIsPdfOptionsOpen] = useState(false);
	const dropdownRef = useRef<HTMLDivElement>(null);
	const propertiesRegistered = useRef(false);

	const projectId = fileStoreService.getCurrentProjectId() || undefined;

	const propMainFile = getProperty('typst-export-main-file', {
		scope: 'project',
		projectId,
	}) as string | undefined;
	const propFormat = getProperty('typst-export-format', {
		scope: 'project',
		projectId,
	}) as TypstOutputFormat | undefined;
	const propPdfStandard = getProperty('typst-export-pdf-standard', {
		scope: 'project',
		projectId,
	}) as string | undefined;
	const propPdfTags = getProperty('typst-export-pdf-tags', {
		scope: 'project',
		projectId,
	}) as boolean | undefined;
	const propIncludeLog = getProperty('typst-export-include-log', {
		scope: 'project',
		projectId,
	}) as boolean | undefined;

	const projectMainFile = useSharedSettings
		? doc?.projectMetadata?.mainFile
		: undefined;

	const effectiveMainFile = projectMainFile || propMainFile || autoMainFile;
	const selectedFormat = propFormat || 'pdf';
	const localPdfOptions: TypstPdfOptions = {
		pdfStandard: propPdfStandard ?? '"1.7"',
		pdfTags: propPdfTags ?? true,
	};
	const includeLog = propIncludeLog ?? false;

	useEffect(() => {
		if (propertiesRegistered.current) return;
		propertiesRegistered.current = true;

		registerProperty({
			id: 'typst-export-main-file',
			category: 'Export',
			subcategory: 'Typst',
			defaultValue: undefined,
		});

		registerProperty({
			id: 'typst-export-format',
			category: 'Export',
			subcategory: 'Typst',
			defaultValue: 'pdf',
		});

		registerProperty({
			id: 'typst-export-pdf-standard',
			category: 'Export',
			subcategory: 'Typst',
			defaultValue: '"1.7"',
		});

		registerProperty({
			id: 'typst-export-pdf-tags',
			category: 'Export',
			subcategory: 'Typst',
			defaultValue: true,
		});

		registerProperty({
			id: 'typst-export-include-log',
			category: 'Export',
			subcategory: 'Typst',
			defaultValue: false,
		});
	}, [registerProperty]);

	useEffect(() => {
		const findTypstFiles = (nodes: FileNode[]): string[] => {
			const typstFiles: string[] = [];
			for (const node of nodes) {
				if (
					node.type === 'file' &&
					isTypstFile(node.path) &&
					!isTemporaryFile(node.path)
				) {
					typstFiles.push(node.path);
				}
				if (node.children) {
					typstFiles.push(...findTypstFiles(node.children));
				}
			}
			return typstFiles;
		};

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

		const allTypstFiles = findTypstFiles(fileTree);
		setAvailableTypstFiles(allTypstFiles);

		if (
			selectedDocId &&
			linkedFileInfo?.filePath &&
			isTypstFile(linkedFileInfo.filePath)
		) {
			setAutoMainFile(linkedFileInfo.filePath);
			return;
		}

		if (selectedFileId) {
			const file = findFileById(fileTree, selectedFileId);
			if (file && isTypstFile(file.path)) {
				setAutoMainFile(file.path);
				return;
			}
		}

		setAutoMainFile(allTypstFiles[0]);
	}, [selectedFileId, fileTree, selectedDocId, linkedFileInfo]);

	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			const target = event.target as Node;

			if (dropdownRef.current && !dropdownRef.current.contains(target)) {
				const portaledDropdown = document.querySelector('.typst-dropdown');
				if (portaledDropdown && portaledDropdown.contains(target)) {
					return;
				}
				setIsDropdownOpen(false);
			}
		};

		document.addEventListener('mousedown', handleClickOutside);
		return () => {
			document.removeEventListener('mousedown', handleClickOutside);
		};
	}, []);

	const handleExport = async () => {
		if (!effectiveMainFile || isExporting) return;

		setIsExporting(true);
		try {
			const exportPdfOptions =
				selectedFormat === 'pdf' ? localPdfOptions : undefined;
			await exportDocument(effectiveMainFile, {
				format: selectedFormat,
				includeLog,
				pdfOptions: exportPdfOptions,
			});
		} finally {
			setIsExporting(false);
			setIsDropdownOpen(false);
		}
	};

	const toggleDropdown = (e: React.MouseEvent) => {
		e.stopPropagation();
		setIsDropdownOpen(!isDropdownOpen);
	};

	const handleMainFileChange = (filePath: string) => {
		if (useSharedSettings && projectMainFile) {
			if (!changeDoc) return;
			changeDoc((d) => {
				if (!d.projectMetadata) {
					d.projectMetadata = { name: '', description: '' };
				}
				d.projectMetadata.mainFile = filePath === 'auto' ? undefined : filePath;
			});
		} else {
			const newMainFile = filePath === 'auto' ? undefined : filePath;
			setProperty('typst-export-main-file', newMainFile, {
				scope: 'project',
				projectId,
			});
		}
	};

	const getDisplayName = (path?: string) => {
		if (selectedDocId && linkedFileInfo?.filePath === path && documents) {
			const doc = documents.find((d) => d.id === selectedDocId);
			if (doc) {
				return `${doc.name} ${t('(linked)')}`;
			}
		}

		return getFilenameFromPath(path, '.typ');
	};

	const isDisabled = isExporting || !effectiveMainFile;

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
					className={`ui-split-main export-button ${isExporting ? 'exporting' : ''}`}
					onClick={handleExport}
					disabled={isDisabled}
					title={t('Export')}
				>
					<ExportIcon />
				</button>

				<button
					type='button'
					className='ui-split-toggle dropdown-toggle'
					onClick={toggleDropdown}
					disabled={isExporting}
					title={t('Export Options')}
				>
					<ChevronDownIcon />
				</button>
			</div>

			<PositionedDropdown
				isOpen={isDropdownOpen}
				triggerElement={
					dropdownRef.current?.querySelector(
						'[data-trigger-group]',
					) as HTMLElement
				}
				className='typst-dropdown'
			>
				<div className='ui-menu-section' data-variant='control'>
					<div className='ui-menu-title' data-variant='control'>
						{t('Main File:')}
					</div>
					<div className='ui-menu-value' title={effectiveMainFile}>
						{getDisplayName(effectiveMainFile)}
						{projectMainFile && (
							<span className='ui-status' data-tone='accent'>
								{t('(shared)')}
							</span>
						)}
					</div>
				</div>

				{useSharedSettings && (
					<div className='ui-menu-section' data-variant='control'>
						<div className='ui-menu-label'>{t('Select main file:')}</div>
						<select
							value={projectMainFile || propMainFile || 'auto'}
							onChange={(e) => handleMainFileChange(e.target.value)}
							className='ui-field-control'
							disabled={isExporting}
						>
							<option value='auto'>{t('Auto-detect')}</option>
							{availableTypstFiles.map((filePath) => (
								<option key={filePath} value={filePath}>
									{getFilenameFromPath(filePath, '.typ')}
								</option>
							))}
						</select>
					</div>
				)}

				<div className='ui-menu-section' data-variant='control'>
					<div className='ui-toolbar' data-justify='between' data-gap='sm'>
						<div className='ui-menu-title' data-variant='control'>
							{t('Export Format:')}
						</div>
					</div>

					<div className='ui-toolbar' data-gap='sm'>
						<select
							value={selectedFormat}
							onChange={(e) => {
								const format = e.target.value as TypstOutputFormat;
								setProperty('typst-export-format', format, {
									scope: 'project',
									projectId,
								});
								if (format !== 'pdf') {
									setIsPdfOptionsOpen(false);
								}
							}}
							className='ui-field-control'
							disabled={isExporting}
						>
							<option value='pdf'>{t('PDF')}</option>
							<option value='canvas'>{t('SVG')}</option>
						</select>
						{selectedFormat === 'pdf' && (
							<button
								type='button'
								className={`ui-icon-button ${isPdfOptionsOpen ? 'active' : ''}`}
								data-variant='control'
								onClick={() => setIsPdfOptionsOpen(!isPdfOptionsOpen)}
								title={t('PDF Options')}
								disabled={isExporting}
							>
								<OptionsIcon />
							</button>
						)}
					</div>
					{selectedFormat === 'pdf' && isPdfOptionsOpen && (
						<div
							className='ui-card ui-stack'
							data-surface='secondary'
							data-padding='sm'
							data-gap='sm'
						>
							<div className='ui-field'>
								<label className='ui-menu-title' data-variant='control'>
									{t('PDF Standards:')}
								</label>
								{getStandardGroups().map((group) => {
									const selected = parseStandards(localPdfOptions.pdfStandard);
									return (
										<div key={group.group} className='pdf-standard-group'>
											<div className='ui-menu-label'>{t(group.label)}</div>
											{group.options.map((option) => {
												const checked = selected.includes(option.value);
												const enabled = isStandardEnabled(
													option.value,
													selected,
												);
												return (
													<label
														key={option.value}
														className='ui-menu-item checkbox-control'
													>
														<input
															type='checkbox'
															checked={checked}
															disabled={isExporting || !enabled}
															onChange={() => {
																const next = toggleStandard(
																	option.value,
																	selected,
																);
																setProperty(
																	'typst-export-pdf-standard',
																	serializeStandards(next),
																	{ scope: 'project', projectId },
																);
															}}
														/>
														{t(option.label)}
													</label>
												);
											})}
										</div>
									);
								})}
								<a
									href='https://typst.app/docs/reference/pdf/'
									target='_blank'
									rel='noopener noreferrer'
								>
									{t('Learn more about PDF standards')}
								</a>
							</div>
							<label className='ui-menu-item checkbox-control'>
								<input
									type='checkbox'
									checked={localPdfOptions.pdfTags !== false}
									onChange={(e) => {
										setProperty('typst-export-pdf-tags', e.target.checked, {
											scope: 'project',
											projectId,
										});
									}}
									disabled={isExporting}
								/>

								{t('Enable PDF tags (accessibility)')}
							</label>
						</div>
					)}
				</div>

				<div className='ui-menu-section' data-variant='control'>
					<label className='ui-menu-item checkbox-control'>
						<input
							type='checkbox'
							checked={includeLog}
							onChange={(e) => {
								setProperty('typst-export-include-log', e.target.checked, {
									scope: 'project',
									projectId,
								});
							}}
							disabled={isExporting}
						/>

						{t('Include log file')}
					</label>
				</div>

				<div className='ui-menu-section' data-variant='control'>
					<button
						type='button'
						className='button primary'
						onClick={handleExport}
						disabled={isDisabled}
					>
						<ExportIcon />
						{t('Export')}
					</button>
				</div>
			</PositionedDropdown>
		</div>
	);
};

export default TypstExportButton;
