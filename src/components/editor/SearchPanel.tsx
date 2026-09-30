// src/components/editor/SearchPanel.tsx
import type React from 'react';
import { useEffect, useRef, useState } from 'react';

import { t } from '@/i18n';
import { useSearch } from '../../hooks/useSearch';
import { useWheelScroll } from '../../hooks/useWheelScroll';
import { SearchIcon, ReplaceIcon, FileTextIcon } from '../common/Icons';
import { fileOperationNotificationService } from '../../services/FileOperationNotificationService';
import SearchReplaceModal from './SearchReplaceModal';

interface SearchPanelProps {
	className?: string;
	onNavigateToResult: (
		fileId: string,
		line?: number,
		column?: number,
		documentId?: string,
		isLinkedDocument?: boolean,
	) => void;
}

const SearchPanel: React.FC<SearchPanelProps> = ({
	className = '',
	onNavigateToResult,
}) => {
	const {
		query,
		replaceText,
		results,
		isSearching,
		isReplacing,
		caseSensitive,
		wholeWord,
		useRegex,
		showReplace,
		totalMatches,
		setQuery,
		setReplaceText,
		performSearch,
		toggleCaseSensitive,
		toggleWholeWord,
		toggleRegex,
		toggleReplace,
		clearSearch,
		replaceInFile,
		replaceAll,
	} = useSearch();

	const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
	const headerActionsRef = useWheelScroll<HTMLDivElement>();
	const [showReplaceModal, setShowReplaceModal] = useState(false);
	const [pendingReplace, setPendingReplace] = useState<{
		type: 'file' | 'document' | 'all';
		fileId?: string;
		documentId?: string;
		fileName?: string;
		count: number;
	} | null>(null);

	useEffect(() => {
		const handleOpenSearchPanel = (event: Event) => {
			const customEvent = event as CustomEvent;
			const mode = customEvent.detail?.mode;
			const selectedText = customEvent.detail?.selectedText;

			if (selectedText) {
				setQuery(selectedText);
			}

			if (mode === 'replace') {
				if (!showReplace) {
					toggleReplace();
				}
				setTimeout(() => {
					const replaceInput = document.querySelectorAll(
						'.search-input',
					)[1] as HTMLInputElement;
					if (replaceInput) {
						replaceInput.focus();
						replaceInput.select();
					}
				}, 50);
			} else {
				if (showReplace) {
					toggleReplace();
				}
				setTimeout(() => {
					const searchInput = document.querySelector(
						'.search-input',
					) as HTMLInputElement;
					if (searchInput) {
						searchInput.focus();
						searchInput.select();
					}
				}, 50);
			}
		};

		document.addEventListener('open-search-panel', handleOpenSearchPanel);

		return () => {
			document.removeEventListener('open-search-panel', handleOpenSearchPanel);
		};
	}, [showReplace, toggleReplace, setQuery]);

	useEffect(() => {
		if (searchTimeoutRef.current) {
			clearTimeout(searchTimeoutRef.current);
		}

		if (query.trim()) {
			searchTimeoutRef.current = setTimeout(() => {
				performSearch();
			}, 300);
		} else {
			clearSearch();
		}

		return () => {
			if (searchTimeoutRef.current) {
				clearTimeout(searchTimeoutRef.current);
			}
		};
	}, [query, performSearch, clearSearch]);

	const handleResultClick = (
		fileId: string,
		line?: number,
		column?: number,
		documentId?: string,
		isLinkedDocument?: boolean,
	) => {
		onNavigateToResult(fileId, line, column, documentId, isLinkedDocument);

		document.dispatchEvent(
			new CustomEvent('highlight-search-in-editor', {
				detail: { query, caseSensitive },
			}),
		);
	};

	const handleReplaceInFile = async (
		fileId: string,
		event: React.MouseEvent,
		documentId?: string,
	) => {
		event.stopPropagation();

		const result = results.find((r) => r.fileId === fileId);
		if (!result) return;

		setPendingReplace({
			type: documentId ? 'document' : 'file',
			fileId,
			documentId,
			fileName: result.fileName,
			count: result.matchCount || 0,
		});
		setShowReplaceModal(true);
	};

	const handleReplaceAll = async () => {
		setPendingReplace({
			type: 'all',
			count: results.length,
		});
		setShowReplaceModal(true);
	};

	const handleConfirmReplace = async () => {
		if (!pendingReplace) return;

		const operationId = `replace-${Date.now()}`;
		setShowReplaceModal(false);

		try {
			if (pendingReplace.type === 'all') {
				fileOperationNotificationService.showLoading(
					operationId,
					t('Replacing in {count} file...', { count: pendingReplace.count }),
				);

				const count = await replaceAll();

				fileOperationNotificationService.showSuccess(
					operationId,
					t('Successfully replaced in {count} file', { count }),
				);
			} else {
				fileOperationNotificationService.showLoading(
					operationId,
					t('Replacing in {fileName}...', {
						fileName: pendingReplace.fileName,
					}),
				);

				const success = await replaceInFile(
					pendingReplace.fileId!,
					pendingReplace.documentId,
				);

				if (success) {
					fileOperationNotificationService.showSuccess(
						operationId,
						t('Successfully replaced in {fileName}', {
							fileName: pendingReplace.fileName,
						}),
					);
				} else {
					fileOperationNotificationService.showError(
						operationId,
						t('No matches found in {fileName}', {
							fileName: pendingReplace.fileName,
						}),
					);
				}
			}
		} catch (error) {
			fileOperationNotificationService.showError(
				operationId,
				t('Failed to replace: {message}', {
					message: error instanceof Error ? error.message : String(error),
				}),
			);
		} finally {
			setPendingReplace(null);
		}
	};

	const highlightMatch = (
		text: string,
		matchStart: number,
		matchEnd: number,
	) => {
		if (!text) return null;

		return (
			<>
				{text.substring(0, matchStart)}
				<mark className='search-highlight'>
					{text.substring(matchStart, matchEnd)}
				</mark>
				{text.substring(matchEnd)}
			</>
		);
	};

	return (
		<div className={`ui-panel ${className}`} data-height='full'>
			<div className='ui-panel-header' data-role='explorer' data-position='top'>
				<h3 className='ui-panel-title' data-size='body' data-shrink='true'>
					{t('Search')}
				</h3>
				<div
					className='ui-toolbar-actions scroll-x'
					data-gap='sm'
					data-active-style='filled'
					ref={headerActionsRef}
				>
					<button
						type='button'
						className={`ui-icon-button ${!showReplace ? 'active' : ''}`}
						data-variant='subtle'
						onClick={() => showReplace && toggleReplace()}
						title={t('Search only (Ctrl+Shift+F)')}
					>
						<SearchIcon />
					</button>
					<button
						type='button'
						className={`ui-icon-button ${showReplace ? 'active' : ''}`}
						data-variant='subtle'
						onClick={toggleReplace}
						title={t('Search and Replace (Ctrl+Shift+H)')}
					>
						<ReplaceIcon />
					</button>
				</div>
			</div>

			<div
				className='search-options ui-panel-controls ui-toolbar-actions'
				data-gap='xs'
				data-active-style='filled'
			>
				<button
					type='button'
					className={`ui-icon-button ${caseSensitive ? 'active' : ''}`}
					data-variant='subtle'
					data-size='sm'
					aria-pressed={caseSensitive}
					onClick={toggleCaseSensitive}
					title={t('Match case')}
				>
					{t('Aa')}
				</button>
				<button
					type='button'
					className={`ui-icon-button ${wholeWord ? 'active' : ''}`}
					data-variant='subtle'
					data-size='sm'
					aria-pressed={wholeWord}
					onClick={toggleWholeWord}
					title={t('Match whole word')}
				>
					{t('|w|')}
				</button>
				<button
					type='button'
					className={`ui-icon-button ${useRegex ? 'active' : ''}`}
					data-variant='subtle'
					data-size='sm'
					aria-pressed={useRegex}
					onClick={toggleRegex}
					title={t('Use regular expression')}
				>
					{t('.*')}
				</button>
			</div>

			<div className='search-input-container ui-panel-controls'>
				<div className='ui-search-field'>
					<input
						type='text'
						placeholder={t('Search in files...')}
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						className='search-input ui-field-control ui-search-control'
					/>

					{query && (
						<button
							type='button'
							aria-label={t('Clear search')}
							className='clear-search-button ui-search-clear'
							onClick={clearSearch}
							title={t('Clear search')}
						>
							<span aria-hidden='true'>×</span>
						</button>
					)}
				</div>
			</div>

			{showReplace && (
				<div className='search-input-container ui-panel-controls'>
					<input
						type='text'
						placeholder={t('Replace with...')}
						value={replaceText}
						onChange={(e) => setReplaceText(e.target.value)}
						className='search-input ui-field-control'
					/>

					<button
						type='button'
						className='button icon-button primary '
						onClick={handleReplaceAll}
						disabled={
							!query.trim() ||
							!replaceText ||
							results.length === 0 ||
							isReplacing
						}
						title={t('Replace all')}
					>
						<ReplaceIcon />
					</button>
				</div>
			)}

			<div
				className='ui-panel-content'
				data-role='search-results'
				data-overflow='y'
				data-padding='sm'
			>
				{(isSearching || isReplacing) && (
					<div className='ui-empty-state'>
						{isSearching ? t('Searching...') : t('Replacing...')}
					</div>
				)}

				{!isSearching &&
					!isReplacing &&
					results.length === 0 &&
					query.trim() && (
						<div className='ui-empty-state'>{t('No results found')}</div>
					)}

				{!isSearching && !isReplacing && query.trim() === '' && (
					<div className='ui-empty-state'>
						{t('Enter a search query to find files')}
					</div>
				)}

				{!isSearching && !isReplacing && results.length > 0 && (
					<>
						<div className='ui-meta'>
							{t('{totalMatches} match in {count} file', {
								totalMatches,
								count: results.length,
							})}
						</div>
						<div className='ui-note'>
							{t(
								'Click once to open file or document, twice to navigate to match',
							)}
						</div>
						{results.map((result, resultIdx) => (
							<div
								key={`${result.fileId}-${result.matchType}-${resultIdx}`}
								className='ui-stack'
								data-gap='xs'
							>
								<div
									className='ui-list-item'
									data-surface='secondary'
									data-align='center'
									data-gap='sm'
									data-padding='xs'
								>
									<FileTextIcon />
									<span className='ui-control-label'>
										{result.fileName || t('Untitled')}
									</span>
									<span className='ui-meta' style={{ marginLeft: 'auto' }}>
										{result.filePath || ''}
									</span>
									{showReplace && result.matchType === 'content' && (
										<button
											type='button'
											className='button primary '
											onClick={(e) =>
												handleReplaceInFile(
													result.fileId,
													e,
													result.isLinkedDocument
														? result.documentId
														: undefined,
												)
											}
											disabled={!replaceText || isReplacing}
											title={
												result.isLinkedDocument
													? t('Replace in this document')
													: t('Replace in this file')
											}
										>
											{t('Replace')}
										</button>
									)}
								</div>

								{result.matchType === 'filename' &&
								result.matches.length > 0 ? (
									<div
										className='ui-list-item'
										data-border='none'
										data-interactive='true'
										data-align='center'
										data-gap='sm'
										data-padding='xs'
										onClick={() =>
											handleResultClick(
												result.fileId,
												undefined,
												undefined,
												result.documentId,
												result.isLinkedDocument,
											)
										}
									>
										<span className='ui-control-label'>
											{highlightMatch(
												result.matches[0].text || result.fileName,
												result.matches[0].matchStart,
												result.matches[0].matchEnd,
											)}
										</span>
									</div>
								) : result.matchType === 'content' &&
									result.matches.length > 0 ? (
									<div className='ui-list' data-gap='xs'>
										{result.matches.slice(0, 50).map((match, idx) => (
											<div
												key={`${result.fileId}-${match.line}-${idx}`}
												className='ui-list-item'
												data-border='none'
												data-interactive='true'
												data-align='center'
												data-gap='sm'
												data-padding='xs'
												onClick={() =>
													handleResultClick(
														result.fileId,
														match.line,
														match.column,
														result.documentId,
														result.isLinkedDocument,
													)
												}
											>
												<span
													className='ui-meta'
													style={{ minWidth: '3em', textAlign: 'right' }}
												>
													{match.line}
												</span>
												<span className='ui-control-label'>
													{highlightMatch(
														match.text || '',
														match.matchStart,
														match.matchEnd,
													)}
												</span>
											</div>
										))}
										{result.matches.length > 50 && (
											<div className='ui-note'>
												{t('+{count} more matches', {
													count: result.matches.length - 50,
												})}
											</div>
										)}
									</div>
								) : null}
							</div>
						))}
					</>
				)}
			</div>

			{showReplaceModal && pendingReplace && (
				<SearchReplaceModal
					isOpen={showReplaceModal}
					onClose={() => {
						setShowReplaceModal(false);
						setPendingReplace(null);
					}}
					onConfirm={handleConfirmReplace}
					replaceCount={pendingReplace.count}
					replaceType={pendingReplace.type}
					fileName={pendingReplace.fileName}
				/>
			)}
		</div>
	);
};

export default SearchPanel;
