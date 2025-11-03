// src/components/editor/StatisticsModal.tsx
import { t } from "@/i18n";
import type React from 'react';

import Modal from '../common/Modal';
import type { DocumentStatistics, StatisticsOptions } from '../../types/statistics';
import { WordCountIcon } from '../common/Icons';

interface StatisticsModalProps {
    isOpen: boolean;
    onClose: () => void;
    statistics: DocumentStatistics | null;
    isLoading: boolean;
    error: string | null;
    options: StatisticsOptions;
    onOptionsChange: (options: StatisticsOptions) => void;
    onRefresh: () => Promise<void>;
    contentType: 'latex' | 'typst';
}

interface StatisticsOptionsPanelProps {
    contentType: 'latex' | 'typst';
    includeFiles: boolean;
    merge: boolean;
    brief: boolean;
    total: boolean;
    sum: boolean;
    verbose: number;
    onIncludeFilesChange: (value: boolean) => void;
    onMergeChange: (value: boolean) => void;
    onBriefChange: (value: boolean) => void;
    onTotalChange: (value: boolean) => void;
    onSumChange: (value: boolean) => void;
    onVerboseChange: (value: number) => void;
}

const StatisticsOptionsPanel: React.FC<StatisticsOptionsPanelProps> = ({
    contentType,
    includeFiles,
    merge,
    brief,
    total,
    sum,
    verbose,
    onIncludeFilesChange,
    onMergeChange,
    onBriefChange,
    onTotalChange,
    onSumChange,
    onVerboseChange
}) => {
    if (contentType === 'typst') {
        return (
            <div className="statistics-options-panel">
                <div className="warning-note warning-message">
                    <p>{t('\u26A0\uFE0F Wordometer is experimental and may not count all Typst elements (e.g., CV templates, Touying presentation elements).')}</p>
                </div>
                <div className="options-group">
                    <h4>{t('Detail Level')}</h4>
                    <label>{t('Verbosity:')}

                        <input
                            type="number"
                            min="0"
                            max="4"
                            value={verbose}
                            onChange={(e) => onVerboseChange(parseInt(e.target.value, 10))} />

                    </label>
                </div>
            </div>);

    }

    return (
        <div className="statistics-options-panel">
            <div className="options-group">
                <h4>{t('File Processing')}</h4>
                <label>
                    <input
                        type="checkbox"
                        checked={includeFiles}
                        onChange={(e) => onIncludeFilesChange(e.target.checked)} />{t('Include referenced files')}


                </label>
                {includeFiles &&
                    <label>
                        <input
                            type="checkbox"
                            checked={merge}
                            onChange={(e) => onMergeChange(e.target.checked)} />{t('Merge counts (hide individual files)')}


                    </label>
                }
            </div>

            <div className="options-group">
                <h4>{t('Display Options')}</h4>
                <label>
                    <input
                        type="checkbox"
                        checked={brief}
                        onChange={(e) => onBriefChange(e.target.checked)} />{t('Brief output')}


                </label>
                <label>
                    <input
                        type="checkbox"
                        checked={total}
                        onChange={(e) => onTotalChange(e.target.checked)} />{t('Show total only')}


                </label>
                <label>
                    <input
                        type="checkbox"
                        checked={sum}
                        onChange={(e) => onSumChange(e.target.checked)} />{t('Sum subcounts')}


                </label>
            </div>

            <div className="options-group">
                <h4>{t('Detail Level')}</h4>
                <label>{t('Verbosity:')}

                    <input
                        type="number"
                        min="0"
                        max="4"
                        value={verbose}
                        onChange={(e) => onVerboseChange(parseInt(e.target.value, 10))} />

                </label>
            </div>
        </div>);

};

