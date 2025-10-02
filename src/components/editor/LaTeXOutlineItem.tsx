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
	level = 0 
}) => {
	const [isExpanded, setIsExpanded] = useState(true);
	const hasChildren = section.children.length > 0;
	const isCurrentSection = currentSection?.id === section.id;

	const getSectionIcon = (type: OutlineSection['type'], starred: boolean): string => {
		const icons = {
			'part': starred ? '📖*' : '📖',
			'chapter': starred ? '📄*' : '📄',
			'section': starred ? '§*' : '§',
			'subsection': starred ? '§' : '§',
			'subsubsection': starred ? '·' : '·',
			'paragraph': starred ? '¶*' : '¶',
			'subparagraph': starred ? '¶*' : '¶'
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
		<div className="outline-item">
			<div 
				className={`outline-section ${isCurrentSection ? 'current' : ''}`}
				onClick={handleClick}
				style={{ paddingLeft: `${level * 12}px` }}
			>
				{hasChildren && (
					<button
						className="outline-expand-btn"
						onClick={handleToggleExpand}
					>
						{isExpanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
					</button>
				)}
				{!hasChildren && <div className="outline-spacer" />}
				
				<span className="outline-icon">
					{getSectionIcon(section.type, section.starred)}
				</span>
				
				<span className="outline-title" title={section.title}>
					{section.title}
				</span>
				
				<span className="outline-line">
					{section.line}
				</span>
			</div>
			
			{hasChildren && isExpanded && (
				<div className="outline-children">
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