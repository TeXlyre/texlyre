// src/components/editor/LaTeXOutline.tsx
import type React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { useProperties } from '../../hooks/useProperties';
import { useFileTree } from '../../hooks/useFileTree';
import { LaTeXOutlineParser } from '../../utils/latexOutlineParser';
import { ChevronDownIcon, ChevronRightIcon, RefreshIcon, BarChartIcon } from '../common/Icons';
import OutlineItem from './LaTeXOutlineItem';
import StatisticsModal from './StatisticsModal';
import { latexStatisticsService } from '../../services/LaTeXStatisticsService';
import type { DocumentStatistics } from '../../types/statistics';

interface LaTeXOutlineProps {
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

const LaTeXOutline: React.FC<LaTeXOutlineProps> = ({
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

	const targetFilePath = isEditingFile ? currentFilePath : linkedFileInfo?.filePath;
	const hasValidFilePath = !!targetFilePath;

	useEffect(() => {
		if (propertiesRegistered.current) return;
		propertiesRegistered.current = true;

		registerProperty({
			id: 'outline-collapsed',
			category: 'UI',
			subcategory: 'Layout',
			defaultValue: true,
		});
	}, [registerProperty]);

	useEffect(() => {
		if (propertiesLoaded) return;

		const storedCollapsed = getProperty('outline-collapsed');

		if (storedCollapsed !== undefined) {
			setIsCollapsed(Boolean(storedCollapsed));
		}

		setPropertiesLoaded(true);
	}, [getProperty, propertiesLoaded]);

	const sections = useMemo(() => {
		if (!content.trim()) return [];
		return LaTeXOutlineParser.parse(content);
	}, [content, refreshKey]);

	const currentSection = useMemo(() => {
		return LaTeXOutlineParser.getCurrentSection(sections, currentLine);
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
		setProperty('outline-collapsed', newCollapsed);
	};

	const handleShowStatistics = async () => {
		if (!targetFilePath) return;

		setShowStatistics(true);
		setStatsLoading(true);
		setStatsError(null);

		try {
			const stats = await latexStatisticsService.getStatistics(
				targetFilePath,
				fileTree
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
			<div className="latex-outline">
				<div className="latex-outline-header">
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
							title="Document Statistics"
							onClick={handleShowStatistics}
						>
							<BarChartIcon />
						</button>
					)}
				</div>
				{!isCollapsed && (
					<div className="outline-empty-state">
						<p>No sections found</p>
						<small>Use \section{ }, \subsection{ }, etc.</small>
					</div>
				)}
				<StatisticsModal
					isOpen={showStatistics}
					onClose={() => setShowStatistics(false)}
					statistics={statistics}
					isLoading={statsLoading}
					error={statsError}
				/>
			</div>
		);
	}

	return (
		<div className="latex-outline">
			<div className="latex-outline-header">
				<button
					className="outline-toggle-btn"
					onClick={handleToggleCollapse}
				>
					{isCollapsed ? <ChevronRightIcon /> : <ChevronDownIcon />}
				</button>
				<span className="outline-header-title">OUTLINE</span>
				<span className="outline-section-count">
					{sections.length}
				</span>
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
						title="Document Statistics"
						onClick={handleShowStatistics}
					>
						<BarChartIcon />
					</button>
				)}
			</div>

			{!isCollapsed && (
				<div className="outline-content">
					{sections.map((section) => (
						<OutlineItem
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
			/>
		</div>
	);
};

export default LaTeXOutline;