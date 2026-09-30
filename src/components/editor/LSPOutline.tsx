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
import { RefreshIcon } from '../common/Icons';
import OutlineItem from './LSPOutlineItem';
import OutlinePreviewToggle, {
	OutlineStateToggle,
} from './OutlinePreviewToggle';

interface LSPOutlineProps {
	content: string;
	fileName: string;
	currentLine?: number;
	onSectionClick: (line: number, column?: number) => void;
	onRefresh?: () => Promise<void>;
	previewEnabled?: boolean;
	onPreviewToggle?: () => void;
	maximized?: boolean;
	onMaximizeToggle?: () => void;
	onCollapsedChange?: (collapsed: boolean) => void;
}

const LSPOutline: React.FC<LSPOutlineProps> = ({
	content,
	fileName,
	currentLine = 1,
	onSectionClick,
	onRefresh,
	previewEnabled = false,
	onPreviewToggle,
	maximized = false,
	onMaximizeToggle,
	onCollapsedChange,
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
		if (isCollapsed) {
			if (maximized && onMaximizeToggle) onMaximizeToggle();
			setIsCollapsed(false);
			setProperty('lsp-outline-collapsed', false);
			onCollapsedChange?.(false);
			return;
		}

		if (onMaximizeToggle && !maximized) {
			onMaximizeToggle();
			return;
		}

		if (maximized && onMaximizeToggle) onMaximizeToggle();
		setIsCollapsed(true);
		setProperty('lsp-outline-collapsed', true);
		onCollapsedChange?.(true);
	};

	return (
		<div
			className='outline-panel ui-panel'
			data-collapsed={isCollapsed ? 'true' : undefined}
		>
			<div
				className='ui-panel-header ui-section-header scroll-x'
				data-role='outline'
				ref={headerRef}
			>
				<OutlineStateToggle
					collapsed={isCollapsed}
					maximized={maximized}
					threeState={Boolean(onMaximizeToggle)}
					onToggle={handleToggleCollapse}
				/>

				<span className='outline-header-title ui-panel-title ui-section-title'>
					{t('OUTLINE')}
				</span>
				{sections.length > 0 && (
					<span className='ui-badge' data-variant='label'>
						{sections.length}
					</span>
				)}

				<div
					className='ui-toolbar-actions ui-section-actions'
					data-active-style='filled'
				>
					<OutlinePreviewToggle
						enabled={previewEnabled}
						onToggle={isCollapsed ? undefined : onPreviewToggle}
					/>
					<button
						type='button'
						className='ui-icon-button'
						data-variant='subtle'
						title={t('Refresh Outline')}
						onClick={handleRefresh}
					>
						<RefreshIcon />
					</button>
				</div>
			</div>

			{!isCollapsed &&
				(sections.length === 0 ? (
					<div className='ui-empty-state'>
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
