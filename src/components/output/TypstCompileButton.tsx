// src/components/output/TypstCompileButton.tsx
import type React from 'react';
import { useEffect, useRef, useState } from 'react';

import { t } from '@/i18n';
import PopoutViewerToggleButton from './PopoutViewerToggleButton';
import PositionedDropdown from '../common/PositionedDropdown';
import { usePersistentState } from '../../hooks/usePersistentState';
import { useCollab } from '../../hooks/useCollab';
import { useFileTree } from '../../hooks/useFileTree';
import { useTypst } from '../../hooks/useTypst';
import { useSettings } from '../../hooks/useSettings';
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
import { isTypstFile, isTemporaryFile } from '../../utils/fileUtils';
import { fileStorageService } from '../../services/FileStorageService';
import {
	OptionsIcon,
	ChevronDownIcon,
	ClearCompileIcon,
	PlayIcon,
	StopIcon,
	TrashIcon,
	ResetIcon,
} from '../common/Icons';

interface TypstCompileButtonProps {
	dropdownKey: string;
	className?: string;
	selectedDocId?: string | null;
	documents?: Array<{ id: string; name: string }>;
	onNavigateToLinkedFile?: () => void;
	onExpandTypstOutput?: () => void;
	linkedFileInfo?: {
		fileName?: string;
		filePath?: string;
		fileId?: string;
	} | null;
	shouldNavigateOnCompile?: boolean;
	useSharedSettings?: boolean;
}

