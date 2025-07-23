// src/components/lsp/LSPToggleButton.tsx
import type React from "react";
import { useState } from "react";
import { useSettings } from "../../hooks/useSettings";
import { pluginRegistry } from "../../plugins/PluginRegistry";

interface LSPToggleButtonProps {
	className?: string;
	pluginId: string;
}

const LSPToggleButton: React.FC<LSPToggleButtonProps> = ({
	className = "",
	pluginId,
}) => {
	const { getSetting } = useSettings();
	const [showPanel, setShowPanel] = useState(false);
	const [showConfig, setShowConfig] = useState(false);

	const lspPlugin = pluginRegistry.getLSPPlugin(pluginId);
	if (!lspPlugin) return null;

	const isEnabled = getSetting(`${pluginId}-enabled`)?.value as boolean ?? false;
	const showPanelSetting = getSetting(`${pluginId}-show-panel`)?.value as boolean ?? true;

	const connectionStatus = lspPlugin.getConnectionStatus();
	const PanelComponent = lspPlugin.renderPanel;

	const handleTogglePanel = () => {
		setShowPanel(!showPanel);
	};

	const handleOpenConfig = () => {
		setShowConfig(true);
	};

	const handleCloseConfig = () => {
		setShowConfig(false);
	};

	const handleSaveConfig = (config: any) => {
		// Save configuration logic would go here
		console.log('Saving LSP config:', config);
		setShowConfig(false);
	};

	if (!isEnabled || !showPanelSetting) {
		return null;
	}

	const IconComponent = lspPlugin.icon;

	return (
		<>
			<div className={`lsp-toggle-container ${className}`}>
				<button
					className={`control-button lsp-toggle-button ${showPanel ? "active" : ""}`}
					onClick={handleTogglePanel}
					title={`${showPanel ? "Hide" : "Show"} ${lspPlugin.name} panel`}
				>
					<div className="lsp-button-content">
						{IconComponent && <IconComponent />}
						<span className={`connection-indicator ${connectionStatus}`} />
					</div>
				</button>

				<button
					className="control-button lsp-config-button"
					onClick={handleOpenConfig}
					title={`Configure ${lspPlugin.name}`}
				>
					⚙️
				</button>
			</div>

			{showPanel && PanelComponent && (
				<div className="lsp-panel-overlay">
					<PanelComponent
						className="lsp-panel"
						onItemSelect={(item) => {
							console.log('LSP item selected:', item);
							// Handle item selection
						}}
					/>
					<button
						className="lsp-panel-close"
						onClick={() => setShowPanel(false)}
					>
						×
					</button>
				</div>
			)}
		</>
	);
};

export default LSPToggleButton;