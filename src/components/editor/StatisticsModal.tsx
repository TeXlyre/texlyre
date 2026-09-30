// src/components/editor/StatisticsModal.tsx
import type React from 'react';

import { t } from '@/i18n';
import type {
	DocumentStatistics,
	StatisticsOptions,
} from '../../types/statistics';
import Modal from '../common/Modal';
import { NumberInput } from '../common/NumberInput';
import { WordCountIcon } from '../common/Icons';

interface StatisticsModalProps {
	isOpen: boolean;
	onClose: () => void;
	statistics: DocumentStatistics | null;
	isLoading: boolean;
	error: string | null;
	options: StatisticsOptions;
	onOptionsChange: (options: StatisticsOptions) => void;
	onRefresh: () => Promise<void>;
	contentType: 'latex' | 'typst';
}

interface StatisticsRowProps {
	label: string;
	value: React.ReactNode;
	emphasis?: boolean;
}

const StatisticsRow: React.FC<StatisticsRowProps> = ({
	label,
	value,
	emphasis,
}) => (
	<div
		className='ui-list-item'
		data-align='center'
		data-justify='between'
		data-gap='md'
		data-padding='sm'
		data-emphasis={emphasis ? 'strong' : undefined}
	>
		<span className='ui-note'>{label}</span>
		<strong>{value}</strong>
	</div>
);

interface StatisticsOptionsPanelProps {
	contentType: 'latex' | 'typst';
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
	contentType,
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
	onVerboseChange,
}) => {
	if (contentType === 'typst') {
		return (
			<div className='ui-stack' data-gap='md'>
				<div className='ui-message' data-tone='warning' data-density='compact'>
					<p>
						{t(
							'\u26A0\uFE0F Wordometer is experimental and may not count all Typst elements (e.g., CV templates, Touying presentation elements).',
						)}
					</p>
				</div>
				<div className='ui-stack' data-gap='xs'>
					<h4 className='ui-panel-title'>{t('Detail Level')}</h4>
					<label className='ui-field' data-direction='row'>
						{t('Verbosity: ')}

						<NumberInput
							min={0}
							max={4}
							integer
							value={verbose}
							onChange={onVerboseChange}
							className='ui-field-control'
							data-width='short'
						/>
					</label>
				</div>
			</div>
		);
	}

	return (
		<div className='ui-stack' data-gap='md'>
			<div className='ui-stack' data-gap='xs'>
				<h4 className='ui-panel-title'>{t('File Processing')}</h4>
				<label className='checkbox-control'>
					<input
						type='checkbox'
						checked={includeFiles}
						onChange={(e) => onIncludeFilesChange(e.target.checked)}
					/>
					{t('Include referenced files')}
				</label>
				{includeFiles && (
					<label className='checkbox-control'>
						<input
							type='checkbox'
							checked={merge}
							onChange={(e) => onMergeChange(e.target.checked)}
						/>
						{t('Merge counts (hide individual files)')}
					</label>
				)}
			</div>

			<div className='ui-stack' data-gap='xs'>
				<h4 className='ui-panel-title'>{t('Display Options')}</h4>
				<label className='checkbox-control'>
					<input
						type='checkbox'
						checked={brief}
						onChange={(e) => onBriefChange(e.target.checked)}
					/>
					{t('Brief output')}
				</label>
				<label className='checkbox-control'>
					<input
						type='checkbox'
						checked={total}
						onChange={(e) => onTotalChange(e.target.checked)}
					/>
					{t('Show total only')}
				</label>
				<label className='checkbox-control'>
					<input
						type='checkbox'
						checked={sum}
						onChange={(e) => onSumChange(e.target.checked)}
					/>
					{t('Sum subcounts')}
				</label>
			</div>

			<div className='ui-stack' data-gap='xs'>
				<h4 className='ui-panel-title'>{t('Detail Level')}</h4>
				<label className='ui-field' data-direction='row'>
					{t('Verbosity: ')}

					<NumberInput
						min={0}
						max={4}
						integer
						value={verbose}
						onChange={onVerboseChange}
						className='ui-field-control'
						data-width='short'
					/>
				</label>
			</div>
		</div>
	);
};

