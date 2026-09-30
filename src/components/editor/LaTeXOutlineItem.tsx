// src/components/editor/OutlineItem.tsx
import type React from 'react';
import { useState } from 'react';

import type { OutlineSection } from '../../utils/latexOutlineParser';
import { ChevronRightIcon, ChevronDownIcon } from '../common/Icons';

interface OutlineItemProps {
	section: OutlineSection;
	currentSection: OutlineSection | null;
	onSectionClick: (line: number) => void;
	level?: number;
}

const OutlineItem: React.FC<OutlineItemProps> = ({
	section,
	currentSection,
	onSectionClick,
	level = 0,
}) => {
	const [isExpanded, setIsExpanded] = useState(true);
	const hasChildren = section.children.length > 0;
	const isCurrentSection = currentSection?.id === section.id;

	const getSectionIcon = (
		type: OutlineSection['type'],
		starred: boolean,
	): string => {
		const icons = {
			part: starred ? '📖*' : '📖',
			chapter: starred ? '📄*' : '📄',
			section: starred ? '§*' : '§',
			subsection: starred ? '§' : '§',
			subsubsection: starred ? '·' : '·',
			paragraph: starred ? '¶*' : '¶',
			subparagraph: starred ? '¶*' : '¶',
		};
		return icons[type];
	};

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

				<span className='outline-icon'>
					{getSectionIcon(section.type, section.starred)}
				</span>

				<span className='outline-title ui-control-label' title={section.title}>
					{section.title}
				</span>

				<span className='outline-line ui-meta'>{section.line}</span>
			</div>

			{hasChildren && isExpanded && (
				<div className='outline-children'>
					{section.children.map((child) => (
						<OutlineItem
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

export default OutlineItem;
