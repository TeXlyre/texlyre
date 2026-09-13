// src/components/conflicts/MergeResolutionModal.tsx
import { useEffect, useRef, useState } from 'react';

import { t } from '@/i18n';
import Modal from '../../components/common/Modal';
import ResizablePanel from '../common/ResizablePanel';
import {
	mergeResolutionService,
	type ConflictResolution,
	type ConflictResolutionRequest,
	type FileConflict,
} from '../../services/MergeResolutionService';
import { stripAnnotationTagsWithSpans } from '../../utils/annotationTagUtils';
import { SaveIcon } from '../common/Icons';
import MergeEditor, {
	type MergeEditorHandle,
	type MergeEmptySideNote,
} from './MergeEditor';

const toText = (content: string | ArrayBuffer): string =>
	typeof content === 'string' ? content : new TextDecoder().decode(content);

const compareStatus = (conflict: FileConflict): string => {
	if (conflict.changeType === 'added') return 'A';
	if (conflict.changeType === 'deleted') return 'D';
	return 'M';
};

type ResolutionState = {
	resolution: ConflictResolution | null;
	initialMerged?: string;
};

const DEFAULT_SIDEBAR_WIDTH = 240;
const MIN_SIDEBAR_WIDTH = 160;
const MAX_SIDEBAR_WIDTH = 400;

