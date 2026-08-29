// src/components/editor/LSPOutline.tsx
import type React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { t } from '@/i18n';
import {
	getCurrentLSPOutlineSection,
	requestLSPDocumentSymbols,
	type LSPOutlineSection,
} from '../../extensions/codemirror/DocumentSymbolLSPExtension';
import { useProperties } from '../../hooks/useProperties';
import { useWheelScroll } from '../../hooks/useWheelScroll';
import {
	ChevronDownIcon,
	ChevronRightIcon,
	RefreshIcon,
} from '../common/Icons';
import LSPOutlineItem from './LSPOutlineItem';

interface LSPOutlineProps {
	fileName: string;
	content: string;
	currentLine?: number;
	onSectionClick: (line: number, column?: number) => void;
	onRefresh?: () => Promise<void>;
}

function countSections(sections: LSPOutlineSection[]): number {
	return sections.reduce(
		(total, section) => total + 1 + countSections(section.children),
		0,
	);
}

const LSPOutline: React.FC<LSPOutlineProps> = ({
	fileName,
	content,
	currentLine = 1,
	onSectionClick,
	onRefresh,
}) => {
	const { getProperty, setProperty, registerProperty } = useProperties();
	const propertiesRegistered = useRef(false);
	const headerRef = useWheelScroll<HTMLDivElement>();
	const [propertiesLoaded, setPropertiesLoaded] = useState(false);
	const [isCollapsed, setIsCollapsed] = useState(true);
	const [sections, setSections] = useState<LSPOutlineSection[]>([]);
	const [refreshKey, setRefreshKey] = useState(0);

	useEffect(() => {
		if (propertiesRegistered.current) return;
		propertiesRegistered.current = true;
		registerProperty({
			id: 'lsp-outline-collapsed',
			category: 'UI',
			subcategory: 'Layout',
			defaultValue: true,
		});
	}, [registerProperty]);

	useEffect(() => {
		if (propertiesLoaded) return;
		const storedCollapsed = getProperty('lsp-outline-collapsed');
		if (storedCollapsed !== undefined) {
			setIsCollapsed(Boolean(storedCollapsed));
		}
		setPropertiesLoaded(true);
	}, [getProperty, propertiesLoaded]);

	useEffect(() => {
		let cancelled = false;
		if (!fileName) {
			setSections([]);
			return;
		}
		void requestLSPDocumentSymbols(fileName).then((nextSections) => {
			if (!cancelled) setSections(nextSections);
		});
		return () => {
			cancelled = true;
		};
	}, [fileName, content, refreshKey]);

	const currentSection = useMemo(
		() => getCurrentLSPOutlineSection(sections, currentLine),
		[sections, currentLine],
	);
	const sectionCount = useMemo(() => countSections(sections), [sections]);

	const handleRefresh = async () => {
		if (onRefresh) await onRefresh();
		setRefreshKey((previous) => previous + 1);
	};

	const handleToggleCollapse = () => {
		const collapsed = !isCollapsed;
		setIsCollapsed(collapsed);
		setProperty('lsp-outline-collapsed', collapsed);
	};

	return (
		<div className='lsp-outline'>
			<div className='lsp-outline-header scroll-x' ref={headerRef}>
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
				{sectionCount > 0 && (
					<span className='outline-section-count'>{sectionCount}</span>
				)}
			</div>

			{!isCollapsed &&
				(sections.length === 0 ? (
					<div className='outline-empty-state'>
						<p>{t('No symbols found')}</p>
					</div>
				) : (
					<div className='outline-content'>
						{sections.map((section) => (
							<LSPOutlineItem
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

export default LSPOutline;
