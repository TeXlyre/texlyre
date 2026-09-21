// extras/loggers/typst_visualizer/TypstVisualizer.tsx
import { t } from '@/i18n';
import type React from 'react';
import { useEffect, useState } from 'react';

import { PluginHeader } from '@/components/common/PluginHeader';
import type { LoggerProps } from '@/plugins/PluginInterface';
import { formatFileSize } from '@/utils/fileUtils';
import { PLUGIN_NAME, PLUGIN_VERSION } from './TypstVisualizerPlugin';
import { type ParsedDiagnostic, parseTypstLog } from './parser';
import '../shared/styles.css';

const TypstVisualizer: React.FC<LoggerProps> = ({ log, onLineClick }) => {
	const [parsedDiagnostics, setParsedDiagnostics] = useState<
		ParsedDiagnostic[]
	>([]);
	const [filter, setFilter] = useState<'all' | 'error' | 'warning'>('all');
	const [expandedHints, setExpandedHints] = useState<Set<number>>(new Set());

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
			onLineClick(diagnostic.line, diagnostic.file);
		}
	};

	const toggleHints = (index: number) => {
		setExpandedHints((current) => {
			const next = new Set(current);
			if (next.has(index)) {
				next.delete(index);
			} else {
				next.add(index);
			}
			return next;
		});
	};

	const renderHint = (text: string): React.ReactNode => {
		return text.split(/(https?:\/\/[^\s]+)/g).map((part, i) =>
			/^https?:\/\//.test(part) ? (
				<a
					key={i}
					href={part}
					target='_blank'
					rel='noopener noreferrer'
					onClick={(e) => e.stopPropagation()}
				>
					{part}
				</a>
			) : (
				<span key={i}>{part}</span>
			),
		);
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
		<div className='log-filter-stats'>
			<span
				className={`log-filter-count ${filter === 'error' ? 'active' : ''}`}
				data-kind='error'
				onClick={() => handleFilterClick('error')}
				title={t('Click to filter errors')}
			>
				{getTypeIcon('error')}{' '}
				{parsedDiagnostics.filter((d) => d.type === 'error').length}
			</span>
			<span
				className={`log-filter-count ${filter === 'warning' ? 'active' : ''}`}
				data-kind='warning'
				onClick={() => handleFilterClick('warning')}
				title={t('Click to filter warnings')}
			>
				{getTypeIcon('warning')}{' '}
				{parsedDiagnostics.filter((d) => d.type === 'warning').length}
			</span>
		</div>
	);

	return (
		<div className='log-visualizer'>
			<PluginHeader
				fileName='Typst Log'
				filePath='Typst Compilation Output'
				pluginName={PLUGIN_NAME}
				pluginVersion={PLUGIN_VERSION}
				tooltipInfo={tooltipInfo}
				controls={headerControls}
			/>

			<div className='log-visualizer-content'>
				{filteredDiagnostics.length === 0 ? (
					<div className='log-empty-state'>
						<div className='log-empty-icon'>✓</div>
						<div className='log-empty-title'>
							{parsedDiagnostics.length === 0
								? t('No errors or warnings found.')
								: t('No {filter} found.', { filter })}
						</div>
						<div className='log-empty-subtitle'>
							{parsedDiagnostics.length === 0
								? t('Compilation appears successful!')
								: t('Showing {filter} items only.', { filter })}
						</div>
					</div>
				) : (
					<ul className='log-diagnostic-list ui-list' data-gap='md'>
						{filteredDiagnostics.map((diagnostic, index) => (
							<li
								key={index}
								className={`log-diagnostic-item ${diagnostic.type} ${diagnostic.line ? 'clickable' : ''}`}
								onClick={() => handleDiagnosticClick(diagnostic)}
								title={
									diagnostic.line
										? t('Click to go to line {errorLine}', {
												errorLine: diagnostic.line,
											})
										: undefined
								}
							>
								<div className='log-diagnostic-header'>
									<span className='log-diagnostic-type-badge'>
										<span className='log-diagnostic-icon'>
											{getTypeIcon(diagnostic.type)}
										</span>
										<span>{t(diagnostic.type)}</span>
									</span>
									<div className='log-diagnostic-location'>
										{diagnostic.file && (
											<span
												className='log-diagnostic-file'
												title={t('File: {errorFile}', {
													errorFile: diagnostic.file,
												})}
											>
												{t('\uD83D\uDCC4')}

												{diagnostic.file}
											</span>
										)}
										{diagnostic.line && (
											<button
												type='button'
												className='button secondary'
												onClick={(event) => {
													event.stopPropagation();
													handleDiagnosticClick(diagnostic);
												}}
												title={t('Go to line {line}', {
													line: diagnostic.line,
												})}
											>
												{t('Line {line}', { line: diagnostic.line })}
											</button>
										)}
									</div>
								</div>
								<div className='log-diagnostic-message'>
									{diagnostic.fullMessage || diagnostic.message}
								</div>
								{diagnostic.hints && diagnostic.hints.length > 0 && (
									<div className='ui-stack' data-gap='sm'>
										<button
											type='button'
											className='button'
											data-variant='text'
											onClick={(e) => {
												e.stopPropagation();
												toggleHints(index);
											}}
										>
											{t('\uD83D\uDCA1')}
											{t('{count} hint', {
												count: diagnostic.hints.length,
											})}
											<span className='ui-note'>
												{expandedHints.has(index) ? '▾' : '▸'}
											</span>
										</button>
										{expandedHints.has(index) && (
											<div className='ui-stack' data-gap='sm'>
												{diagnostic.hints.map((hint, hintIndex) => (
													<div
														key={hintIndex}
														className='ui-message'
														data-tone='info'
														data-density='compact'
													>
														{hint.text && renderHint(hint.text)}
														{hint.items && (
															<ul>
																{hint.items.map((item, itemIndex) => (
																	<li key={itemIndex}>{item}</li>
																))}
															</ul>
														)}
													</div>
												))}
											</div>
										)}
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
