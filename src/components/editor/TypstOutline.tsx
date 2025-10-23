// src/components/editor/TypstOutline.tsx
import type React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { useProperties } from '../../hooks/useProperties';
import { useFileTree } from '../../hooks/useFileTree';
import { TypstOutlineParser } from '../../utils/typstOutlineParser';
import TypstOutlineItem from './TypstOutlineItem';
import StatisticsModal from './StatisticsModal';
import { typstStatisticsService } from '../../services/TypstStatisticsService';
import type { DocumentStatistics, StatisticsOptions } from '../../types/statistics';
import { ChevronDownIcon, ChevronRightIcon, RefreshIcon, WordCountIcon } from '../common/Icons';

interface TypstOutlineProps {
    content: string;
    currentLine?: number;
    onSectionClick: (line: number) => void;
    onRefresh?: () => Promise<void>;
    linkedFileInfo?: {
        fileName?: string;
        filePath?: string;
        fileId?: string;
    } | null;
    currentFilePath?: string;
    isEditingFile?: boolean;
}

const TypstOutline: React.FC<TypstOutlineProps> = ({
    content,
    currentLine = 1,
    onSectionClick,
    onRefresh,
    linkedFileInfo,
    currentFilePath,
    isEditingFile = false
}) => {
    const { getProperty, setProperty, registerProperty } = useProperties();
    const { fileTree } = useFileTree();
    const propertiesRegistered = useRef(false);
    const [propertiesLoaded, setPropertiesLoaded] = useState(false);
    const [isCollapsed, setIsCollapsed] = useState(true);
    const [refreshKey, setRefreshKey] = useState(0);
    const [showStatistics, setShowStatistics] = useState(false);
    const [statistics, setStatistics] = useState<DocumentStatistics | null>(null);
    const [statsLoading, setStatsLoading] = useState(false);
    const [statsError, setStatsError] = useState<string | null>(null);
    const [statsOptions, setStatsOptions] = useState<StatisticsOptions>({
        includeFiles: true,
        merge: false,
        brief: false,
        total: false,
        sum: true,
        verbose: 0
    });

    const targetFilePath = isEditingFile ? currentFilePath : linkedFileInfo?.filePath;
    const hasValidFilePath = !!targetFilePath;

    useEffect(() => {
        if (propertiesRegistered.current) return;
        propertiesRegistered.current = true;

        registerProperty({
            id: 'typst-outline-collapsed',
            category: 'UI',
            subcategory: 'Layout',
            defaultValue: true,
        });
    }, [registerProperty]);

    useEffect(() => {
        if (propertiesLoaded) return;

        const storedCollapsed = getProperty('typst-outline-collapsed');

        if (storedCollapsed !== undefined) {
            setIsCollapsed(Boolean(storedCollapsed));
        }

        setPropertiesLoaded(true);
    }, [getProperty, propertiesLoaded]);

    const sections = useMemo(() => {
        if (!content.trim()) return [];
        return TypstOutlineParser.parse(content);
    }, [content, refreshKey]);

    const currentSection = useMemo(() => {
        return TypstOutlineParser.getCurrentSection(sections, currentLine);
    }, [sections, currentLine]);

    const handleRefresh = async () => {
        if (onRefresh) {
            await onRefresh();
        }
        setRefreshKey(prev => prev + 1);
    };

    const handleToggleCollapse = () => {
        const newCollapsed = !isCollapsed;
        setIsCollapsed(newCollapsed);
        setProperty('typst-outline-collapsed', newCollapsed);
    };

    const handleShowStatistics = async () => {
        if (!targetFilePath) return;

        setShowStatistics(true);
        setStatsLoading(true);
        setStatsError(null);

        try {
            const stats = await typstStatisticsService.getStatistics(
                targetFilePath,
                fileTree,
                statsOptions
            );
            setStatistics(stats);
        } catch (error) {
            setStatsError(error instanceof Error ? error.message : 'Failed to calculate statistics');
        } finally {
            setStatsLoading(false);
        }
    };

    if (sections.length === 0) {
        return (
            <div className="typst-outline">
                <div className="typst-outline-header">
                    <button
                        className="outline-toggle-btn"
                        onClick={handleToggleCollapse}
                    >
                        {isCollapsed ? <ChevronRightIcon /> : <ChevronDownIcon />}
                    </button>
                    <span className="outline-header-title">OUTLINE</span>
                    <button
                        className="action-btn"
                        title="Refresh Outline"
                        onClick={handleRefresh}
                    >
                        <RefreshIcon />
                    </button>
                    {hasValidFilePath && (
                        <button
                            className="action-btn"
                            title="Word Count Statistics"
                            onClick={handleShowStatistics}
                        >
                            <WordCountIcon />
                        </button>
                    )}
                </div>
                {!isCollapsed && (
                    <div className="outline-empty-state">
                        <p>No headings found</p>
                        <small>Use = for headings</small>
                    </div>
                )}
                <StatisticsModal
                    isOpen={showStatistics}
                    onClose={() => setShowStatistics(false)}
                    statistics={statistics}
                    isLoading={statsLoading}
                    error={statsError}
                    options={statsOptions}
                    onOptionsChange={setStatsOptions}
                    onRefresh={handleShowStatistics}
                />
            </div>
        );
    }

    return (
        <div className="typst-outline">
            <div className="typst-outline-header">
                <button
                    className="outline-toggle-btn"
                    onClick={handleToggleCollapse}
                >
                    {isCollapsed ? <ChevronRightIcon /> : <ChevronDownIcon />}
                </button>
                <span className="outline-header-title">OUTLINE</span>

                <button
                    className="action-btn"
                    title="Refresh Outline"
                    onClick={handleRefresh}
                >
                    <RefreshIcon />
                </button>

                <span className="outline-section-count">
                    {sections.length}
                </span>

                {hasValidFilePath && (
                    <button
                        className="action-btn"
                        title="Word Count Statistics"
                        onClick={handleShowStatistics}
                    >
                        <WordCountIcon />
                    </button>
                )}

            </div>

            {!isCollapsed && (
                <div className="outline-content">
                    {sections.map((section) => (
                        <TypstOutlineItem
                            key={section.id}
                            section={section}
                            currentSection={currentSection}
                            onSectionClick={onSectionClick}
                        />
                    ))}
                </div>
            )}

            <StatisticsModal
                isOpen={showStatistics}
                onClose={() => setShowStatistics(false)}
                statistics={statistics}
                isLoading={statsLoading}
                error={statsError}
                options={statsOptions}
                onOptionsChange={setStatsOptions}
                onRefresh={handleShowStatistics}
            />
        </div>
    );
};

export default TypstOutline;