const StatisticsModal: React.FC<StatisticsModalProps> = ({
    isOpen,
    onClose,
    statistics,
    isLoading,
    error,
    options,
    onOptionsChange,
    onRefresh,
    contentType
}) => {
    const totalWords = statistics ?
        statistics.words + statistics.headers + statistics.captions :
        0;

    const handleRefresh = async () => {
        await onRefresh();
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={t('Word Count Statistics')}
            size="large"
            icon={WordCountIcon}>

            <div className="statistics-modal-content">
                <div>
                    <StatisticsOptionsPanel
                        contentType={contentType}
                        includeFiles={options.includeFiles}
                        merge={options.merge}
                        brief={options.brief}
                        total={options.total}
                        sum={options.sum}
                        verbose={options.verbose}
                        onIncludeFilesChange={(value) => onOptionsChange({ ...options, includeFiles: value })}
                        onMergeChange={(value) => onOptionsChange({ ...options, merge: value })}
                        onBriefChange={(value) => onOptionsChange({ ...options, brief: value })}
                        onTotalChange={(value) => onOptionsChange({ ...options, total: value })}
                        onSumChange={(value) => onOptionsChange({ ...options, sum: value })}
                        onVerboseChange={(value) => onOptionsChange({ ...options, verbose: value })} />

                    <div className="modal-actions">
                        <button
                            type="button"
                            className="button primary"
                            onClick={handleRefresh}
                            disabled={isLoading}>{t('Recalculate')}


                        </button>
                        <button
                            type="button"
                            className="button secondary"
                            onClick={onClose}>{t('Close')}


                        </button>
                    </div>
                </div>
                {isLoading &&
                    <div className="statistics-loading">
                        <div className="loading-spinner" />
                        <p>{t('Calculating statistics...')}</p>
                    </div>
                }

                {error &&
                    <div className="statistics-error">
                        <p>{error}</p>
                    </div>
                }

                {statistics && !isLoading && !error &&
                    <div className="statistics-data">
                        <div className="stat-item stat-total">
                            <span className="stat-label">{t('Total Words')}</span>
                            <span className="stat-value">{totalWords.toLocaleString()}</span>
                        </div>

                        <div className="stat-item">
                            <span className="stat-label">{t('Words in Text')}</span>
                            <span className="stat-value">{statistics.words.toLocaleString()}</span>
                        </div>

                        <div className="stat-item">
                            <span className="stat-label">{t('Words in Headers')}</span>
                            <span className="stat-value">{statistics.headers.toLocaleString()}</span>
                        </div>

                        <div className="stat-item">
                            <span className="stat-label">{t('Words in Captions')}</span>
                            <span className="stat-value">{statistics.captions.toLocaleString()}</span>
                        </div>

                        <div className="stat-item">
                            <span className="stat-label">{t('Math Inline')}</span>
                            <span className="stat-value">{statistics.mathInline.toLocaleString()}</span>
                        </div>

                        <div className="stat-item">
                            <span className="stat-label">{t('Math Displayed')}</span>
                            <span className="stat-value">{statistics.mathDisplay.toLocaleString()}</span>
                        </div>

                        {statistics.numHeaders !== undefined &&
                            <div className="stat-item">
                                <span className="stat-label">{t('Number of Headers')}</span>
                                <span className="stat-value">{statistics.numHeaders.toLocaleString()}</span>
                            </div>
                        }

                        {statistics.numFloats !== undefined &&
                            <div className="stat-item">
                                <span className="stat-label">{t('Number of Floats')}</span>
                                <span className="stat-value">{statistics.numFloats.toLocaleString()}</span>
                            </div>
                        }

                        {statistics.files !== undefined && statistics.files > 1 &&
                            <div className="stat-item">
                                <span className="stat-label">{t('Files Processed')}</span>
                                <span className="stat-value">{statistics.files}</span>
                            </div>
                        }

                        {statistics.fileStats && statistics.fileStats.length > 0 &&
                            <div className="file-statistics">
                                <h4>{t('Individual Files')}</h4>
                                {statistics.fileStats.map((fileStat, index) =>
                                    <details key={index} className="file-stat-details">
                                        <summary>{fileStat.filename}</summary>
                                        <div className="file-stat-content">
                                            <div className="stat-item">
                                                <span className="stat-label">{t('Words in Text')}</span>
                                                <span className="stat-value">{fileStat.words.toLocaleString()}</span>
                                            </div>
                                            <div className="stat-item">
                                                <span className="stat-label">{t('Words in Headers')}</span>
                                                <span className="stat-value">{fileStat.headers.toLocaleString()}</span>
                                            </div>
                                            <div className="stat-item">
                                                <span className="stat-label">{t('Words in Captions')}</span>
                                                <span className="stat-value">{fileStat.captions.toLocaleString()}</span>
                                            </div>
                                            <div className="stat-item">
                                                <span className="stat-label">{t('Math Inline')}</span>
                                                <span className="stat-value">{fileStat.mathInline.toLocaleString()}</span>
                                            </div>
                                            <div className="stat-item">
                                                <span className="stat-label">{t('Math Displayed')}</span>
                                                <span className="stat-value">{fileStat.mathDisplay.toLocaleString()}</span>
                                            </div>
                                        </div>
                                    </details>
                                )}
                            </div>
                        }

                        {statistics.rawOutput &&
                            <details className="raw-output">
                                <summary>{t('Raw Output')}</summary>
                                <pre>{statistics.rawOutput}</pre>
                            </details>
                        }
                    </div>
                }
            </div>
        </Modal>);

};

export default StatisticsModal;