const TypstCompileButton: React.FC<TypstCompileButtonProps> = ({
	dropdownKey,
	className = '',
	selectedDocId,
	documents,
	onNavigateToLinkedFile,
	onExpandTypstOutput,
	linkedFileInfo,
	shouldNavigateOnCompile = false,
	useSharedSettings = false,
}) => {
	const {
		isCompiling,
		compileDocument,
		stopCompilation,
		clearCache,
		currentFormat,
	} = useTypst();
	const { selectedFileId, getFile, fileTree } = useFileTree();
	const { data: doc, changeData: changeDoc } = useCollab<DocumentList>();
	const { getSetting } = useSettings();
	const { getProperty, setProperty, registerProperty, unregisterProperty } =
		useProperties();
	const [autoMainFile, setAutoMainFile] = useState<string | undefined>();
	const [availableTypstFiles, setAvailableTypstFiles] = useState<string[]>([]);

	const dropdownRef = useRef<HTMLDivElement>(null);
	const [isDropdownOpen, setIsDropdownOpen] = usePersistentState(
		dropdownKey,
		false,
	);
	const [isPdfOptionsOpen, setIsPdfOptionsOpen] = usePersistentState(
		`${dropdownKey}-pdf`,
		false,
	);
	const propertiesRegistered = useRef(false);

	const projectId = fileStorageService.getCurrentProjectId() || undefined;

	const settingFormat =
		(getSetting('typst-default-format')?.value as TypstOutputFormat) ?? 'pdf';

	const propMainFile = getProperty('typst-main-file', {
		scope: 'project',
		projectId,
	}) as string | undefined;
	const propFormat = getProperty('typst-output-format', {
		scope: 'project',
		projectId,
	}) as TypstOutputFormat | undefined;
	const propPdfStandard = getProperty('typst-pdf-standard', {
		scope: 'project',
		projectId,
	}) as string | undefined;
	const propPdfTags = getProperty('typst-pdf-tags', {
		scope: 'project',
		projectId,
	}) as boolean | undefined;

	const projectMainFile = useSharedSettings
		? doc?.projectMetadata?.mainFile
		: undefined;
	const projectFormat = useSharedSettings
		? doc?.projectMetadata?.typstOutputFormat
		: undefined;

	const effectiveMainFile = projectMainFile || propMainFile || autoMainFile;
	const effectiveFormat =
		projectFormat || propFormat || currentFormat || settingFormat;
	const localPdfOptions: TypstPdfOptions = {
		pdfStandard: propPdfStandard ?? '"1.7"',
		pdfTags: propPdfTags ?? true,
	};
	const effectiveAutoCompileOnSave = useSharedSettings
		? (doc?.projectMetadata?.typstAutoCompileOnSave ?? false)
		: false;

	const compileStateRef = useRef({
		mainFile: effectiveMainFile,
		format: effectiveFormat,
		pdfOptions: localPdfOptions as TypstPdfOptions | undefined,
		sharedPdfOptions: doc?.projectMetadata?.typstPdfOptions,
		shareFormat: !!projectFormat,
		isCompiling,
	});
	compileStateRef.current = {
		mainFile: effectiveMainFile,
		format: effectiveFormat,
		pdfOptions: localPdfOptions,
		sharedPdfOptions: doc?.projectMetadata?.typstPdfOptions,
		shareFormat: !!projectFormat,
		isCompiling,
	};

	useEffect(() => {
		if (propertiesRegistered.current) return;
		propertiesRegistered.current = true;

		registerProperty({
			id: 'typst-main-file',
			category: 'Compilation',
			subcategory: 'Typst',
			defaultValue: undefined,
		});

		registerProperty({
			id: 'typst-output-format',
			category: 'Compilation',
			subcategory: 'Typst',
			defaultValue: 'pdf',
		});

		registerProperty({
			id: 'typst-pdf-standard',
			category: 'Compilation',
			subcategory: 'Typst',
			defaultValue: '"1.7"',
		});

		registerProperty({
			id: 'typst-pdf-tags',
			category: 'Compilation',
			subcategory: 'Typst',
			defaultValue: true,
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

		const allTypstFiles = findTypstFiles(fileTree);
		setAvailableTypstFiles(allTypstFiles);

		const findMainFile = async () => {
			if (
				selectedDocId &&
				linkedFileInfo?.filePath &&
				isTypstFile(linkedFileInfo.filePath)
			) {
				setAutoMainFile(linkedFileInfo.filePath);
				return;
			}

			if (selectedFileId) {
				const file = await getFile(selectedFileId);
				if (file && isTypstFile(file.path)) {
					setAutoMainFile(file.path);
					return;
				}
			}

			if (autoMainFile && allTypstFiles.includes(autoMainFile)) {
				return;
			}

			setAutoMainFile(allTypstFiles[0]);
		};

		findMainFile();
	}, [
		selectedFileId,
		getFile,
		fileTree,
		selectedDocId,
		linkedFileInfo,
		autoMainFile,
	]);

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
	}, [setIsDropdownOpen]);

	useEffect(() => {
		if (!useSharedSettings || !effectiveAutoCompileOnSave) return;

		const handleFileSaved = async () => {
			const state = compileStateRef.current;
			if (state.isCompiling) return;
			if (!state.mainFile) return;

			const pdfOptions =
				state.format === 'pdf' || state.format === 'canvas-pdf'
					? state.shareFormat
						? state.sharedPdfOptions
						: state.pdfOptions
					: undefined;

			if (onExpandTypstOutput) {
				onExpandTypstOutput();
			}

			await compileDocument(state.mainFile, state.format, pdfOptions);
		};

		document.addEventListener('file-saved', handleFileSaved);
		return () => {
			document.removeEventListener('file-saved', handleFileSaved);
		};
	}, [
		useSharedSettings,
		effectiveAutoCompileOnSave,
		compileDocument,
		onExpandTypstOutput,
	]);

	const handleResetProperties = () => {
		unregisterProperty('typst-main-file', { scope: 'project', projectId });
		unregisterProperty('typst-output-format', { scope: 'project', projectId });
		unregisterProperty('typst-pdf-standard', { scope: 'project', projectId });
		unregisterProperty('typst-pdf-tags', { scope: 'project', projectId });
	};

	const shouldNavigateToMain = async (): Promise<boolean> => {
		const navigationSetting =
			(getSetting('typst-auto-navigate-to-main')?.value as string) ??
			'conditional';

		if (navigationSetting === 'never') {
			return false;
		}

		if (navigationSetting === 'always') {
			return true;
		}

		if (navigationSetting === 'conditional') {
			if (selectedFileId) {
				try {
					const currentFile = await getFile(selectedFileId);
					if (currentFile && isTypstFile(currentFile.path)) {
						return false;
					}
				} catch (error) {
					console.warn('Error getting current file:', error);
				}
			}

			if (
				selectedDocId &&
				linkedFileInfo?.filePath &&
				isTypstFile(linkedFileInfo.filePath)
			) {
				return false;
			}

			return true;
		}

		return false;
	};

	const handleCompileOrStop = async () => {
		if (isCompiling) {
			stopCompilation();
		} else if (effectiveMainFile) {
			if (onExpandTypstOutput) {
				onExpandTypstOutput();
			}

			const shouldNavigate = await shouldNavigateToMain();

			if (shouldNavigateOnCompile && shouldNavigate) {
				if (
					linkedFileInfo?.filePath === effectiveMainFile &&
					onNavigateToLinkedFile
				) {
					onNavigateToLinkedFile();
				} else {
					document.dispatchEvent(
						new CustomEvent('navigate-to-compiled-file', {
							detail: {
								filePath: effectiveMainFile,
							},
						}),
					);
				}
			}

			const shouldShareFormat = !!projectFormat;
			const pdfOptions =
				effectiveFormat === 'pdf' || effectiveFormat === 'canvas-pdf'
					? shouldShareFormat
						? doc?.projectMetadata?.typstPdfOptions
						: localPdfOptions
					: undefined;

			await compileDocument(effectiveMainFile, effectiveFormat, pdfOptions);
		}
	};

	const handleClearCache = async () => {
		try {
			clearCache();
		} catch (error) {
			console.error('Failed to clear cache:', error);
		}
	};

	const handleClearCacheAndCompile = async () => {
		if (!effectiveMainFile) return;

		if (onExpandTypstOutput) {
			onExpandTypstOutput();
		}

		const shouldNavigate = await shouldNavigateToMain();

		if (shouldNavigateOnCompile && shouldNavigate) {
			if (
				linkedFileInfo?.filePath === effectiveMainFile &&
				onNavigateToLinkedFile
			) {
				onNavigateToLinkedFile();
			} else {
				document.dispatchEvent(
					new CustomEvent('navigate-to-compiled-file', {
						detail: {
							filePath: effectiveMainFile,
						},
					}),
				);
			}
		}

		const shouldShareFormat = !!projectFormat;
		const pdfOptions =
			effectiveFormat === 'pdf' || effectiveFormat === 'canvas-pdf'
				? shouldShareFormat
					? doc?.projectMetadata?.typstPdfOptions
					: localPdfOptions
				: undefined;

		try {
			clearCache();
			await compileDocument(effectiveMainFile, effectiveFormat, pdfOptions);
		} catch (error) {
			console.error('Failed to compile with cache clear:', error);
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
			setProperty('typst-main-file', newMainFile, {
				scope: 'project',
				projectId,
			});
		}
	};

	const handleShareMainFile = (checked: boolean) => {
		if (!useSharedSettings || !changeDoc) return;

		changeDoc((d) => {
			if (!d.projectMetadata) {
				d.projectMetadata = { name: '', description: '' };
			}
			if (checked) {
				d.projectMetadata.mainFile = propMainFile || autoMainFile;
			} else {
				delete d.projectMetadata.mainFile;
			}
		});
	};

	const handleShareFormat = (checked: boolean) => {
		if (!useSharedSettings || !changeDoc) return;

		changeDoc((d) => {
			if (!d.projectMetadata) {
				d.projectMetadata = { name: '', description: '' };
			}
			if (checked) {
				d.projectMetadata.typstOutputFormat = effectiveFormat;
			} else {
				delete d.projectMetadata.typstOutputFormat;
			}
		});
	};

	const handleAutoCompileOnSaveChange = (checked: boolean) => {
		if (!useSharedSettings || !changeDoc) return;

		changeDoc((d) => {
			if (!d.projectMetadata) {
				d.projectMetadata = { name: '', description: '' };
			}
			d.projectMetadata.typstAutoCompileOnSave = checked;
		});
	};

	const getFileName = (path?: string) => {
		if (!path) return t('No .typ file');
		return path.split('/').pop() || path;
	};

	const getDisplayName = (path?: string) => {
		if (!path) return t('No .typ file');

		if (selectedDocId && linkedFileInfo?.filePath === path && documents) {
			const doc = documents.find((d) => d.id === selectedDocId);
			if (doc) {
				return `${doc.name} ${t('(linked)')}`;
			}
		}

		return getFileName(path);
	};

	const isDisabled = !isCompiling && !effectiveMainFile;

	return (
		<div className={`typst-compile-buttons ${className}`} ref={dropdownRef}>
			<div className='compile-button-group'>
				<button
					className={`typst-button compile-button ${isCompiling ? 'compiling' : ''}`}
					onClick={handleCompileOrStop}
					disabled={isDisabled}
					title={
						isCompiling
							? `${t('Stop Compilation')} ${useSharedSettings ? t('(F8)') : ''}`
							: `${t('Compile Typst Document')} ${useSharedSettings ? t('(F9)') : ''}`
					}
				>
					{isCompiling ? <StopIcon /> : <PlayIcon />}
				</button>

				<PopoutViewerToggleButton
					className='popout-viewer-button'
					projectId={projectId || 'default'}
					title={t('Open output in new window')}
				/>

				<button
					className='typst-button dropdown-toggle'
					onClick={toggleDropdown}
					title={t('Compilation Options')}
				>
					<ChevronDownIcon />
				</button>
			</div>

			<PositionedDropdown
				isOpen={isDropdownOpen}
				triggerElement={
					dropdownRef.current?.querySelector(
						'.compile-button-group',
					) as HTMLElement
				}
				className='typst-dropdown'
			>
				<div className='dropdown-section'>
					<div className='format-selector-header'>
						<div className='dropdown-title'>{t('Main File:')}</div>
						<button
							className='pdf-options-toggle'
							onClick={handleResetProperties}
							title={t('Reset to global settings')}
							disabled={isCompiling}
						>
							<ResetIcon />
						</button>
					</div>
					<div className='dropdown-value' title={effectiveMainFile}>
						{getDisplayName(effectiveMainFile)}
						{projectMainFile && (
							<span className='shared-indicator'>{t('(shared)')}</span>
						)}
					</div>
				</div>
				{useSharedSettings && (
					<div className='dropdown-section'>
						<div className='dropdown-label'>{t('Select main file:')}</div>
						<select
							value={projectMainFile || propMainFile || 'auto'}
							onChange={(e) => handleMainFileChange(e.target.value)}
							className='dropdown-select'
							disabled={isCompiling}
						>
							<option value='auto'>{t('Auto-detect')}</option>
							{availableTypstFiles.map((filePath) => (
								<option key={filePath} value={filePath}>
									{getFileName(filePath)}
								</option>
							))}
						</select>
						<label className='dropdown-checkbox'>
							<input
								type='checkbox'
								checked={!!projectMainFile}
								onChange={(e) => handleShareMainFile(e.target.checked)}
								disabled={isCompiling || !effectiveMainFile}
							/>
							{t('Share with collaborators')}
						</label>
					</div>
				)}

				<div className='dropdown-section'>
					<div className='format-selector-header'>
						<div className='dropdown-title'>{t('Output Format:')}</div>
					</div>
					<div className='format-selector-group'>
						<select
							value={effectiveFormat}
							onChange={(e) => {
								const format = e.target.value as TypstOutputFormat;
								if (useSharedSettings && projectFormat) {
									if (!changeDoc) return;
									changeDoc((d) => {
										if (!d.projectMetadata) {
											d.projectMetadata = { name: '', description: '' };
										}
										d.projectMetadata.typstOutputFormat = format;
									});
								} else {
									setProperty('typst-output-format', format, {
										scope: 'project',
										projectId,
									});
								}
								if (format !== 'pdf') {
									setIsPdfOptionsOpen(false);
								}
							}}
							className='dropdown-select'
							disabled={isCompiling}
						>
							<option value='pdf'>{t('PDF')}</option>
							<option value='canvas-pdf'>{t('Canvas (PDF)')}</option>
							<option value='canvas'>{t('Canvas (SVG)')}</option>
						</select>
						{(effectiveFormat === 'pdf' || effectiveFormat === 'canvas-pdf') && (
							<button
								className={`pdf-options-toggle ${isPdfOptionsOpen ? 'active' : ''}`}
								onClick={() => setIsPdfOptionsOpen(!isPdfOptionsOpen)}
								title={t('PDF Options')}
								disabled={isCompiling}
							>
								<OptionsIcon />
							</button>
						)}
					</div>
					{(effectiveFormat === 'pdf' || effectiveFormat === 'canvas-pdf') && isPdfOptionsOpen && (
						<div className='pdf-options-section'>
							<div className='pdf-option'>
								<label className='dropdown-title'>{t('PDF Standards:')}</label>
								{getStandardGroups().map((group) => {
									const isShared = useSharedSettings && !!projectFormat;
									const current = isShared
										? doc?.projectMetadata?.typstPdfOptions?.pdfStandard
										: localPdfOptions.pdfStandard;
									const selected = parseStandards(current);
									return (
										<div key={group.group} className='pdf-standard-group'>
											<div className='dropdown-label'>{t(group.label)}</div>
											{group.options.map((option) => {
												const checked = selected.includes(option.value);
												const enabled = isStandardEnabled(
													option.value,
													selected,
												);
												return (
													<label
														key={option.value}
														className='dropdown-checkbox'
													>
														<input
															type='checkbox'
															checked={checked}
															disabled={isCompiling || !enabled}
															onChange={() => {
																const next = serializeStandards(
																	toggleStandard(option.value, selected),
																);
																if (isShared) {
																	if (!changeDoc) return;
																	changeDoc((d) => {
																		if (!d.projectMetadata) {
																			d.projectMetadata = {
																				name: '',
																				description: '',
																			};
																		}
																		if (!d.projectMetadata.typstPdfOptions) {
																			d.projectMetadata.typstPdfOptions = {};
																		}
																		d.projectMetadata.typstPdfOptions.pdfStandard =
																			next;
																	});
																} else {
																	setProperty('typst-pdf-standard', next, {
																		scope: 'project',
																		projectId,
																	});
																}
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
									className='dropdown-link'
								>
									{t('Learn more about PDF standards')}
								</a>
							</div>

							<label className='dropdown-checkbox'>
								<input
									type='checkbox'
									checked={
										useSharedSettings && projectFormat
											? doc?.projectMetadata?.typstPdfOptions?.pdfTags !== false
											: localPdfOptions.pdfTags
									}
									onChange={(e) => {
										if (useSharedSettings && projectFormat) {
											if (!changeDoc) return;
											changeDoc((d) => {
												if (!d.projectMetadata) {
													d.projectMetadata = { name: '', description: '' };
												}
												if (!d.projectMetadata.typstPdfOptions) {
													d.projectMetadata.typstPdfOptions = {};
												}
												d.projectMetadata.typstPdfOptions.pdfTags =
													e.target.checked;
											});
										} else {
											setProperty('typst-pdf-tags', e.target.checked, {
												scope: 'project',
												projectId,
											});
										}
									}}
									disabled={isCompiling}
								/>

								{t('Enable PDF tags (accessibility)')}
							</label>
						</div>
					)}
					{/* TODO (fabawi): disabled for now as it conflicts with the output setting from tabs*/}
					{/* {useSharedSettings &&
            <label className="dropdown-checkbox">
              <input
                type="checkbox"
                checked={!!projectFormat}
                onChange={(e) => handleShareFormat(e.target.checked)}
                disabled={isCompiling} />
              {t('Share with collaborators')}
            </label>
          } */}
				</div>

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
						onClick={handleClearCacheAndCompile}
						title={`${t('Clear cache and compile')} ${useSharedSettings ? t('(Shift+F9)') : ''}`}
					>
						<ClearCompileIcon />
						{t('Clear & Compile')}
					</div>
				</div>
			</PositionedDropdown>
		</div>
	);
};

export default TypstCompileButton;
