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
				className={`outline-section ${isCurrentSection ? 'current' : ''}`}
				onClick={handleClick}
				style={{ paddingLeft: `${level * 12}px` }}
			>
				{hasChildren && (
					<button className='outline-expand-btn' onClick={handleToggleExpand}>
						{isExpanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
					</button>
				)}
				{!hasChildren && <div className='outline-spacer' />}

				<span className='outline-icon'>▌</span>

				<span className='outline-title' title={section.title}>
					{section.title}
				</span>

				<span className='outline-line'>{section.line}</span>
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
