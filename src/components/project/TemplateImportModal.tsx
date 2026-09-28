// src/components/project/TemplateImportModal.tsx
import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { t } from '@/i18n';
import { createNamedLogger } from '@/logging';
import { useSettings } from '../../hooks/useSettings';
import type { TemplateProject } from '../../types/projects';
import Modal from '../common/Modal';
import SettingsModal from '../settings/SettingsModal';
import TypesetterInfo from '../common/TypesetterInfo';
import { formatLastModified } from '../../utils/dateUtils';
import {
	FolderIcon,
	ImportIcon,
	TemplatesIcon,
	SettingsIcon,
} from '../common/Icons';

const moduleLog = createNamedLogger('TemplateImportModal');

interface TemplateCategory {
	id: string;
	name: string;
	description: string;
	templates: TemplateProject[];
}

interface TemplateImportModalProps {
	isOpen: boolean;
	onClose: () => void;
	onTemplateSelected: (template: TemplateProject) => void;
}

const TemplateImportModal: React.FC<TemplateImportModalProps> = ({
	isOpen,
	onClose,
	onTemplateSelected,
}) => {
	const { registerSetting, getSetting } = useSettings();
	const settingsRegistered = useRef(false);
	const [showSettings, setShowSettings] = useState(false);

	const [categories, setCategories] = useState<TemplateCategory[]>([]);
	const [allTemplates, setAllTemplates] = useState<TemplateProject[]>([]);
	const [filteredTemplates, setFilteredTemplates] = useState<TemplateProject[]>(
		[],
	);
	const [paginatedTemplates, setPaginatedTemplates] = useState<
		TemplateProject[]
	>([]);
	const [selectedCategory, setSelectedCategory] = useState<string>('all');
	const [selectedType, setSelectedType] = useState<string>('all');
	const [searchQuery, setSearchQuery] = useState('');
	const [selectedTemplate, setSelectedTemplate] =
		useState<TemplateProject | null>(null);
	const [selectedVersion, setSelectedVersion] = useState<string | null>(null);
	const [currentPage, setCurrentPage] = useState(1);
	const [totalPages, setTotalPages] = useState(0);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [loadedImages, setLoadedImages] = useState<Set<string>>(new Set());

	const [templatesApiUrl, setTemplatesApiUrl] = useState(
		'https://texlyre.github.io/texlyre-templates/api/templates.json',
	);
	const [templatesPerPage, setTemplatesPerPage] = useState(12);

	useEffect(() => {
		if (settingsRegistered.current) return;
		settingsRegistered.current = true;

		const initialUrl =
			(getSetting('templates-api-url')?.value as string) ??
			'https://texlyre.github.io/texlyre-templates/api/templates.json';
		const initialPerPage =
			(getSetting('templates-per-page')?.value as number) ?? 12;

		setTemplatesApiUrl(initialUrl);
		setTemplatesPerPage(initialPerPage);

		registerSetting({
			id: 'templates-api-url',
			category: t('Templates'),
			subcategory: t('Template Gallery'),
			type: 'text',
			label: t('Template gallery API URL'),
			description: t('URL endpoint for fetching project templates'),
			defaultValue: initialUrl,
			onChange: (value) => {
				setTemplatesApiUrl(value as string);
			},
		});

		registerSetting({
			id: 'templates-per-page',
			category: t('Templates'),
			subcategory: t('Template Gallery'),
			type: 'number',
			label: t('Templates per page'),
			description: t('Number of templates to display per page'),
			defaultValue: 12,
			min: 6,
			max: 48,
			onChange: (value) => {
				setTemplatesPerPage(value as number);
			},
		});
	}, [registerSetting, getSetting]);

	const loadTemplates = useCallback(async () => {
		try {
			setIsLoading(true);
			setError(null);

			const response = await fetch(templatesApiUrl);
			if (!response.ok) {
				throw new Error(`Failed to fetch templates: ${response.statusText}`);
			}

			const data = await response.json();
			setCategories(data.categories || []);

			const allTemplatesFlat =
				data.categories?.flatMap((cat: any) =>
					cat.templates.map((template: any) => ({
						...template,
						type: template.type || 'latex',
					})),
				) || [];
			setAllTemplates(allTemplatesFlat);
		} catch (error) {
			moduleLog.error('Error loading templates:', error);
			setError(
				error instanceof Error ? error.message : t('Failed to load templates'),
			);
		} finally {
			setIsLoading(false);
		}
	}, [templatesApiUrl]);

	const filterAndPaginateTemplates = useCallback(() => {
		let filtered: TemplateProject[] = [];

		if (selectedCategory === 'all') {
			filtered = allTemplates;
		} else {
			filtered = allTemplates.filter(
				(template) => template.category === selectedCategory,
			);
		}

		if (selectedType !== 'all') {
			filtered = filtered.filter(
				(template) => (template.type || 'latex') === selectedType,
			);
		}

		if (searchQuery.trim()) {
			const query = searchQuery.toLowerCase();
			filtered = filtered.filter(
				(template) =>
					template.name.toLowerCase().includes(query) ||
					template.description.toLowerCase().includes(query) ||
					template.tags.some((tag) => tag.toLowerCase().includes(query)),
			);
		}

		setFilteredTemplates(filtered);
		setTotalPages(Math.ceil(filtered.length / templatesPerPage));

		const startIndex = (currentPage - 1) * templatesPerPage;
		const endIndex = startIndex + templatesPerPage;
		setPaginatedTemplates(filtered.slice(startIndex, endIndex));
	}, [
		allTemplates,
		selectedCategory,
		selectedType,
		searchQuery,
		currentPage,
		templatesPerPage,
	]);

	const loadImage = useCallback(
		(templateId: string, imageUrl: string) => {
			if (loadedImages.has(templateId)) return;

			const img = new Image();
			img.onload = () => {
				setLoadedImages((prev) => new Set(prev).add(templateId));
			};
			img.onerror = () => {
				moduleLog.warn(`Failed to load image for template ${templateId}`);
			};
			img.src = imageUrl;
		},
		[loadedImages],
	);

	useEffect(() => {
		if (isOpen) {
			loadTemplates();
		}
	}, [isOpen, loadTemplates]);

	useEffect(() => {
		filterAndPaginateTemplates();
	}, [filterAndPaginateTemplates]);

	useEffect(() => {
		paginatedTemplates.forEach((template) => {
			if (template.previewImage && !loadedImages.has(template.id)) {
				loadImage(template.id, template.previewImage);
			}
		});
	}, [paginatedTemplates, loadImage, loadedImages]);

	const handleTemplateSelect = (template: TemplateProject) => {
		setSelectedTemplate(template);
		setSelectedVersion(template.version ?? null);
		if (template.previewImage) {
			loadImage(template.id, template.previewImage);
		}
	};

	const selectedVersionEntry = selectedTemplate?.versions?.find(
		(v) => v.version === selectedVersion,
	);

	const handleTemplateConfirm = () => {
		if (!selectedTemplate) return;

		const effectiveTemplate: TemplateProject = selectedVersionEntry
			? {
					...selectedTemplate,
					version: selectedVersionEntry.version,
					downloadUrl: selectedVersionEntry.downloadUrl,
					previewImage: selectedVersionEntry.previewImage,
					lastUpdated: selectedVersionEntry.lastUpdated,
					compile: selectedVersionEntry.compile,
					file: selectedVersionEntry.file,
				}
			: selectedTemplate;

		onTemplateSelected(effectiveTemplate);
	};

	const handlePageChange = (page: number) => {
		if (page >= 1 && page <= totalPages) {
			setCurrentPage(page);
		}
	};

	const handleSearchChange = (value: string) => {
		setSearchQuery(value);
		setCurrentPage(1);
	};

	const handleCategoryChange = (value: string) => {
		setSelectedCategory(value);
		setCurrentPage(1);
	};

	const handleTypeChange = (value: string) => {
		setSelectedType(value);
		setCurrentPage(1);
	};

	const handleClose = () => {
		setSearchQuery('');
		setSelectedCategory('all');
		setSelectedType('all');
		setSelectedTemplate(null);
		setCurrentPage(1);
		setAllTemplates([]);
		setFilteredTemplates([]);
		setPaginatedTemplates([]);
		setLoadedImages(new Set());
		setError(null);
		onClose();
	};

	const renderPaginationControls = () => {
		if (totalPages <= 1) return null;

		const getVisiblePages = () => {
			const pages = [];
			const maxVisible = 5;
			let start = Math.max(1, currentPage - Math.floor(maxVisible / 2));
			const end = Math.min(totalPages, start + maxVisible - 1);

			if (end - start + 1 < maxVisible) {
				start = Math.max(1, end - maxVisible + 1);
			}

			for (let i = start; i <= end; i++) {
				pages.push(i);
			}
			return pages;
		};

		const startItem = (currentPage - 1) * templatesPerPage + 1;
		const endItem = Math.min(
			currentPage * templatesPerPage,
			filteredTemplates.length,
		);

		return (
			<div className='ui-pagination' data-responsive='stack'>
				<div className='ui-meta'>
					{t('Showing {startItem}-{endItem} of {count} template', {
						startItem,
						endItem,
						count: filteredTemplates.length,
					})}
				</div>

				<div className='ui-actions' data-wrap='true'>
					<button
						type='button'
						className='button '
						onClick={() => handlePageChange(currentPage - 1)}
						disabled={currentPage === 1 || isLoading}
					>
						{t('← Prev')}
					</button>

					{currentPage > 2 && (
						<>
							<button
								type='button'
								className='button '
								onClick={() => handlePageChange(1)}
								disabled={isLoading}
							>
								1
							</button>
							{currentPage > 3 && <span className='ui-meta'>{t('...')}</span>}
						</>
					)}

					{getVisiblePages().map((page) => (
						<button
							type='button'
							key={page}
							className={`button ${page === currentPage ? 'active' : ''}`}
							onClick={() => handlePageChange(page)}
							disabled={isLoading}
						>
							{page}
						</button>
					))}

					{currentPage < totalPages - 1 && (
						<>
							{currentPage < totalPages - 2 && (
								<span className='ui-meta'>{t('...')}</span>
							)}
							<button
								type='button'
								className='button '
								onClick={() => handlePageChange(totalPages)}
								disabled={isLoading}
							>
								{totalPages}
							</button>
						</>
					)}

					<button
						type='button'
						className='button '
						onClick={() => handlePageChange(currentPage + 1)}
						disabled={currentPage === totalPages || isLoading}
					>
						{t('Next →')}
					</button>
				</div>
			</div>
		);
	};

	return (
		<>
			<Modal
				isOpen={isOpen}
				onClose={handleClose}
				title={t('Import Template')}
				icon={TemplatesIcon}
				size='large'
				headerActions={
					<button
						type='button'
						className='ui-icon-button'
						data-role='modal-close'
						data-variant='subtle'
						onClick={() => setShowSettings(true)}
						title={t('File System Settings')}
					>
						<SettingsIcon />
					</button>
				}
			>
				<div className='template-import-modal ui-stack' data-gap='md'>
					{error && (
						<div
							className='ui-message'
							data-tone='error'
							style={{ marginBottom: '1rem' }}
						>
							{error}
						</div>
					)}

					<div className='template-search-controls'>
						<div className='template-search-row'>
							<input
								type='text'
								placeholder={t('Search templates...')}
								value={searchQuery}
								onChange={(e) => handleSearchChange(e.target.value)}
								className='template-search-input ui-field-control'
								disabled={isLoading}
							/>

							<select
								value={selectedCategory}
								onChange={(e) => handleCategoryChange(e.target.value)}
								className='template-category-select ui-field-control'
								disabled={isLoading}
							>
								<option value='all'>{t('All Categories')}</option>
								{categories.map((category) => (
									<option key={category.id} value={category.id}>
										{category.name}
									</option>
								))}
							</select>

							<select
								value={selectedType}
								onChange={(e) => handleTypeChange(e.target.value)}
								className='template-type-select ui-field-control'
								disabled={isLoading}
							>
								<option value='all'>{t('All Types')}</option>
								<option value='latex'>{t('LaTeX')}</option>
								<option value='typst'>{t('Typst')}</option>
							</select>
						</div>
					</div>

					{isLoading ? (
						<div className='ui-loading-state'>
							<div className='loading-spinner' />
							<p>{t('Loading templates...')}</p>
						</div>
					) : (
						<div className='ui-panel-content' data-overflow='y'>
							{filteredTemplates.length === 0 ? (
								<div className='ui-empty-state' data-style='empty'>
									{t('No templates found matching your criteria.')}
								</div>
							) : selectedTemplate ? (
								<div className='ui-stack' data-gap='lg' data-padding='md'>
									<div className='template-detail-header'>
										<button
											type='button'
											className='button'
											onClick={() => setSelectedTemplate(null)}
										>
											{t('←')} {t('Back to Templates')}
										</button>
										<h3>{selectedTemplate.name}</h3>
									</div>

									<div className='template-detail-content'>
										<div className='template-detail-preview'>
											{selectedTemplate.previewImage ? (
												loadedImages.has(selectedTemplate.id) ? (
													<div style={{ position: 'relative' }}>
														<img
															src={selectedTemplate.previewImage}
															alt={`${selectedTemplate.name} preview`}
															onError={(e) => {
																(e.target as HTMLImageElement).style.display =
																	'none';
															}}
														/>

														<div
															className='ui-badge template-type-info'
															data-variant='label'
														>
															<TypesetterInfo
																type={selectedTemplate.type || 'latex'}
															/>
														</div>
													</div>
												) : (
													<div className='template-preview-loading'>
														<div className='loading-spinner' />
														<span>{t('Loading preview...')}</span>
													</div>
												)
											) : (
												<div className='ui-preview-placeholder'>
													<FolderIcon />
													<span>{t('No preview available')}</span>
												</div>
											)}
										</div>

										<div className='ui-stack' data-gap='md'>
											<div className='ui-actions' data-gap='sm'>
												<span className='ui-badge' data-variant='label'>
													{selectedTemplate.category}
												</span>
											</div>

											<p className='template-detail-description'>
												{selectedTemplate.description}
											</p>

											{selectedTemplate.tags.length > 0 && (
												<div className='ui-tags' data-push='end'>
													{selectedTemplate.tags.map((tag) => (
														<span
															key={tag}
															className='ui-badge'
															data-variant='tag'
															data-size='xs'
														>
															{tag}
														</span>
													))}
												</div>
											)}

											<div
												className='ui-toolbar ui-meta'
												data-justify='between'
												data-divided='true'
											>
												{selectedTemplate.author && (
													<span>
														{t('by {author}', {
															author: selectedTemplate.author,
														})}
													</span>
												)}
												<span>
													{t('Last Updated: {lastUpdated}', {
														lastUpdated: formatLastModified(
															selectedVersionEntry?.lastUpdated ??
																selectedTemplate.lastUpdated,
														),
													})}
												</span>
											</div>

											<div className='ui-actions' data-gap='sm'>
												<select
													className='template-version-select ui-field-control'
													value={selectedVersion ?? ''}
													disabled={
														(selectedTemplate.versions?.length ?? 1) <= 1
													}
													onChange={(e) => setSelectedVersion(e.target.value)}
												>
													{(
														selectedTemplate.versions ?? [
															{
																version: selectedTemplate.version ?? '1.0.0',
																downloadUrl: selectedTemplate.downloadUrl,
																lastUpdated: selectedTemplate.lastUpdated,
															},
														]
													).map((v) => (
														<option key={v.version} value={v.version}>
															v{v.version}
														</option>
													))}
												</select>
											</div>
											<div className='ui-toolbar-actions' data-gap='md'>
												<button
													type='button'
													className='button secondary'
													onClick={() => setSelectedTemplate(null)}
												>
													{t('Cancel')}
												</button>
												<button
													type='button'
													className='button primary'
													onClick={handleTemplateConfirm}
												>
													<ImportIcon />
													{t('Import Template')}
												</button>
											</div>
										</div>
									</div>
								</div>
							) : (
								<>
									<div className='template-grid'>
										{paginatedTemplates.map((template) => (
											<div
												key={template.id}
												className='ui-card ui-stack'
												data-radius='lg'
												data-overflow='hidden'
												data-interactive='true'
												data-hover='lift'
												onClick={() => handleTemplateSelect(template)}
											>
												{template.previewImage ? (
													<div className='template-preview'>
														{loadedImages.has(template.id) ? (
															<>
																<img
																	src={template.previewImage}
																	alt={`${template.name} preview`}
																	onError={(e) => {
																		(
																			e.target as HTMLImageElement
																		).style.display = 'none';
																	}}
																/>

																<div
																	className='ui-badge template-type-info'
																	data-variant='label'
																>
																	<TypesetterInfo
																		type={template.type || 'latex'}
																	/>
																</div>
															</>
														) : (
															<div className='template-preview-loading'>
																<div className='loading-spinner' />
															</div>
														)}
													</div>
												) : (
													<div className='template-preview'>
														<div className='ui-preview-placeholder'>
															<FolderIcon />
														</div>
														<div
															className='ui-badge template-type-info'
															data-variant='label'
														>
															<TypesetterInfo type={template.type || 'latex'} />
														</div>
													</div>
												)}

												<div
													className='ui-stack'
													data-gap='sm'
													data-padding='md'
												>
													<div
														className='ui-toolbar'
														data-justify='between'
														data-gap='sm'
													>
														<h3 className='ui-panel-title' data-size='body'>
															{template.name}
														</h3>
														<span className='ui-badge' data-variant='label'>
															{template.category}
														</span>
														{template.version && (
															<span className='ui-badge' data-variant='label'>
																v{template.version}
															</span>
														)}
													</div>

													<p className='ui-note' data-grow='true'>
														{template.description}
													</p>

													{template.tags.length > 0 && (
														<div className='ui-tags' data-push='end'>
															{template.tags.slice(0, 3).map((tag) => (
																<span
																	key={tag}
																	className='ui-badge'
																	data-variant='tag'
																	data-size='xs'
																>
																	{tag}
																</span>
															))}
															{template.tags.length > 3 && (
																<span className='ui-note'>
																	+{template.tags.length - 3}
																</span>
															)}
														</div>
													)}

													<div
														className='ui-toolbar ui-meta'
														data-justify='between'
														data-divided='true'
													>
														{template.author && (
															<span>
																{t('by')}
																{template.author}
															</span>
														)}
														<span>
															{t('Last Updated: {lastUpdated}', {
																lastUpdated: formatLastModified(
																	template.lastUpdated,
																),
															})}
														</span>
													</div>
												</div>

												<div
													className='template-action ui-actions'
													data-align='center'
												>
													<FolderIcon />
													{t('View Details')}
												</div>
											</div>
										))}
									</div>

									{renderPaginationControls()}
								</>
							)}
						</div>
					)}
				</div>
			</Modal>

			<SettingsModal
				isOpen={showSettings}
				onClose={() => setShowSettings(false)}
				initialCategory={t('Templates')}
				initialSubcategory={t('Template Gallery')}
			/>
		</>
	);
};

export default TemplateImportModal;
