// src/components/editor/TextMateOutline.tsx
import type React from 'react';
import { useEffect, useMemo, useState } from 'react';

import { t } from '@/i18n';
import { useProperties } from '../../hooks/useProperties';
import { useWheelScroll } from '../../hooks/useWheelScroll';
import {
	TextMateOutlineParser,
	type TextMateOutlineSection,
} from '../../utils/textmateOutlineParser';
import {
	ChevronDownIcon,
	ChevronRightIcon,
	RefreshIcon,
} from '../common/Icons';
import OutlineItem from './TextMateOutlineItem';

interface TextMateOutlineProps {
	content: string;
	fileName: string;
	currentLine?: number;
	onSectionClick: (line: number) => void;
	onRefresh?: () => Promise<void>;
}

const TextMateOutline: React.FC<TextMateOutlineProps> = ({
	content,
	fileName,
	currentLine = 1,
	onSectionClick,
	onRefresh,
}) => {
	const { getProperty, setProperty } = useProperties();
	const headerRef = useWheelScroll<HTMLDivElement>();
	const [sections, setSections] = useState<TextMateOutlineSection[]>([]);
	const [refreshKey, setRefreshKey] = useState(0);
	const [isCollapsed, setIsCollapsed] = useState(
		Boolean(getProperty('textmate-outline-collapsed')),
	);

	/* biome-ignore lint/correctness/useExhaustiveDependencies(refreshKey): Manual refresh token intentionally retriggers outline parsing. */
	useEffect(() => {
		let cancelled = false;

		if (!content.trim()) {
			setSections([]);
			return;
		}

		TextMateOutlineParser.parse(fileName, content).then((parsed) => {
			if (!cancelled) {
				setSections(parsed);
			}
		});

		return () => {
			cancelled = true;
		};
	}, [content, fileName, refreshKey]);

	const currentSection = useMemo(
		() => TextMateOutlineParser.getCurrentSection(sections, currentLine),
		[sections, currentLine],
	);

	const handleRefresh = async () => {
		if (onRefresh) {
			await onRefresh();
		}

		setRefreshKey((previous) => previous + 1);
	};

	const handleToggleCollapse = () => {
		const collapsed = !isCollapsed;

		setIsCollapsed(collapsed);
		setProperty('textmate-outline-collapsed', collapsed);
	};

	return (
		<div className='textmate-outline'>
			<div className='textmate-outline-header scroll-x' ref={headerRef}>
				<button className='outline-toggle-btn' onClick={handleToggleCollapse}>
					{isCollapsed ? <ChevronRightIcon /> : <ChevronDownIcon />}
				</button>

				<span className='outline-header-title'>{t('OUTLINE')}</span>

				<button
					className='action-btn'
					title={t('Refresh Outline')}
					onClick={handleRefresh}
				>
					<RefreshIcon />
				</button>

				{sections.length > 0 && (
					<span className='outline-section-count'>{sections.length}</span>
				)}
			</div>

			{!isCollapsed &&
				(sections.length === 0 ? (
					<div className='outline-empty-state'>
						<p>{t('No sections found')}</p>
					</div>
				) : (
					<div className='outline-content'>
						{sections.map((section) => (
							<OutlineItem
								key={section.id}
								section={section}
								currentSection={currentSection}
								onSectionClick={onSectionClick}
							/>
						))}
					</div>
				))}
		</div>
	);
};

export default TextMateOutline;
