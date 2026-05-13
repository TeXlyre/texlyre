// src/components/common/PluginHeader.tsx
import type React from 'react';
import type { Awareness } from 'y-protocols/awareness';

import CollaboratorAvatars from './CollaboratorAvatars';
import InfoTooltip from './InfoTooltip';
import { LinkIcon } from './Icons';

interface PluginHeaderProps {
	fileName: string;
	filePath?: string;
	pluginName?: string;
	pluginVersion?: string;
	tooltipInfo?: string | string[];
	controls?: React.ReactNode;
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

export const PluginControlGroup: React.FC<PluginControlGroupProps> = ({
	children,
	className = '',
}) => {
	return <div className={`control-group ${className}`}>{children}</div>;
};

export const PluginHeader: React.FC<PluginHeaderProps> = ({
	fileName,
	filePath,
	pluginName,
	pluginVersion,
	tooltipInfo,
	controls,
	onNavigateToLinkedFile,
	linkedFileInfo,
	awareness,
}) => {
	const formattedTooltip = tooltipInfo
		? formatTooltipInfo(tooltipInfo, pluginName, pluginVersion)
		: '';

	return (
		<div className="plugin-header">
			<div className="file-info">
				<div className="filepath-info">
					<span
						className={linkedFileInfo ? 'linked-filepath' : ''}
						onClick={
							linkedFileInfo && onNavigateToLinkedFile
								? onNavigateToLinkedFile
								: undefined
						}
						title={
							linkedFileInfo
								? `Navigate to linked file: ${linkedFileInfo.fileName}`
								: undefined
						}
					>
						{filePath || fileName}
					</span>
					{linkedFileInfo && onNavigateToLinkedFile && (
						<button
							onClick={onNavigateToLinkedFile}
							title={`Navigate to linked file: ${linkedFileInfo.fileName}`}
							className="linked-file-icon"
						>
							<LinkIcon />
						</button>
					)}
					{formattedTooltip && (
						<InfoTooltip
							title={pluginName ? `${pluginName}${pluginVersion ? ` v${pluginVersion}` : ''}` : undefined}
							content={
								<pre className="plugin-header-tooltip-text">
									{typeof tooltipInfo === 'string'
										? tooltipInfo
										: (tooltipInfo ?? []).filter((l) => l.trim()).join('\n')}
								</pre>
							}
							className="plugin-header-info"
						/>
					)}
				</div>
			</div>
			{(awareness || controls) && (
				<div className="plugin-controls">
					{awareness && <CollaboratorAvatars awareness={awareness} />}
					{controls}
				</div>
			)}
		</div>
	);
};
