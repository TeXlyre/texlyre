import type React from 'react';
import { useEffect, useState } from 'react';
import Modal from '../common/Modal';
import type { DocumentStatistics } from '../../types/statistics';
import { BarChartIcon } from '../common/Icons';

interface StatisticsModalProps {
    isOpen: boolean;
    onClose: () => void;
    statistics: DocumentStatistics | null;
    isLoading: boolean;
    error: string | null;
}

const StatisticsModal: React.FC<StatisticsModalProps> = ({
    isOpen,
    onClose,
    statistics,
    isLoading,
    error
}) => {
    const totalWords = statistics
        ? statistics.words + statistics.headers + statistics.captions
        : 0;

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Document Statistics"
            size="medium"
            icon={BarChartIcon}
        >
            <div className="statistics-modal-content">
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

                        {statistics.files !== undefined && statistics.files > 1 && (
                            <div className="stat-item">
                                <span className="stat-label">Files Processed</span>
                                <span className="stat-value">{statistics.files}</span>
                            </div>
                        )}
                    </div>
                )}

                <div className="modal-actions">
                    <button
                        type="button"
                        className="button secondary"
                        onClick={onClose}
                    >
                        Close
                    </button>
                </div>
            </div>
        </Modal>
    );
};

export default StatisticsModal;