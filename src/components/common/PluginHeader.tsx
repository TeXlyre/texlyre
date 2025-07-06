import type React from "react";
import { InfoIcon } from "./Icons";

interface PluginHeaderProps {
	fileName: string;
	filePath?: string;
	pluginName: string;
	pluginVersion: string;
	tooltipInfo: string;
	controls: React.ReactNode;
}

export const PluginHeader: React.FC<PluginHeaderProps> = ({
	fileName,
	filePath,
	pluginName,
	pluginVersion,
	tooltipInfo,
	controls,
}) => {
	return (
		<div className="plugin-header">
			<div className="file-info">
				<h3>{fileName}</h3>
				<div className="filepath-info">
					<span>{filePath || fileName}</span>
					<abbr title={tooltipInfo} className="info-icon-abbr">
						<InfoIcon />
					</abbr>
				</div>
			</div>

			<div className="plugin-controls">{controls}</div>
		</div>
	);
};
