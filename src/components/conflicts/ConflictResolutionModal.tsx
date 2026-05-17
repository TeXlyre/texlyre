// src/components/conflicts/ConflictResolutionModal.tsx
// src/components/conflicts/ConflictResolutionModal.tsx
import { t } from '@/i18n';
import { useEffect, useRef, useState } from 'react';

import Modal from '../../components/common/Modal';
import ResizablePanel from '../common/ResizablePanel';
import {
    conflictResolutionService,
    type ConflictResolution,
    type ConflictResolutionRequest,
    type FileConflict
} from '../../services/ConflictResolutionService';
import MergeEditor, { type MergeEditorHandle } from './MergeEditor';

const toText = (content: string | ArrayBuffer): string =>
    typeof content === 'string' ? content : new TextDecoder().decode(content);

type ResolutionState = {
    resolution: ConflictResolution | null;
    initialMerged?: string;
};

const DEFAULT_SIDEBAR_WIDTH = 240;
const MIN_SIDEBAR_WIDTH = 160;
const MAX_SIDEBAR_WIDTH = 400;

const ConflictResolutionModal: React.FC = () => {
    const [request, setRequest] = useState<ConflictResolutionRequest | null>(null);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [states, setStates] = useState<Map<number, ResolutionState>>(new Map());
    const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);
    const [showComplete, setShowComplete] = useState(false);
    const [resetKeys, setResetKeys] = useState<Map<number, number>>(new Map());
    const confirmedRef = useRef(false);
    const mergeEditorRef = useRef<MergeEditorHandle>(null);

    useEffect(() => {
        return conflictResolutionService.addListener((req) => {
            setRequest(req);
            setSelectedIndex(0);
            setStates(new Map());
            setShowComplete(false);
            setResetKeys(new Map());
            confirmedRef.current = false;
        });
    }, []);

    if (!request) return null;

    const current: FileConflict = request.conflicts[selectedIndex];

    const getState = (index: number): ResolutionState =>
        states.get(index) ?? { resolution: null };

    const updateState = (index: number, patch: Partial<ResolutionState>) => {
        setStates(prev => {
            const next = new Map(prev);
            next.set(index, { ...getState(index), ...patch });
            return next;
        });
    };

    const currentState = getState(selectedIndex);
    const resolvedCount = request.conflicts.filter((_, i) => getState(i).resolution !== null).length;
    const allResolved = resolvedCount === request.conflicts.length;

    const navigateTo = (index: number) => {
        setSelectedIndex(index);
        setShowComplete(false);
    };

    const handleCancel = () => {
        if (confirmedRef.current) return;
        request.resolve(null);
        setRequest(null);
    };

    const handleConfirm = () => {
        if (confirmedRef.current) return;
        confirmedRef.current = true;

        const resolutions = new Map<string, ConflictResolution>();
        request.conflicts.forEach((conflict, i) => {
            const state = getState(i);
            if (state.resolution) resolutions.set(conflict.path, state.resolution);
        });
        request.resolve(resolutions);
        setRequest(null);
    };

    const handleResolutionAction = (resolution: ConflictResolution) => {
        const initialMerged =
            resolution.action === 'keep-local' ? toText(current.localContent) :
                resolution.action === 'keep-remote' ? toText(current.remoteContent) :
                    undefined;

        updateState(selectedIndex, { resolution, initialMerged });

        setResetKeys(prev => {
            const next = new Map(prev);
            next.set(selectedIndex, (prev.get(selectedIndex) ?? 0) + 1);
            return next;
        });

        const nextUnresolved = request.conflicts.findIndex(
            (_, i) => i !== selectedIndex && getState(i).resolution === null
        );

        if (resolvedCount + 1 === request.conflicts.length) {
            setShowComplete(true);
        } else if (nextUnresolved !== -1) {
            setSelectedIndex(nextUnresolved);
        }
    };

    const handleUseMerged = () => {
        const merged = mergeEditorRef.current?.getMergedContent() ?? '';
        handleResolutionAction({ action: 'merged', content: merged });
    };

    const handleReset = () => {
        updateState(selectedIndex, { resolution: null, initialMerged: undefined });
        setResetKeys(prev => {
            const next = new Map(prev);
            next.set(selectedIndex, (prev.get(selectedIndex) ?? 0) + 1);
            return next;
        });
    };

    return (
        <Modal
            isOpen
            onClose={handleCancel}
            title={t('Resolve Conflicts ({resolved}/{total} resolved)', {
                resolved: resolvedCount,
                total: request.conflicts.length,
            })}
            size="wide"
            closeOnClickOutside={false}
        >
            <div className="conflict-resolution">
                <ResizablePanel
                    direction="horizontal"
                    width={sidebarWidth}
                    minWidth={MIN_SIDEBAR_WIDTH}
                    maxWidth={MAX_SIDEBAR_WIDTH}
                    onResize={setSidebarWidth}
                    collapsible={false}
                    className="conflict-sidebar-panel"
                >
                    <div className="conflict-sidebar">
                        <div className="conflict-sidebar-header">
                            <h3>{t('Files')}</h3>
                            <span className="conflict-sidebar-count">
                                {resolvedCount}/{request.conflicts.length}
                            </span>
                        </div>
                        <div className="conflict-sidebar-list">
                            {request.conflicts.map((conflict, i) => {
                                const state = getState(i);
                                const isResolved = state.resolution !== null;
                                const isActive = !showComplete && i === selectedIndex;
                                return (
                                    <div
                                        key={conflict.path}
                                        className={`conflict-file-node ${isResolved ? 'resolved' : 'unresolved'} ${isActive ? 'selected' : ''}`}
                                        onClick={() => navigateTo(i)}
                                    >
                                        <span className="conflict-file-status">
                                            {isResolved ? '✓' : '○'}
                                        </span>
                                        <span className="conflict-file-name">
                                            {conflict.path.split('/').pop()}
                                            {conflict.isBinary && (
                                                <span className="conflict-file-badge">{t('bin')}</span>
                                            )}
                                        </span>
                                        <span className="conflict-file-dir">
                                            {conflict.path.includes('/')
                                                ? conflict.path.substring(0, conflict.path.lastIndexOf('/'))
                                                : '/'}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </ResizablePanel>

                <div className="conflict-main">
                    {showComplete ? (
                        <div className="conflict-complete">
                            <div className="conflict-complete-icon">✓</div>
                            <h3>{t('All conflicts resolved')}</h3>
                            <p>{t('Review your resolutions below, or click any file in the panel to revise.')}</p>
                            <div className="conflict-complete-summary">
                                {request.conflicts.map((conflict, i) => {
                                    const state = getState(i);
                                    const action = state.resolution?.action ?? 'unresolved';
                                    return (
                                        <div
                                            key={conflict.path}
                                            className="conflict-summary-item"
                                            onClick={() => navigateTo(i)}
                                        >
                                            <span className="conflict-summary-path">{conflict.path}</span>
                                            <span className={`conflict-summary-action action-${action}`}>
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
                            <div className="conflict-path">{current.path}</div>
                            {current.isBinary ? (
                                <div className="conflict-binary-notice">
                                    {t('Binary file. Choose which version to keep.')}
                                </div>
                            ) : (
                                <MergeEditor
                                    ref={mergeEditorRef}
                                    key={`${selectedIndex}-${resetKeys.get(selectedIndex) ?? 0}`}
                                    local={toText(current.localContent)}
                                    remote={toText(current.remoteContent)}
                                    initialMerged={
                                        currentState.initialMerged ??
                                        (currentState.resolution?.action === 'merged'
                                            ? toText(currentState.resolution.content)
                                            : undefined)
                                    }
                                />
                            )}
                        </>
                    )}

                    <div className="conflict-actions">
                        <div className="conflict-actions-nav">
                            <button
                                className="button secondary"
                                onClick={() => navigateTo(selectedIndex - 1)}
                                disabled={showComplete || selectedIndex === 0}
                            >
                                {t('← Prev')}
                            </button>
                            <button
                                className="button secondary"
                                onClick={() => navigateTo(selectedIndex + 1)}
                                disabled={showComplete || selectedIndex === request.conflicts.length - 1}
                            >
                                {t('Next →')}
                            </button>
                            {!showComplete && (
                                <>
                                    <button
                                        className={`button secondary${currentState.resolution?.action === 'keep-local' ? ' active-resolution' : ''}`}
                                        onClick={() => handleResolutionAction({ action: 'keep-local' })}
                                    >
                                        {t('Keep Local')}
                                    </button>
                                    <button
                                        className={`button secondary${currentState.resolution?.action === 'keep-remote' ? ' active-resolution' : ''}`}
                                        onClick={() => handleResolutionAction({ action: 'keep-remote' })}
                                    >
                                        {t('Keep Remote')}
                                    </button>
                                    {!current.isBinary && (
                                        <>
                                            <button
                                                className={`button primary${currentState.resolution?.action === 'merged' ? ' active-resolution' : ''}`}
                                                onClick={handleUseMerged}
                                            >
                                                {t('Use Merged')}
                                            </button>
                                            <button
                                                className="button secondary"
                                                onClick={handleReset}
                                            >
                                                {t('Reset')}
                                            </button>
                                        </>
                                    )}
                                </>
                            )}
                        </div>

                        <div className="conflict-actions-right">

                            <button className="button secondary" onClick={handleCancel}>
                                {t('Cancel Push')}
                            </button>
                            <button
                                className="button primary"
                                onClick={handleConfirm}
                                disabled={!allResolved}
                            >
                                {t('Confirm Push')}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </Modal>
    );
};

export default ConflictResolutionModal;
