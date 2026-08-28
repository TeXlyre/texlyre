// src/components/editor/LSPOutline.tsx
import type React from 'react';
import { useEffect, useMemo, useState } from 'react';

import { t } from '@/i18n';
import {
	getCurrentLSPOutlineSection,
	requestLSPDocumentSymbols,
	type LSPOutlineSection,
} from '../../extensions/codemirror/lsp/lspDocumentSymbols';
import { useProperties } from '../../hooks/useProperties';
import { useWheelScroll } from '../../hooks/useWheelScroll';
import {
	ChevronDownIcon,
	ChevronRightIcon,
	RefreshIcon,
} from '../common/Icons';
import OutlineItem from './LSPOutlineItem';

interface LSPOutlineProps {
	content: string;
	fileName: string;
	currentLine?: number;
	onSectionClick: (line: number, column?: number) => void;
	onRefresh?: () => Promise<void>;
}

const LSPOutline: React.FC<LSPOutlineProps> = ({
	content,
	fileName,
	currentLine = 1,
	onSectionClick,
	onRefresh,
}) => {
	const { getProperty, setProperty } = useProperties();
	const headerRef = useWheelScroll<HTMLDivElement>();
	const [sections, setSections] = useState<LSPOutlineSection[]>([]);
	const [refreshKey, setRefreshKey] = useState(0);
	const [isCollapsed, setIsCollapsed] = useState(
		Boolean(getProperty('lsp-outline-collapsed')),
	);

	/* biome-ignore lint/correctness/useExhaustiveDependencies(refreshKey): Manual refresh token intentionally retriggers the document symbol request. */
	/* biome-ignore lint/correctness/useExhaustiveDependencies(content): Symbols are requested from the server, which tracks document changes. */
	useEffect(() => {
		let cancelled = false;

		if (!fileName) {
			setSections([]);
			return;
		}

		requestLSPDocumentSymbols(fileName).then((parsed) => {
			if (!cancelled) {
				setSections(parsed);
			}
		});

		return () => {
			cancelled = true;
		};
	}, [content, fileName, refreshKey]);

	const currentSection = useMemo(
		() => getCurrentLSPOutlineSection(sections, currentLine),
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

				{sections.length > 0 && (
					<span className='outline-section-count'>{sections.length}</span>
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

export default LSPOutline;
