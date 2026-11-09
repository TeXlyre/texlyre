// src/components/agent/DiffView.tsx
import type React from 'react';
import { useMemo } from 'react';

import { t } from '@/i18n';
import { collapseUnchanged, diffLines } from '../../utils/lineDiff';

interface DiffViewProps {
	before: string | null;
	after: string;
	context?: number;
}

const DiffView: React.FC<DiffViewProps> = ({ before, after, context = 3 }) => {
	const lines = useMemo(
		() => collapseUnchanged(diffLines(before ?? '', after), context),
		[before, after, context],
	);

	if (!lines.some((line) => line.kind === 'added' || line.kind === 'removed')) {
		return <div className='agent-diff-empty'>{t('No changes')}</div>;
	}

	return (
		<pre className='agent-diff'>
			{lines.map((line, index) => {
				if (line.kind === 'skipped') {
					return (
						<div
							// biome-ignore lint/suspicious/noArrayIndexKey: folded runs have no line of their own; the list is derived wholesale from its inputs.
							key={`skip-${index}`}
							className='agent-diff-line'
							data-kind='skipped'
						>
							{t('⋯ {count} unchanged lines', { count: line.count })}
						</div>
					);
				}
				const marker =
					line.kind === 'added' ? '+' : line.kind === 'removed' ? '-' : ' ';
				const number =
					line.kind === 'added'
						? line.newLine
						: line.kind === 'removed'
							? line.oldLine
							: line.newLine;
				return (
					<div
						key={`${line.kind}-${number}`}
						className='agent-diff-line'
						data-kind={line.kind}
					>
						<span className='agent-diff-number'>{number}</span>
						<span className='agent-diff-marker'>{marker}</span>
						<span className='agent-diff-text'>{line.text}</span>
					</div>
				);
			})}
		</pre>
	);
};

export default DiffView;
