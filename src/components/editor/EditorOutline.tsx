// src/components/editor/EditorOutline.tsx
import type React from 'react';
import { useCallback, useRef, useState } from 'react';

import { t } from '@/i18n';
import type { EditorOutlineKind } from '../../hooks/editor/useEditorOutline';
import { useFileTree } from '../../hooks/useFileTree';
import { latexStatisticsService } from '../../services/LaTeXStatisticsService';
import { typstStatisticsService } from '../../services/TypstStatisticsService';
import type { LinkedFileInfoState } from '../../types/editor';
import type {
	DocumentStatistics,
	StatisticsOptions,
} from '../../types/statistics';
import { isLatexFile, isTypstFile } from '../../utils/fileUtils';
import { WordCountIcon } from '../common/Icons';
import LSPOutline from './LSPOutline';
import LaTeXOutline from './LaTeXOutline';
import StatisticsModal from './StatisticsModal';
import TextMateOutline from './TextMateOutline';
import TypstOutline from './TypstOutline';

interface OutlineThemeControls {
	previewEnabled?: boolean;
	onPreviewToggle?: () => void;
	maximized?: boolean;
	onMaximizeToggle?: () => void;
	onCollapsedChange?: (collapsed: boolean) => void;
}

interface EditorOutlineProps extends OutlineThemeControls {
	kind: EditorOutlineKind;
	content: string;
	fileName?: string;
	currentLine: number;
	onSectionClick: (line: number, column?: number) => void;
	onRefresh: () => Promise<void>;
	linkedFileInfo: LinkedFileInfoState;
	currentFilePath?: string;
	isEditingFile: boolean;
}

const defaultStatisticsOptions: StatisticsOptions = {
	includeFiles: true,
	merge: false,
	brief: false,
	total: false,
	sum: true,
	verbose: 0,
};

const EditorOutline: React.FC<EditorOutlineProps> = ({
	kind,
	content,
	fileName,
	currentLine,
	onSectionClick,
	onRefresh,
	linkedFileInfo,
	currentFilePath,
	isEditingFile,
	previewEnabled,
	onPreviewToggle,
	maximized,
	onMaximizeToggle,
	onCollapsedChange,
}) => {
	const { fileTree } = useFileTree();
	const [statisticsFile, setStatisticsFile] = useState<string | null>(null);
	const [statistics, setStatistics] = useState<DocumentStatistics | null>(null);
	const [statsLoading, setStatsLoading] = useState(false);
	const [statsError, setStatsError] = useState<string | null>(null);
	const [latexOptions, setLatexOptions] = useState(defaultStatisticsOptions);
	const [typstOptions, setTypstOptions] = useState(defaultStatisticsOptions);
	const statisticsRequest = useRef(0);

	const targetFilePath = isEditingFile
		? currentFilePath
		: linkedFileInfo?.filePath;
	const contentType = isTypstFile(targetFilePath)
		? 'typst'
		: isLatexFile(targetFilePath)
			? 'latex'
			: null;
	const statsOptions = contentType === 'typst' ? typstOptions : latexOptions;
	const setStatsOptions =
		contentType === 'typst' ? setTypstOptions : setLatexOptions;
	const supportsStatistics =
		!!targetFilePath && !!contentType && kind !== 'textmate';

	const handleShowStatistics = async () => {
		if (!targetFilePath || !contentType) return;

		const request = ++statisticsRequest.current;
		setStatisticsFile(targetFilePath);
		setStatsLoading(true);
		setStatsError(null);

		try {
			const service =
				contentType === 'typst'
					? typstStatisticsService
					: latexStatisticsService;
			const stats = await service.getStatistics(
				targetFilePath,
				fileTree,
				statsOptions,
			);
			if (request === statisticsRequest.current) setStatistics(stats);
		} catch (error) {
			if (request !== statisticsRequest.current) return;
			setStatsError(
				error instanceof Error
					? error.message
					: 'Failed to calculate statistics',
			);
		} finally {
			if (request === statisticsRequest.current) setStatsLoading(false);
		}
	};

	const handleCloseStatistics = useCallback(() => setStatisticsFile(null), []);

	const statisticsAction = supportsStatistics ? (
		<button
			type='button'
			className='ui-icon-button'
			data-variant='subtle'
			title={t('Word Count Statistics')}
			onClick={handleShowStatistics}
		>
			<WordCountIcon />
		</button>
	) : null;

	const themeControls = {
		previewEnabled,
		onPreviewToggle,
		maximized,
		onMaximizeToggle,
		onCollapsedChange,
	};

	let outline: React.ReactNode = null;
	if (kind === 'lsp' && fileName) {
		outline = (
			<LSPOutline
				content={content}
				fileName={fileName}
				currentLine={currentLine}
				onSectionClick={onSectionClick}
				onRefresh={onRefresh}
				statisticsAction={statisticsAction}
				{...themeControls}
			/>
		);
	} else if (kind === 'latex') {
		outline = (
			<LaTeXOutline
				content={content}
				currentLine={currentLine}
				onSectionClick={onSectionClick}
				onRefresh={onRefresh}
				statisticsAction={statisticsAction}
				{...themeControls}
			/>
		);
	} else if (kind === 'typst') {
		outline = (
			<TypstOutline
				content={content}
				currentLine={currentLine}
				onSectionClick={onSectionClick}
				onRefresh={onRefresh}
				statisticsAction={statisticsAction}
				{...themeControls}
			/>
		);
	} else if (kind === 'textmate') {
		outline = (
			<TextMateOutline
				content={content}
				fileName={fileName ?? ''}
				currentLine={currentLine}
				onSectionClick={onSectionClick}
				onRefresh={onRefresh}
				{...themeControls}
			/>
		);
	}

	return (
		<>
			{outline}
			{supportsStatistics && contentType && (
				<StatisticsModal
					isOpen={statisticsFile === targetFilePath}
					onClose={handleCloseStatistics}
					statistics={statistics}
					isLoading={statsLoading}
					error={statsError}
					options={statsOptions}
					onOptionsChange={setStatsOptions}
					onRefresh={handleShowStatistics}
					contentType={contentType}
				/>
			)}
		</>
	);
};

export default EditorOutline;
