// src/components/editor/TypstOutlineItem.tsx
import type React from "react";
import { useState } from "react";

import type { TypstOutlineSection } from "../../utils/typstOutlineParser";
import { ChevronRightIcon, ChevronDownIcon } from "../common/Icons";

interface TypstOutlineItemProps {
    section: TypstOutlineSection;
    currentSection: TypstOutlineSection | null;
    onSectionClick: (line: number) => void;
    level?: number;
}

const TypstOutlineItem: React.FC<TypstOutlineItemProps> = ({
    section,
    currentSection,
    onSectionClick,
    level = 0
}) => {
    const [isExpanded, setIsExpanded] = useState(true);
    const hasChildren = section.children.length > 0;
    const isCurrentSection = currentSection?.id === section.id;

    const getSectionIcon = (type: TypstOutlineSection['type']): string => {
        const icons = {
            'heading1': '▌',
            'heading2': '▌',
            'heading3': '▌',
            'heading4': '▌',
            'heading5': '▌'
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
                    {getSectionIcon(section.type)}
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
                        <TypstOutlineItem
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

export default TypstOutlineItem;