const StatisticsModal: React.FC<StatisticsModalProps> = ({
	isOpen,
	onClose,
	statistics,
	isLoading,
	error,
	options,
	onOptionsChange,
	onRefresh,
	contentType,
}) => {
	const totalWords = statistics
		? statistics.words + statistics.headers + statistics.captions
		: 0;

	const handleRefresh = async () => {
		await onRefresh();
	};

	return (
		<Modal
			isOpen={isOpen}
			onClose={onClose}
			title={t('Word Count Statistics')}
			size='large'
			icon={WordCountIcon}
		>
			<div className='statistics-modal-content'>
				<div className='ui-stack' data-gap='md'>
					<StatisticsOptionsPanel
						contentType={contentType}
						includeFiles={options.includeFiles}
						merge={options.merge}
						brief={options.brief}
						total={options.total}
						sum={options.sum}
						verbose={options.verbose}
						onIncludeFilesChange={(value) =>
							onOptionsChange({ ...options, includeFiles: value })
						}
						onMergeChange={(value) =>
							onOptionsChange({ ...options, merge: value })
						}
						onBriefChange={(value) =>
							onOptionsChange({ ...options, brief: value })
						}
						onTotalChange={(value) =>
							onOptionsChange({ ...options, total: value })
						}
						onSumChange={(value) => onOptionsChange({ ...options, sum: value })}
						onVerboseChange={(value) =>
							onOptionsChange({ ...options, verbose: value })
						}
					/>

					<div className='ui-actions' data-variant='modal' data-cross='stretch'>
						<button
							type='button'
							className='button primary'
							onClick={handleRefresh}
							disabled={isLoading}
						>
							{t('Recalculate')}
						</button>
						<button
							type='button'
							className='button secondary'
							onClick={onClose}
						>
							{t('Close')}
						</button>
					</div>
				</div>
				{isLoading && (
					<div className='ui-empty-state'>
						<div className='loading-spinner' />
						<p>{t('Calculating statistics...')}</p>
					</div>
				)}

				{error && (
					<div
						className='ui-message'
						data-tone='error'
						data-role='statistics-error'
					>
						<pre
							className='ui-code-block'
							data-appearance='plain'
							data-wrap='true'
						>
							{error}
						</pre>
					</div>
				)}

				{statistics && !isLoading && !error && (
					<div className='ui-list' data-gap='sm'>
						<StatisticsRow
							label={t('Total Words')}
							value={totalWords.toLocaleString()}
							emphasis
						/>

						<StatisticsRow
							label={t('Words in Text')}
							value={statistics.words.toLocaleString()}
						/>

						<StatisticsRow
							label={t('Words in Headers')}
							value={statistics.headers.toLocaleString()}
						/>

						<StatisticsRow
							label={t('Words in Captions')}
							value={statistics.captions.toLocaleString()}
						/>

						<StatisticsRow
							label={t('Math Inline')}
							value={statistics.mathInline.toLocaleString()}
						/>

						<StatisticsRow
							label={t('Math Displayed')}
							value={statistics.mathDisplay.toLocaleString()}
						/>

						{statistics.numHeaders !== undefined && (
							<StatisticsRow
								label={t('Number of Headers')}
								value={statistics.numHeaders.toLocaleString()}
							/>
						)}

						{statistics.numFloats !== undefined && (
							<StatisticsRow
								label={t('Number of Floats')}
								value={statistics.numFloats.toLocaleString()}
							/>
						)}

						{statistics.files !== undefined && statistics.files > 1 && (
							<StatisticsRow
								label={t('Files Processed')}
								value={statistics.files}
							/>
						)}

						{statistics.fileStats && statistics.fileStats.length > 0 && (
							<div className='ui-stack' data-gap='sm'>
								<h4 className='ui-panel-title'>{t('Individual Files')}</h4>
								{statistics.fileStats.map((fileStat, index) => (
									<details key={index} className='ui-details'>
										<summary>{fileStat.filename}</summary>
										<div className='ui-details-content ui-list' data-gap='xs'>
											<StatisticsRow
												label={t('Words in Text')}
												value={fileStat.words.toLocaleString()}
											/>
											<StatisticsRow
												label={t('Words in Headers')}
												value={fileStat.headers.toLocaleString()}
											/>
											<StatisticsRow
												label={t('Words in Captions')}
												value={fileStat.captions.toLocaleString()}
											/>
											<StatisticsRow
												label={t('Math Inline')}
												value={fileStat.mathInline.toLocaleString()}
											/>
											<StatisticsRow
												label={t('Math Displayed')}
												value={fileStat.mathDisplay.toLocaleString()}
											/>
										</div>
									</details>
								))}
							</div>
						)}

						{statistics.rawOutput && (
							<details className='ui-details' data-width='fit'>
								<summary>{t('Raw Output')}</summary>
								<pre className='ui-code-block' data-wrap='true'>
									{statistics.rawOutput}
								</pre>
							</details>
						)}
					</div>
				)}
			</div>
		</Modal>
	);
};

export default StatisticsModal;
