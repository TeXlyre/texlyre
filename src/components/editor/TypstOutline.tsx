// src/components/editor/TypstOutline.tsx
import type React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { t } from '@/i18n';
import { useProperties } from '../../hooks/useProperties';
import { useFileTree } from '../../hooks/useFileTree';
import { useWheelScroll } from '../../hooks/useWheelScroll';
import { TypstOutlineParser } from '../../utils/typstOutlineParser';
import TypstOutlineItem from './TypstOutlineItem';
import OutlinePreviewToggle, {
	OutlineStateToggle,
} from './OutlinePreviewToggle';
import StatisticsModal from './StatisticsModal';
import { typstStatisticsService } from '../../services/TypstStatisticsService';
import type {
	DocumentStatistics,
	StatisticsOptions,
} from '../../types/statistics';
import { RefreshIcon, WordCountIcon } from '../common/Icons';

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
	previewEnabled?: boolean;
	onPreviewToggle?: () => void;
	maximized?: boolean;
	onMaximizeToggle?: () => void;
	onCollapsedChange?: (collapsed: boolean) => void;
}

const TypstOutline: React.FC<TypstOutlineProps> = ({
	content,
	currentLine = 1,
	onSectionClick,
	onRefresh,
	linkedFileInfo,
	currentFilePath,
	isEditingFile = false,
	previewEnabled = false,
	onPreviewToggle,
	maximized = false,
	onMaximizeToggle,
	onCollapsedChange,
}) => {
	const { getProperty, setProperty, registerProperty } = useProperties();
	const { fileTree } = useFileTree();
	const propertiesRegistered = useRef(false);
	const headerRef = useWheelScroll<HTMLDivElement>();
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
		verbose: 0,
	});

	const targetFilePath = isEditingFile
		? currentFilePath
		: linkedFileInfo?.filePath;
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

	/* biome-ignore lint/correctness/useExhaustiveDependencies: refreshKey is a manual re-parse trigger; bumping it via handleRefresh must invalidate this memo even when content is unchanged. */
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
		setRefreshKey((prev) => prev + 1);
	};

	const handleToggleCollapse = () => {
		if (isCollapsed) {
			if (maximized && onMaximizeToggle) onMaximizeToggle();
			setIsCollapsed(false);
			setProperty('typst-outline-collapsed', false);
			onCollapsedChange?.(false);
			return;
		}

		if (onMaximizeToggle && !maximized) {
			onMaximizeToggle();
			return;
		}

		if (maximized && onMaximizeToggle) onMaximizeToggle();
		setIsCollapsed(true);
		setProperty('typst-outline-collapsed', true);
		onCollapsedChange?.(true);
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
				statsOptions,
			);
			setStatistics(stats);
		} catch (error) {
			setStatsError(
				error instanceof Error
					? error.message
					: 'Failed to calculate statistics',
			);
		} finally {
			setStatsLoading(false);
		}
	};

	if (sections.length === 0) {
		return (
			<div
				className='outline-panel ui-panel'
				data-collapsed={isCollapsed ? 'true' : undefined}
			>
				<div
					className='ui-panel-header ui-section-header ui-explorer-heading scroll-x'
					data-role='outline'
					ref={headerRef}
				>
					<OutlineStateToggle
						collapsed={isCollapsed}
						maximized={maximized}
						threeState={Boolean(onMaximizeToggle)}
						onToggle={handleToggleCollapse}
					/>
					<span className='outline-header-title ui-panel-title ui-section-title'>
						{t('OUTLINE')}
					</span>
					<div
						className='ui-toolbar-actions ui-section-actions'
						data-active-style='filled'
					>
						<OutlinePreviewToggle
							enabled={previewEnabled}
							onToggle={isCollapsed ? undefined : onPreviewToggle}
						/>
						<button
							type='button'
							className='ui-icon-button'
							data-variant='subtle'
							title={t('Refresh Outline')}
							onClick={handleRefresh}
						>
							<RefreshIcon />
						</button>
						{hasValidFilePath && (
							<button
								type='button'
								className='ui-icon-button'
								data-variant='subtle'
								title={t('Word Count Statistics')}
								onClick={handleShowStatistics}
							>
								<WordCountIcon />
							</button>
						)}
					</div>
				</div>
				{!isCollapsed && (
					<div className='ui-empty-state'>
						<p>{t('No headings found')}</p>
						<small>{t('Use = for headings')}</small>
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
					contentType='typst'
				/>
			</div>
		);
	}

	return (
		<div
			className='outline-panel ui-panel'
			data-collapsed={isCollapsed ? 'true' : undefined}
		>
			<div
				className='ui-panel-header ui-section-header ui-explorer-heading scroll-x'
				data-role='outline'
				ref={headerRef}
			>
				<OutlineStateToggle
					collapsed={isCollapsed}
					maximized={maximized}
					threeState={Boolean(onMaximizeToggle)}
					onToggle={handleToggleCollapse}
				/>
				<span className='outline-header-title ui-panel-title ui-section-title'>
					{t('OUTLINE')}
				</span>
				<span className='ui-badge' data-variant='label'>
					{sections.length}
				</span>

				<div
					className='ui-toolbar-actions ui-section-actions'
					data-active-style='filled'
				>
					<OutlinePreviewToggle
						enabled={previewEnabled}
						onToggle={isCollapsed ? undefined : onPreviewToggle}
					/>
					<button
						type='button'
						className='ui-icon-button'
						data-variant='subtle'
						title={t('Refresh Outline')}
						onClick={handleRefresh}
					>
						<RefreshIcon />
					</button>
					{hasValidFilePath && (
						<button
							type='button'
							className='ui-icon-button'
							data-variant='subtle'
							title={t('Word Count Statistics')}
							onClick={handleShowStatistics}
						>
							<WordCountIcon />
						</button>
					)}
				</div>
			</div>

			{!isCollapsed && (
				<div className='outline-content'>
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
				contentType='typst'
			/>
		</div>
	);
};

export default TypstOutline;
