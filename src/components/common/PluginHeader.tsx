// src/components/common/PluginHeader.tsx
import type React from "react";

import { InfoIcon, LinkIcon } from "./Icons";

interface PluginHeaderProps {
	fileName: string;
	filePath?: string;
	pluginName: string;
	pluginVersion: string;
	tooltipInfo: string | string[];
	controls: React.ReactNode;
	onNavigateToLinkedFile?: () => void;
	linkedFileInfo?: {
		fileName?: string;
		filePath?: string;
		fileId?: string;
	} | null;
}
interface PluginControlGroupProps {
	children: React.ReactNode;
	className?: string;
}

const formatTooltipInfo = (info: string | string[], pluginName?: string, pluginVersion?: string): string => {
    const pluginInfo = pluginName
        ? `${pluginName}${pluginVersion ? ` v${pluginVersion}` : ''}`
        : '';

    const contentInfo = typeof info === 'string' ? info : info.filter(line => line.trim()).join('\n');

    return pluginInfo ? `${pluginInfo}\n${contentInfo}` : contentInfo;
};

export const PluginControlGroup: React.FC<PluginControlGroupProps> = ({
	children,
	className = "",
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
}) => {
	const formattedTooltip = formatTooltipInfo(tooltipInfo, pluginName, pluginVersion);

	return (
		<div className="plugin-header">
			<div className="file-info">
				<div className="file-title-row">
					<h3>{fileName}</h3>
					{linkedFileInfo && onNavigateToLinkedFile && (
						<button
							onClick={onNavigateToLinkedFile}
							title={`Navigate to linked file: ${linkedFileInfo.fileName}`}
							className="linked-file-icon"
						>
							<LinkIcon />
						</button>
					)}
				</div>
				<div className="filepath-info">
					<span
						className={linkedFileInfo ? "linked-filepath" : ""}
						onClick={linkedFileInfo && onNavigateToLinkedFile ? onNavigateToLinkedFile : undefined}
						title={linkedFileInfo ? `Navigate to linked file: ${linkedFileInfo.fileName}` : undefined}
					>
						{filePath || fileName}
					</span>
					<abbr title={formattedTooltip} className="info-icon-abbr">
						<InfoIcon />
					</abbr>
				</div>
			</div>

			<div className="plugin-controls">{controls}</div>
		</div>
	);
};