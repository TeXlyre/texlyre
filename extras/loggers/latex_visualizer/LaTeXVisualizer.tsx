// extras/loggers/latex_visualizer/LaTeXVisualizer.tsx
import { t } from '@/i18n';
import type React from 'react';
import { useEffect, useState } from 'react';

import { PluginHeader } from '@/components/common/PluginHeader';
import type { LoggerProps } from '@/plugins/PluginInterface';
import { formatFileSize } from '@/utils/fileUtils';
import { PLUGIN_NAME, PLUGIN_VERSION } from './LaTeXVisualizerPlugin';
import { type ParsedError, parseLatexLog } from './parser';
import '../shared/styles.css';

const LaTeXVisualizer: React.FC<LoggerProps> = ({ log, onLineClick }) => {
	const [parsedErrors, setParsedErrors] = useState<ParsedError[]>([]);
	const [filter, setFilter] = useState<'all' | 'error' | 'warning'>('all');

	useEffect(() => {
		if (!log) {
			setParsedErrors([]);
			return;
		}

		const errors = parseLatexLog(log);
		setParsedErrors(errors);
	}, [log]);

	const filteredErrors = parsedErrors.filter((error) => {
		if (filter === 'all') return true;
		return error.type === filter;
	});

	const handleFilterClick = (type: 'error' | 'warning') => {
		setFilter((current) => (current === type ? 'all' : type));
	};

	const handleErrorClick = (error: ParsedError) => {
		if (error.line && onLineClick) {
			onLineClick(error.line, error.file);
		}
	};

	const getErrorTypeIcon = (type: string) => {
		switch (type) {
			case 'error':
				return '❌';
			case 'warning':
				return '⚠️';
			case 'info':
				return 'ℹ️';
			default:
				return '•';
		}
	};

	const tooltipInfo = [
		t('Total errors: {count}', {
			count: parsedErrors.filter((e) => e.type === 'error').length,
		}),
		t('Total warnings: {count}', {
			count: parsedErrors.filter((e) => e.type === 'warning').length,
		}),
		t('Log size: {size}', { size: log ? formatFileSize(log.length) : 'Empty' }),
		t('Click error items to navigate to line'),
	];

	const headerControls = (
		<div className='log-filter-stats'>
			<span
				className={`log-filter-count ${filter === 'error' ? 'active' : ''}`}
				data-kind='error'
				onClick={() => handleFilterClick('error')}
				title={t('Click to filter errors')}
			>
				{getErrorTypeIcon('error')}{' '}
				{parsedErrors.filter((e) => e.type === 'error').length}
			</span>
			<span
				className={`log-filter-count ${filter === 'warning' ? 'active' : ''}`}
				data-kind='warning'
				onClick={() => handleFilterClick('warning')}
				title={t('Click to filter warnings')}
			>
				{getErrorTypeIcon('warning')}{' '}
				{parsedErrors.filter((e) => e.type === 'warning').length}
			</span>
		</div>
	);

	return (
		<div className='log-visualizer'>
			<PluginHeader
				fileName={t('{typesetter} Log', { typesetter: t('LaTeX') })}
				filePath={t('{typesetter} Compilation Output', {
					typesetter: t('LaTeX'),
				})}
				pluginName={PLUGIN_NAME}
				pluginVersion={PLUGIN_VERSION}
				tooltipInfo={tooltipInfo}
				controls={headerControls}
			/>

			<div className='log-visualizer-content'>
				{filteredErrors.length === 0 ? (
					<div className='log-empty-state'>
						<div className='log-empty-icon'>✓</div>
						<div className='log-empty-title'>
							{parsedErrors.length === 0
								? t('No errors or warnings found.')
								: t('No {filter} found.', { filter })}
						</div>
						<div className='log-empty-subtitle'>
							{parsedErrors.length === 0
								? t('Compilation appears successful!')
								: t('Showing {filter} items only.', { filter })}
						</div>
					</div>
				) : (
					<ul className='log-diagnostic-list ui-list' data-gap='md'>
						{filteredErrors.map((error, index) => (
							<li
								key={index}
								className={`log-diagnostic-item ${error.type} ${error.line ? 'clickable' : ''}`}
								onClick={() => handleErrorClick(error)}
								title={
									error.line
										? t('Click to go to line {errorLine}', {
												errorLine: error.line,
											})
										: undefined
								}
							>
								<div className='log-diagnostic-header'>
									<span className='log-diagnostic-type-badge'>
										<span className='log-diagnostic-icon'>
											{getErrorTypeIcon(error.type)}
										</span>
										<span>{t(error.type)}</span>
									</span>
									<div className='log-diagnostic-location'>
										{error.file && (
											<span
												className='log-diagnostic-file'
												title={t('File: {errorFile}', {
													errorFile: error.file,
												})}
											>
												{t('\uD83D\uDCC4')}

												{error.file}
											</span>
										)}
										{error.line && (
											<button
												type='button'
												className='button secondary'
												onClick={(event) => {
													event.stopPropagation();
													handleErrorClick(error);
												}}
												title={t('Go to line {line}', { line: error.line })}
											>
												{t('Line {line}', { line: error.line })}
											</button>
										)}
									</div>
								</div>
								<div className='log-diagnostic-message'>
									{error.fullMessage || error.message}
								</div>
								{error.lineContent && (
									<pre className='ui-code-block' data-wrap='true'>
										{error.lineContent}
									</pre>
								)}
							</li>
						))}
					</ul>
				)}
			</div>
		</div>
	);
};

export default LaTeXVisualizer;
