// src/components/editor/LaTeXOutline.tsx
import type React from "react";
import { useEffect, useMemo, useState } from "react";

import { LaTeXOutlineParser, type OutlineSection } from "../../utils/latexOutlineParser";
import { ChevronDownIcon, ChevronRightIcon, FileTextIcon } from "../common/Icons";
import OutlineItem from "./OutlineItem";

interface LaTeXOutlineProps {
	content: string;
	currentLine?: number;
	onSectionClick: (line: number) => void;
}

const LaTeXOutline: React.FC<LaTeXOutlineProps> = ({ 
	content, 
	currentLine = 1, 
	onSectionClick 
}) => {
	const [isCollapsed, setIsCollapsed] = useState(false);

	const sections = useMemo(() => {
		if (!content.trim()) return [];
		return LaTeXOutlineParser.parse(content);
	}, [content]);

	const currentSection = useMemo(() => {
		return LaTeXOutlineParser.getCurrentSection(sections, currentLine);
	}, [sections, currentLine]);

	const handleToggleCollapse = () => {
		setIsCollapsed(!isCollapsed);
	};

	if (sections.length === 0) {
		return (
			<div className="latex-outline">
				<div className="latex-outline-header">
					<button
						className="outline-toggle-btn"
						onClick={handleToggleCollapse}
					>
						{isCollapsed ? <ChevronRightIcon /> : <ChevronDownIcon />}
					</button>
					<FileTextIcon />
					<span className="outline-header-title">OUTLINE</span>
				</div>
				{!isCollapsed && (
					<div className="outline-empty-state">
						<p>No sections found</p>
						<small>Use \section{}, \subsection{}, etc.</small>
					</div>
				)}
			</div>
		);
	}

	return (
		<div className="latex-outline">
			<div className="latex-outline-header">
				<button
					className="outline-toggle-btn"
					onClick={handleToggleCollapse}
				>
					{isCollapsed ? <ChevronRightIcon /> : <ChevronDownIcon />}
				</button>
				<FileTextIcon />
				<span className="outline-header-title">OUTLINE</span>
				<span className="outline-section-count">
					{sections.length}
				</span>
			</div>
			
			{!isCollapsed && (
				<div className="outline-content">
					{sections.map((section) => (
						<OutlineItem
							key={section.id}
							section={section}
							currentSection={currentSection}
							onSectionClick={onSectionClick}
						/>
					))}
				</div>
			)}
		</div>
	);
};

export default LaTeXOutline;