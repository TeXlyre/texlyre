// src/components/editor/TextMateOutlineItem.tsx
import type React from 'react';
import { useState } from 'react';

import type { TextMateOutlineSection } from '../../utils/textmateOutlineParser';
import { ChevronDownIcon, ChevronRightIcon } from '../common/Icons';

interface TextMateOutlineItemProps {
	section: TextMateOutlineSection;
	currentSection: TextMateOutlineSection | null;
	onSectionClick: (line: number) => void;
	level?: number;
}

const TextMateOutlineItem: React.FC<TextMateOutlineItemProps> = ({
	section,
	currentSection,
	onSectionClick,
	level = 0,
}) => {
	const [isExpanded, setIsExpanded] = useState(true);
	const hasChildren = section.children.length > 0;
	const isCurrentSection = currentSection?.id === section.id;

	const handleClick = () => {
		onSectionClick(section.line);
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

				<span className='outline-title ui-control-label' title={section.title}>
					{section.title}
				</span>

				<span className='outline-line ui-meta'>{section.line}</span>
			</div>

			{hasChildren && isExpanded && (
				<div className='outline-children'>
					{section.children.map((child) => (
						<TextMateOutlineItem
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

export default TextMateOutlineItem;
