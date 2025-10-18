import type React from 'react';
import Modal from '../common/Modal';
import type { DocumentStatistics, StatisticsOptions } from '../../types/statistics';
import { BarChartIcon } from '../common/Icons';


interface StatisticsModalProps {
    isOpen: boolean;
    onClose: () => void;
    statistics: DocumentStatistics | null;
    isLoading: boolean;
    error: string | null;
    options: StatisticsOptions;
    onOptionsChange: (options: StatisticsOptions) => void;
    onRefresh: () => Promise<void>;
}

interface StatisticsOptionsPanelProps {
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
    return (
        <div className="statistics-options-panel">
            <div className="options-group">
                <h4>File Processing</h4>
                <label>
                    <input
                        type="checkbox"
                        checked={includeFiles}
                        onChange={(e) => onIncludeFilesChange(e.target.checked)}
                    />
                    Include referenced files
                </label>
                {includeFiles && (
                    <label>
                        <input
                            type="checkbox"
                            checked={merge}
                            onChange={(e) => onMergeChange(e.target.checked)}
                        />
                        Merge counts (hide individual files)
                    </label>
                )}
            </div>

            <div className="options-group">
                <h4>Display Options</h4>
                <label>
                    <input
                        type="checkbox"
                        checked={brief}
                        onChange={(e) => onBriefChange(e.target.checked)}
                    />
                    Brief output
                </label>
                <label>
                    <input
                        type="checkbox"
                        checked={total}
                        onChange={(e) => onTotalChange(e.target.checked)}
                    />
                    Show total only
                </label>
                <label>
                    <input
                        type="checkbox"
                        checked={sum}
                        onChange={(e) => onSumChange(e.target.checked)}
                    />
                    Sum subcounts
                </label>
            </div>

            <div className="options-group">
                <h4>Detail Level</h4>
                <label>
                    Verbosity:
                    <input
                        type="number"
                        min="0"
                        max="4"
                        value={verbose}
                        onChange={(e) => onVerboseChange(parseInt(e.target.value, 10))}
                    />
                </label>
            </div>
        </div>
    );
};

const StatisticsModal: React.FC<StatisticsModalProps> = ({
    isOpen,
    onClose,
    statistics,
    isLoading,
    error,
    options,
    onOptionsChange,
    onRefresh
}) => {
    const totalWords = statistics
        ? statistics.words + statistics.headers + statistics.captions
        : 0;

    const handleRefresh = async () => {
        await onRefresh();
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Document Statistics"
            size="large"
            icon={BarChartIcon}
        >
            <div className="statistics-modal-content">
                <div>
                    <StatisticsOptionsPanel
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
                        onVerboseChange={(value) => onOptionsChange({ ...options, verbose: value })}
                    />
                    <div className="modal-actions">
                        <button
                            type="button"
                            className="button primary"
                            onClick={handleRefresh}
                            disabled={isLoading}
                        >
                            Recalculate
                        </button>
                        <button
                            type="button"
                            className="button secondary"
                            onClick={onClose}
                        >
                            Close
                        </button>
                    </div>
                </div>
                {isLoading && (
                    <div className="statistics-loading">
                        <div className="loading-spinner" />
                        <p>Calculating statistics...</p>
                    </div>
                )}

                {error && (
                    <div className="statistics-error">
                        <p>{error}</p>
                    </div>
                )}

                {statistics && !isLoading && !error && (
                    <div className="statistics-data">
                        <div className="stat-item stat-total">
                            <span className="stat-label">Total Words</span>
                            <span className="stat-value">{totalWords.toLocaleString()}</span>
                        </div>

                        <div className="stat-item">
                            <span className="stat-label">Words in Text</span>
                            <span className="stat-value">{statistics.words.toLocaleString()}</span>
                        </div>

                        <div className="stat-item">
                            <span className="stat-label">Words in Headers</span>
                            <span className="stat-value">{statistics.headers.toLocaleString()}</span>
                        </div>

                        <div className="stat-item">
                            <span className="stat-label">Words in Captions</span>
                            <span className="stat-value">{statistics.captions.toLocaleString()}</span>
                        </div>

                        <div className="stat-item">
                            <span className="stat-label">Math Inline</span>
                            <span className="stat-value">{statistics.mathInline.toLocaleString()}</span>
                        </div>

                        <div className="stat-item">
                            <span className="stat-label">Math Displayed</span>
                            <span className="stat-value">{statistics.mathDisplay.toLocaleString()}</span>
                        </div>

                        {statistics.numHeaders !== undefined && (
                            <div className="stat-item">
                                <span className="stat-label">Number of Headers</span>
                                <span className="stat-value">{statistics.numHeaders.toLocaleString()}</span>
                            </div>
                        )}

                        {statistics.numFloats !== undefined && (
                            <div className="stat-item">
                                <span className="stat-label">Number of Floats</span>
                                <span className="stat-value">{statistics.numFloats.toLocaleString()}</span>
                            </div>
                        )}

                        {statistics.files !== undefined && statistics.files > 1 && (
                            <div className="stat-item">
                                <span className="stat-label">Files Processed</span>
                                <span className="stat-value">{statistics.files}</span>
                            </div>
                        )}

                        {statistics.fileStats && statistics.fileStats.length > 0 && (
                            <div className="file-statistics">
                                <h4>Individual Files</h4>
                                {statistics.fileStats.map((fileStat, index) => (
                                    <details key={index} className="file-stat-details">
                                        <summary>{fileStat.filename}</summary>
                                        <div className="file-stat-content">
                                            <div className="stat-item">
                                                <span className="stat-label">Words in Text</span>
                                                <span className="stat-value">{fileStat.words.toLocaleString()}</span>
                                            </div>
                                            <div className="stat-item">
                                                <span className="stat-label">Words in Headers</span>
                                                <span className="stat-value">{fileStat.headers.toLocaleString()}</span>
                                            </div>
                                            <div className="stat-item">
                                                <span className="stat-label">Words in Captions</span>
                                                <span className="stat-value">{fileStat.captions.toLocaleString()}</span>
                                            </div>
                                            <div className="stat-item">
                                                <span className="stat-label">Math Inline</span>
                                                <span className="stat-value">{fileStat.mathInline.toLocaleString()}</span>
                                            </div>
                                            <div className="stat-item">
                                                <span className="stat-label">Math Displayed</span>
                                                <span className="stat-value">{fileStat.mathDisplay.toLocaleString()}</span>
                                            </div>
                                        </div>
                                    </details>
                                ))}
                            </div>
                        )}

                        {statistics.rawOutput && (
                            <details className="raw-output">
                                <summary>Raw Output</summary>
                                <pre>{statistics.rawOutput}</pre>
                            </details>
                        )}
                    </div>
                )}


            </div>
        </Modal>
    );
};

export default StatisticsModal;