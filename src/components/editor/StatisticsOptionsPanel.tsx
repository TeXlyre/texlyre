import type React from 'react';

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

export default StatisticsOptionsPanel;