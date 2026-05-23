// extras/loggers/latex_visualizer/LaTeXVisualizer.tsx
import { t } from '@/i18n';
import type React from 'react';
import { useEffect, useState } from 'react';

import { PluginHeader } from '@/components/common/PluginHeader';
import type { LoggerProps } from '@/plugins/PluginInterface';
import { formatFileSize } from '@/utils/fileUtils';
import { PLUGIN_NAME, PLUGIN_VERSION } from './LaTeXVisualizerPlugin';
import { type ParsedError, parseLatexLog } from './parser';
import './styles.css';

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
			onLineClick(error.line);
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
		<div className='error-stats'>
			<span
				className={`error-count ${filter === 'error' ? 'active' : ''}`}
				onClick={() => handleFilterClick('error')}
				title={t('Click to filter errors')}
			>
				{getErrorTypeIcon('error')}{' '}
				{parsedErrors.filter((e) => e.type === 'error').length}
			</span>
			<span
				className={`warning-count ${filter === 'warning' ? 'active' : ''}`}
				onClick={() => handleFilterClick('warning')}
				title={t('Click to filter warnings')}
			>
				{getErrorTypeIcon('warning')}{' '}
				{parsedErrors.filter((e) => e.type === 'warning').length}
			</span>
		</div>
	);

	return (
		<div className='latex-visualizer'>
			<PluginHeader
				fileName={t('LaTeX Log')}
				filePath={t('LaTeX Compilation Output')}
				pluginName={PLUGIN_NAME}
				pluginVersion={PLUGIN_VERSION}
				tooltipInfo={tooltipInfo}
				controls={headerControls}
			/>

			<div className='latex-visualizer-content'>
				{filteredErrors.length === 0 ? (
					<div className='no-errors'>
						<div className='success-icon'>✓</div>
						<div>
							{parsedErrors.length === 0
								? t('No errors or warnings found.')
								: t('No {filter} found.', { filter })}
						</div>
						<div className='success-subtitle'>
							{parsedErrors.length === 0
								? t('Compilation appears successful!')
								: t('Showing {filter} items only.', { filter })}
						</div>
					</div>
				) : (
					<ul className='error-list'>
						{filteredErrors.map((error, index) => (
							<li
								key={index}
								className={`error-item ${error.type} ${error.line ? 'clickable' : ''}`}
								onClick={() => handleErrorClick(error)}
								title={
									error.line
										? t('Click to go to line {errorLine}', {
												errorLine: error.line,
											})
										: undefined
								}
							>
								<div className='error-header'>
									<span className='error-type-badge'>
										<span className='error-icon'>
											{getErrorTypeIcon(error.type)}
										</span>
										<span className='error-type-text'>{t(error.type)}</span>
									</span>
									<div className='error-location'>
										{error.file && (
											<span
												className='error-file'
												title={t('File: {errorFile}', {
													errorFile: error.file,
												})}
											>
												{t('\uD83D\uDCC4')}

												{error.file}
											</span>
										)}
										{error.line && (
											<span className='error-line'>
												{t('Line')}
												{error.line}
											</span>
										)}
									</div>
								</div>
								<div className='latex-error-message'>
									{error.fullMessage || error.message}
								</div>
								{error.lineContent && (
									<pre className='error-context'>{error.lineContent}</pre>
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