const MergeResolutionModal: React.FC = () => {
	const [request, setRequest] = useState<ConflictResolutionRequest | null>(
		null,
	);
	const [selectedIndex, setSelectedIndex] = useState(0);
	const [states, setStates] = useState<Map<number, ResolutionState>>(new Map());
	const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);
	const [showComplete, setShowComplete] = useState(false);
	const [resetKeys, setResetKeys] = useState<Map<number, number>>(new Map());
	const confirmedRef = useRef(false);
	const mergeEditorRef = useRef<MergeEditorHandle>(null);
	const [dirtyIndices, setDirtyIndices] = useState<Set<number>>(new Set());
	const [isSaving, setIsSaving] = useState(false);
	const [saveError, setSaveError] = useState<string | null>(null);
	const [annotationStatus, setAnnotationStatus] = useState<{
		surviving: number;
		total: number;
	} | null>(null);

	useEffect(() => {
		return mergeResolutionService.addListener((req) => {
			setRequest(req);
			setSelectedIndex(0);
			setStates(new Map());
			setShowComplete(false);
			setResetKeys(new Map());
			setAnnotationStatus(null);
			setDirtyIndices(new Set());
			setIsSaving(false);
			setSaveError(null);
			confirmedRef.current = false;
		});
	}, []);

	if (!request) return null;

	const isCompare = request.mode === 'compare';
	const isEdit = request.mode === 'edit';
	const isInspect = isCompare || isEdit;
	const current: FileConflict = request.conflicts[selectedIndex];
	const localView = toText(current.localViewContent ?? current.localContent);
	const remoteView = toText(current.remoteViewContent ?? current.remoteContent);
	const localAnnotations =
		typeof current.localContent === 'string'
			? stripAnnotationTagsWithSpans(current.localContent)
			: null;
	const remoteAnnotations =
		typeof current.remoteContent === 'string'
			? stripAnnotationTagsWithSpans(current.remoteContent)
			: null;
	const emptySide: 'a' | 'b' | null =
		isInspect &&
		(current.changeType === 'added' || current.changeType === 'deleted')
			? isEdit
				? current.changeType === 'added'
					? 'b'
					: 'a'
				: current.changeType === 'added'
					? 'a'
					: 'b'
			: null;
	const emptySideNote: MergeEmptySideNote | undefined = emptySide
		? {
				side: emptySide,
				text: `${t('Empty')} — ${
					emptySide === 'a'
						? (request.labels?.local ?? t('Current'))
						: (request.labels?.remote ?? t('Other'))
				}`,
			}
		: undefined;

	const getState = (index: number): ResolutionState =>
		states.get(index) ?? { resolution: null };

	const updateState = (index: number, patch: Partial<ResolutionState>) => {
		setStates((prev) => {
			const next = new Map(prev);
			next.set(index, { ...getState(index), ...patch });
			return next;
		});
	};

	const currentState = getState(selectedIndex);
	const mergedStateAnnotations =
		currentState.resolution?.action === 'merged'
			? stripAnnotationTagsWithSpans(toText(currentState.resolution.content))
			: null;
	const localReviewDeletions =
		mergedStateAnnotations?.reviewDeletions ??
		(currentState.resolution?.action === 'keep-remote'
			? remoteAnnotations?.reviewDeletions
			: localAnnotations?.reviewDeletions);
	const resolvedCount = request.conflicts.filter(
		(_, i) => getState(i).resolution !== null,
	).length;
	const allResolved = resolvedCount === request.conflicts.length;

	const navigateTo = (index: number) => {
		if (!current.isBinary && currentState.resolution?.action === 'merged') {
			const merged = mergeEditorRef.current?.getMergedContent();
			if (merged !== undefined) {
				updateState(selectedIndex, {
					resolution: { action: 'merged', content: merged },
				});
			}
		}
		setSelectedIndex(index);
		setShowComplete(false);
		setAnnotationStatus(null);
		setSaveError(null);
	};

	const handleCancel = () => {
		if (confirmedRef.current) return;
		request.resolve(null);
		setRequest(null);
	};

	const handleConfirm = () => {
		if (confirmedRef.current) return;
		confirmedRef.current = true;

		const activeMerged =
			!current.isBinary && currentState.resolution?.action === 'merged'
				? mergeEditorRef.current?.getMergedContent()
				: undefined;
		const resolutions = new Map<string, ConflictResolution>();
		request.conflicts.forEach((conflict, i) => {
			const state = getState(i);
			const resolution =
				i === selectedIndex && activeMerged !== undefined
					? { action: 'merged' as const, content: activeMerged }
					: state.resolution;
			if (resolution) resolutions.set(conflict.path, resolution);
		});
		request.resolve(resolutions);
		setRequest(null);
	};

	const handleResolutionAction = (resolution: ConflictResolution) => {
		const initialMerged =
			resolution.action === 'keep-local'
				? localView
				: resolution.action === 'keep-remote'
					? remoteView
					: undefined;

		updateState(selectedIndex, { resolution, initialMerged });

		setResetKeys((prev) => {
			const next = new Map(prev);
			next.set(selectedIndex, (prev.get(selectedIndex) ?? 0) + 1);
			return next;
		});

		const nextUnresolved = request.conflicts.findIndex(
			(_, i) => i !== selectedIndex && getState(i).resolution === null,
		);

		if (resolvedCount + 1 === request.conflicts.length) {
			setShowComplete(true);
		} else if (nextUnresolved !== -1) {
			setSelectedIndex(nextUnresolved);
			setAnnotationStatus(null);
		}
	};

	const handleUseMerged = () => {
		const merged = mergeEditorRef.current?.getMergedContent() ?? '';
		handleResolutionAction({ action: 'merged', content: merged });
	};

	const handleMergedChange = (merged: string) => {
		setStates((prev) => {
			const next = new Map(prev);
			const existing = next.get(selectedIndex) ?? { resolution: null };
			next.set(selectedIndex, {
				...existing,
				resolution: { action: 'merged', content: merged },
			});
			return next;
		});
		if (isEdit) {
			setDirtyIndices((prev) => new Set(prev).add(selectedIndex));
			setSaveError(null);
		}
	};

	const handleReset = () => {
		updateState(selectedIndex, { resolution: null, initialMerged: undefined });
		setResetKeys((prev) => {
			const next = new Map(prev);
			next.set(selectedIndex, (prev.get(selectedIndex) ?? 0) + 1);
			return next;
		});
	};

	const handleSaveCurrent = async (content?: string) => {
		if (!isEdit || current.isBinary || !request.save || isSaving) return;
		const merged =
			content ?? mergeEditorRef.current?.getMergedContent() ?? localView;
		setIsSaving(true);
		setSaveError(null);
		try {
			await request.save(current.path, merged);
			updateState(selectedIndex, {
				resolution: { action: 'merged', content: merged },
				initialMerged: merged,
			});
			setDirtyIndices((prev) => {
				const next = new Set(prev);
				next.delete(selectedIndex);
				return next;
			});
		} catch (error) {
			setSaveError(
				error instanceof Error ? error.message : t('Failed to save file'),
			);
		} finally {
			setIsSaving(false);
		}
	};

	const title = isInspect
		? (request.title ??
			(isEdit ? t('Edit Working Tree') : t('Compare Versions')))
		: t('Resolve Conflicts ({resolved}/{total} resolved)', {
				resolved: resolvedCount,
				total: request.conflicts.length,
			});

	return (
		<Modal
			isOpen
			onClose={handleCancel}
			title={title}
			size='wide'
			closeOnClickOutside={isCompare}
		>
			<div
				className={`conflict-resolution${isInspect ? ' compare-mode' : ''}${isEdit ? ' edit-mode' : ''}`}
			>
				<ResizablePanel
					direction='horizontal'
					width={sidebarWidth}
					minWidth={MIN_SIDEBAR_WIDTH}
					maxWidth={MAX_SIDEBAR_WIDTH}
					onResize={setSidebarWidth}
					collapsible={false}
					className='conflict-sidebar-panel'
				>
					<div className='ui-panel' data-height='full'>
						<div className='ui-panel-header' data-shrink='true'>
							<h3 className='ui-panel-title' data-size='body'>
								{t('Files')}
							</h3>
							<span className='ui-meta'>
								{isInspect
									? request.conflicts.length
									: `${resolvedCount}/${request.conflicts.length}`}
							</span>
						</div>
						<div className='ui-list ui-panel-content' data-overflow='y'>
							{request.conflicts.map((conflict, i) => {
								const state = getState(i);
								const isResolved = state.resolution !== null;
								const isActive = !showComplete && i === selectedIndex;
								return (
									<div
										key={conflict.path}
										className='ui-list-item'
										data-align='center'
										data-gap='xs'
										data-padding='xs'
										data-interactive='true'
										data-selected={isActive ? 'true' : undefined}
										onClick={() => navigateTo(i)}
									>
										<div
											className='ui-list-content'
											data-grow='true'
											data-gap='xs'
										>
											<span className='conflict-file-name'>
												{conflict.path.split('/').pop()}
												{conflict.isBinary && (
													<span className='ui-badge' data-variant='label'>
														{t('bin')}
													</span>
												)}
											</span>
											<span className='conflict-file-dir ui-meta'>
												{conflict.path.includes('/')
													? conflict.path.substring(
															0,
															conflict.path.lastIndexOf('/'),
														)
													: '/'}
											</span>
										</div>
										<span
											className='ui-status'
											data-tone={isResolved ? 'success' : 'muted'}
										>
											{isInspect
												? compareStatus(conflict)
												: isResolved
													? '✓'
													: '○'}
										</span>
									</div>
								);
							})}
						</div>
					</div>
				</ResizablePanel>

				<div className='conflict-main'>
					{showComplete && !isInspect ? (
						<div className='conflict-complete ui-empty-state'>
							<div className='conflict-complete-icon'>✓</div>
							<h3 className='ui-panel-title'>{t('All conflicts resolved')}</h3>
							<p className='ui-note'>
								{t(
									'Review your resolutions below, or click any file in the panel to revise.',
								)}
							</p>
							<div className='conflict-complete-summary ui-list'>
								{request.conflicts.map((conflict, i) => {
									const state = getState(i);
									const action = state.resolution?.action ?? 'unresolved';
									return (
										<div
											key={conflict.path}
											className='ui-list-item'
											data-align='center'
											data-justify='between'
											data-gap='md'
											data-padding='xs'
											data-appearance='flat'
											data-interactive='true'
											onClick={() => navigateTo(i)}
										>
											<span className='conflict-summary-path'>
												{conflict.path}
											</span>
											<span
												className='ui-badge'
												data-variant='label'
												data-tone={
													action === 'merged'
														? 'success'
														: action === 'unresolved'
															? 'warning'
															: 'accent'
												}
											>
												{action === 'keep-local' && t('Local')}
												{action === 'keep-remote' && t('Remote')}
												{action === 'merged' && t('Merged')}
											</span>
										</div>
									);
								})}
							</div>
						</div>
					) : (
						<>
							<div className='conflict-path'>
								<span>{current.path}</span>
								{isInspect && (
									<span className='comparison-side-labels'>
										<code>{request.labels?.remote ?? t('Other')}</code>
										<span aria-hidden='true'>↔</span>
										<code>{request.labels?.local ?? t('Current')}</code>
									</span>
								)}
								{isEdit && !current.isBinary && (
									<button
										type='button'
										className='button conflict-save-button'
										title={t('Save File (Ctrl+S)')}
										aria-label={t('Save File')}
										onClick={() => void handleSaveCurrent()}
										disabled={!dirtyIndices.has(selectedIndex) || isSaving}
									>
										<SaveIcon />
									</button>
								)}
							</div>
							{current.isBinary ? (
								<div
									className='ui-message'
									data-tone='info'
									data-align='center'
								>
									{isInspect
										? t('Binary file differs between these versions.')
										: t('Binary file. Choose which version to keep.')}
								</div>
							) : (
								<MergeEditor
									ref={mergeEditorRef}
									fileName={current.path}
									key={`${selectedIndex}-${resetKeys.get(selectedIndex) ?? 0}-${isCompare ? 'compare' : isEdit ? 'edit' : 'resolve'}`}
									local={localView}
									remote={remoteView}
									initialMerged={
										isCompare
											? undefined
											: (currentState.initialMerged ??
												mergedStateAnnotations?.content)
									}
									localAnnotationSpans={current.localAnnotationSpans}
									annotationSpans={current.annotationSpans}
									localReviewDeletions={localReviewDeletions}
									reviewDeletions={remoteAnnotations?.reviewDeletions}
									emptySideNote={emptySideNote}
									onMergedChange={isCompare ? undefined : handleMergedChange}
									onAnnotationsChange={
										isInspect
											? undefined
											: (surviving, total) =>
													setAnnotationStatus({ surviving, total })
									}
									onSave={
										isEdit
											? (content) => void handleSaveCurrent(content)
											: undefined
									}
									readOnly={isCompare}
								/>
							)}
						</>
					)}

					{!isInspect && annotationStatus && annotationStatus.total > 0 ? (
						<div
							className='ui-message'
							data-tone={
								annotationStatus.surviving < annotationStatus.total
									? 'warning'
									: 'info'
							}
							data-density='compact'
						>
							{t('{kept} of {total} comments will be kept', {
								kept: annotationStatus.surviving,
								total: annotationStatus.total,
							})}
						</div>
					) : null}

					{saveError && (
						<div
							className='ui-message'
							data-tone='error'
							data-density='compact'
						>
							{saveError}
						</div>
					)}

					<div className='ui-actions' data-justify='between' data-wrap='true'>
						<div className='ui-actions' data-wrap='true'>
							<button
								type='button'
								className='button secondary'
								onClick={() => navigateTo(selectedIndex - 1)}
								disabled={showComplete || selectedIndex === 0}
							>
								{t('← Prev')}
							</button>
							<button
								type='button'
								className='button secondary'
								onClick={() => navigateTo(selectedIndex + 1)}
								disabled={
									showComplete || selectedIndex === request.conflicts.length - 1
								}
							>
								{t('Next →')}
							</button>

							{!isInspect && !showComplete && (
								<>
									<button
										type='button'
										className='button secondary'
										aria-pressed={
											currentState.resolution?.action === 'keep-local'
										}
										onClick={() =>
											handleResolutionAction({ action: 'keep-local' })
										}
									>
										{request.labels?.keepLocal ?? t('Keep Local')}
									</button>
									<button
										type='button'
										className='button secondary'
										aria-pressed={
											currentState.resolution?.action === 'keep-remote'
										}
										onClick={() =>
											handleResolutionAction({ action: 'keep-remote' })
										}
									>
										{request.labels?.keepRemote ?? t('Keep Remote')}
									</button>
									{!current.isBinary && (
										<>
											<button
												type='button'
												className='button primary'
												aria-pressed={
													currentState.resolution?.action === 'merged'
												}
												onClick={handleUseMerged}
											>
												{t('Use Merged')}
											</button>
											<button
												type='button'
												className='button secondary'
												onClick={handleReset}
											>
												{t('Reset')}
											</button>
										</>
									)}
								</>
							)}
						</div>

						<div className='ui-actions' data-wrap='true'>
							{isInspect ? (
								<button
									type='button'
									className='button secondary'
									onClick={handleCancel}
								>
									{t('Close')}
								</button>
							) : (
								<>
									<button
										type='button'
										className='button secondary'
										onClick={handleCancel}
									>
										{t('Cancel Push')}
									</button>
									<button
										type='button'
										className='button primary'
										onClick={handleConfirm}
										disabled={!allResolved}
									>
										{t('Confirm Push')}
									</button>
								</>
							)}
						</div>
					</div>
				</div>
			</div>
		</Modal>
	);
};

export default MergeResolutionModal;
