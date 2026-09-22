// src/components/editor/LSPOutlineItem.tsx
import type React from 'react';
import { useState } from 'react';

import type { LSPOutlineSection } from '../../extensions/codemirror/lsp/lspDocumentSymbols';
import { ChevronDownIcon, ChevronRightIcon } from '../common/Icons';

interface LSPOutlineItemProps {
	section: LSPOutlineSection;
	currentSection: LSPOutlineSection | null;
	onSectionClick: (line: number, column?: number) => void;
	level?: number;
}

const LSPOutlineItem: React.FC<LSPOutlineItemProps> = ({
	section,
	currentSection,
	onSectionClick,
	level = 0,
}) => {
	const [isExpanded, setIsExpanded] = useState(true);
	const hasChildren = section.children.length > 0;
	const isCurrentSection = currentSection?.id === section.id;
	const title = section.detail
		? `${section.title} — ${section.detail}`
		: section.title;

	const handleClick = () => {
		onSectionClick(section.line, section.column);
	};

	const handleToggleExpand = (e: React.MouseEvent) => {
		e.stopPropagation();
		setIsExpanded(!isExpanded);
	};

	return (
		<div className='outline-item'>
			<div
				className='outline-section ui-list-item'
				data-border='none'
				data-interactive='true'
				data-align='center'
				data-gap='xs'
				data-padding='xs'
				data-selected={isCurrentSection ? 'true' : undefined}
				onClick={handleClick}
				style={{ paddingLeft: `${level * 12}px` }}
			>
				{hasChildren && (
					<button
						type='button'
						className='ui-icon-button'
						data-variant='ghost'
						data-size='xs'
						onClick={handleToggleExpand}
					>
						{isExpanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
					</button>
				)}
				{!hasChildren && <div className='outline-spacer' />}

				<span className='outline-icon'>▌</span>

				<span className='outline-title ui-control-label' title={title}>
					{section.title}
				</span>

				<span className='outline-line ui-meta'>{section.line}</span>
			</div>

			{hasChildren && isExpanded && (
				<div className='outline-children'>
					{section.children.map((child) => (
						<LSPOutlineItem
							key={child.id}
							section={child}
							currentSection={currentSection}
							onSectionClick={onSectionClick}
							level={level + 1}
						/>
					))}
				</div>
			)}
		</div>
	);
};

export default LSPOutlineItem;
