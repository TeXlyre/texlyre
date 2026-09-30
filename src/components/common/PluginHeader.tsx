// src/components/common/PluginHeader.tsx
import React from 'react';
import type { Awareness } from 'y-protocols/awareness';

import { useHeaderVisibility } from '../../hooks/useHeaderVisibility';
import { useWheelScroll } from '../../hooks/useWheelScroll';
import CollaboratorAvatars from './CollaboratorAvatars';
import InfoTooltip from './InfoTooltip';
import { LinkIcon } from './Icons';

interface PluginHeaderProps {
	fileName: string;
	filePath?: string;
	pathPrefix?: React.ReactNode;
	pluginName?: string;
	pluginVersion?: string;
	tooltipInfo?: string | string[];
	controls?: React.ReactNode;
	alwaysVisible?: boolean;
	onNavigateToLinkedFile?: () => void;
	linkedFileInfo?: {
		fileName?: string;
		filePath?: string;
		fileId?: string;
	} | null;
	awareness?: Awareness | null;
}

interface PluginControlGroupProps {
	children: React.ReactNode;
	className?: string;
}

const formatTooltipInfo = (
	info: string | string[],
	pluginName?: string,
	pluginVersion?: string,
): string => {
	const pluginInfo = pluginName
		? `${pluginName}${pluginVersion ? ` v${pluginVersion}` : ''}`
		: '';

	const contentInfo =
		typeof info === 'string'
			? info
			: info.filter((line) => line.trim()).join('\n');

	return pluginInfo ? `${pluginInfo}\n${contentInfo}` : contentInfo;
};

const normalizePluginControls = (children: React.ReactNode): React.ReactNode =>
	React.Children.map(children, (child) => {
		if (!React.isValidElement(child)) return child;

		if (child.type === React.Fragment) {
			const fragment = child as React.ReactElement<{
				children?: React.ReactNode;
			}>;
			return React.cloneElement(
				fragment,
				undefined,
				normalizePluginControls(fragment.props.children),
			);
		}

		if (child.type === 'button') {
			const button = child as React.ReactElement<
				React.ButtonHTMLAttributes<HTMLButtonElement>
			>;
			return React.cloneElement(button, {
				className: ['button', button.props.className].filter(Boolean).join(' '),
			});
		}

		return child;
	});

export const PluginControlGroup: React.FC<PluginControlGroupProps> = ({
	children,
	className = '',
}) => {
	return (
		<div
			className={`ui-button-group ui-toolbar-actions ${className}`}
			data-role='plugin-control'
		>
			{normalizePluginControls(children)}
		</div>
	);
};

export const PluginHeader: React.FC<PluginHeaderProps> = ({
	fileName,
	filePath,
	pathPrefix,
	pluginName,
	pluginVersion,
	tooltipInfo,
	controls,
	alwaysVisible = false,
	onNavigateToLinkedFile,
	linkedFileInfo,
	awareness,
}) => {
	const { headerVisible } = useHeaderVisibility();
	const setHeaderRef = useWheelScroll<HTMLDivElement>();
	const formattedTooltip = tooltipInfo
		? formatTooltipInfo(tooltipInfo, pluginName, pluginVersion)
		: '';

	return (
		<div
			ref={setHeaderRef}
			className='ui-panel-header scroll-x'
			data-role='plugin'
			data-shrink='true'
			style={{ display: alwaysVisible || headerVisible ? undefined : 'none' }}
		>
			<div className='ui-list-content' data-grow='true'>
				<div className='ui-toolbar' data-gap='xs'>
					{pathPrefix}
					{linkedFileInfo && onNavigateToLinkedFile ? (
						<button
							type='button'
							className='button'
							data-role='plugin-path'
							data-variant='text'
							onClick={onNavigateToLinkedFile}
							title={`Navigate to linked file: ${linkedFileInfo.fileName}`}
						>
							{filePath || fileName}
						</button>
					) : (
						<span data-role='plugin-path'>{filePath || fileName}</span>
					)}
					{linkedFileInfo && onNavigateToLinkedFile && (
						<button
							type='button'
							onClick={onNavigateToLinkedFile}
							title={`Navigate to linked file: ${linkedFileInfo.fileName}`}
							className='ui-icon-button'
							data-variant='subtle'
							data-size='xs'
						>
							<LinkIcon />
						</button>
					)}
					{formattedTooltip && (
						<InfoTooltip
							title={
								pluginName
									? `${pluginName}${pluginVersion ? ` v${pluginVersion}` : ''}`
									: undefined
							}
							content={
								<pre
									className='ui-code-block'
									data-appearance='plain'
									data-wrap='true'
								>
									{typeof tooltipInfo === 'string'
										? tooltipInfo
										: (tooltipInfo ?? []).filter((l) => l.trim()).join('\n')}
								</pre>
							}
						/>
					)}
				</div>
			</div>
			{(awareness || controls) && (
				<div className='ui-toolbar-actions' data-role='plugin-controls'>
					{awareness && <CollaboratorAvatars awareness={awareness} />}
					{controls}
				</div>
			)}
		</div>
	);
};
