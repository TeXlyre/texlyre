// extras/lsp/jabref/JabRefPanel.tsx
import type React from "react";
import type { LSPPanelProps } from "../../../src/plugins/PluginInterface";

const JabRefPanel: React.FC<LSPPanelProps> = ({
	className = "",
	onItemSelect,
	searchQuery = "",
	onSearchChange,
	pluginInstance,
}) => {
	// JabRef-specific customizations would go here
	// For now, the main LSP panel handles all bibliography functionality

	return (
		<div className={`jabref-panel ${className}`}>
			<div className="jabref-specific-info">
				This is handled by the main LSP panel for bibliography providers.
			</div>
		</div>
	);
};

export default JabRefPanel;