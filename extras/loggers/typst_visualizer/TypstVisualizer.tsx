// extras/loggers/typst_visualizer/TypstVisualizer.tsx
import { t } from '@/i18n';
import type React from 'react';
import { useEffect, useState } from 'react';

import { PluginHeader } from '@/components/common/PluginHeader';
import type { LoggerProps } from '@/plugins/PluginInterface';
import { formatFileSize } from '@/utils/fileUtils';
import { PLUGIN_NAME, PLUGIN_VERSION } from './TypstVisualizerPlugin';
import { type ParsedDiagnostic, parseTypstLog } from './parser';
import './styles.css';

const TypstVisualizer: React.FC<LoggerProps> = ({ log, onLineClick }) => {
	const [parsedDiagnostics, setParsedDiagnostics] = useState<
		ParsedDiagnostic[]
	>([]);
	const [filter, setFilter] = useState<'all' | 'error' | 'warning'>('all');

	useEffect(() => {
		if (!log) {
			setParsedDiagnostics([]);
			return;
		}

		const diagnostics = parseTypstLog(log);
		setParsedDiagnostics(diagnostics);
	}, [log]);

	const filteredDiagnostics = parsedDiagnostics.filter((diagnostic) => {
		if (filter === 'all') return true;
		return diagnostic.type === filter;
	});

	const handleFilterClick = (type: 'error' | 'warning') => {
		setFilter((current) => (current === type ? 'all' : type));
	};

	const handleDiagnosticClick = (diagnostic: ParsedDiagnostic) => {
		if (diagnostic.line && onLineClick) {
			onLineClick(diagnostic.line);
		}
	};

	const getTypeIcon = (type: string) => {
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
			count: parsedDiagnostics.filter((d) => d.type === 'error').length,
		}),
		t('Total warnings: {count}', {
			count: parsedDiagnostics.filter((d) => d.type === 'warning').length,
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
				{getTypeIcon('error')}{' '}
				{parsedDiagnostics.filter((d) => d.type === 'error').length}
			</span>
			<span
				className={`warning-count ${filter === 'warning' ? 'active' : ''}`}
				onClick={() => handleFilterClick('warning')}
				title={t('Click to filter warnings')}
			>
				{getTypeIcon('warning')}{' '}
				{parsedDiagnostics.filter((d) => d.type === 'warning').length}
			</span>
		</div>
	);

	return (
		<div className='typst-visualizer'>
			<PluginHeader
				fileName='Typst Log'
				filePath='Typst Compilation Output'
				pluginName={PLUGIN_NAME}
				pluginVersion={PLUGIN_VERSION}
				tooltipInfo={tooltipInfo}
				controls={headerControls}
			/>

			<div className='typst-visualizer-content'>
				{filteredDiagnostics.length === 0 ? (
					<div className='no-errors'>
						<div className='success-icon'>✓</div>
						<div>
							{parsedDiagnostics.length === 0
								? t('No errors or warnings found.')
								: t('No {filter} found.', { filter })}
						</div>
						<div className='success-subtitle'>
							{parsedDiagnostics.length === 0
								? t('Compilation appears successful!')
								: t('Showing {filter} items only.', { filter })}
						</div>
					</div>
				) : (
					<ul className='diagnostic-list'>
						{filteredDiagnostics.map((diagnostic, index) => (
							<li
								key={index}
								className={`diagnostic-item ${diagnostic.type} ${diagnostic.line ? 'clickable' : ''}`}
								onClick={() => handleDiagnosticClick(diagnostic)}
								title={
									diagnostic.line
										? t('Click to go to line {errorLine}', {
												errorLine: diagnostic.line,
											})
										: undefined
								}
							>
								<div className='diagnostic-header'>
									<span className='diagnostic-type-badge'>
										<span className='diagnostic-icon'>
											{getTypeIcon(diagnostic.type)}
										</span>
										<span className='diagnostic-type-text'>
											{t(diagnostic.type)}
										</span>
									</span>
									<div className='diagnostic-location'>
										{diagnostic.file && (
											<span
												className='diagnostic-file'
												title={t('File: {errorFile}', {
													errorFile: diagnostic.file,
												})}
											>
												{t('\uD83D\uDCC4')}

												{diagnostic.file}
											</span>
										)}
										{diagnostic.line && (
											<span className='diagnostic-line'>
												{t('Line')}
												{diagnostic.line}
											</span>
										)}
									</div>
								</div>
								<div className='typst-diagnostic-message'>
									{diagnostic.fullMessage || diagnostic.message}
								</div>
								{diagnostic.hints && diagnostic.hints.length > 0 && (
									<div className='diagnostic-hints'>
										{diagnostic.hints.map((hint, hintIndex) => (
											<div key={hintIndex} className='diagnostic-hint'>
												{t('\uD83D\uDCA1')}
												{hint}
											</div>
										))}
									</div>
								)}
							</li>
						))}
					</ul>
				)}
			</div>
		</div>
	);
};

export default TypstVisualizer;
