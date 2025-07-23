// src/components/lsp/LSPPanel.tsx
import type React from "react";
import { useEffect, useState } from "react";
import { pluginRegistry } from "../../plugins/PluginRegistry";
import type { LSPPlugin } from "../../plugins/PluginInterface";

interface LSPPanelProps {
	className?: string;
}

const LSPPanel: React.FC<LSPPanelProps> = ({ className = "" }) => {
	const [showPanel, setShowPanel] = useState(false);
	const [activeTab, setActiveTab] = useState<"list" | "detail">("list");
	const [selectedProvider, setSelectedProvider] = useState<string>("");
	const [availableProviders, setAvailableProviders] = useState<LSPPlugin[]>([]);
	const [selectedItem, setSelectedItem] = useState<any>(null);

	useEffect(() => {
		const providers = pluginRegistry.getAllLSPPlugins();
		setAvailableProviders(providers);

		if (providers.length > 0 && !selectedProvider) {
			setSelectedProvider(providers[0].id);
		}
	}, []);

	useEffect(() => {
		const handleToggleLSPPanel = (event: Event) => {
			const customEvent = event as CustomEvent;
			const { show, pluginId } = customEvent.detail;

			setShowPanel(show);
			if (show && pluginId) {
				setSelectedProvider(pluginId);
			}
		};

		document.addEventListener("toggle-lsp-panel", handleToggleLSPPanel);

		return () => {
			document.removeEventListener("toggle-lsp-panel", handleToggleLSPPanel);
		};
	}, []);

	const currentProvider = availableProviders.find(p => p.id === selectedProvider);
	const PanelComponent = currentProvider?.renderPanel;

	const handleItemSelect = (item: any) => {
		setSelectedItem(item);
		setActiveTab("detail");
	};

	const handleBackToList = () => {
		setActiveTab("list");
		setSelectedItem(null);
	};

	if (!showPanel) {
		return null;
	}

	return (
		<div className={`lsp-panel ${className}`}>
			<div className="lsp-panel-header">
				<h3>Bib Manager</h3>

				<div className="lsp-provider-selector">
					<select
						value={selectedProvider}
						onChange={(e) => setSelectedProvider(e.target.value)}
						className="provider-select"
					>
						{availableProviders.map((provider) => (
							<option key={provider.id} value={provider.id}>
								{provider.name}
							</option>
						))}
					</select>
				</div>

				<div className="view-tabs">
					<button
						className={`tab-button ${activeTab === "list" ? "active" : ""}`}
						onClick={() => setActiveTab("list")}
						disabled={!selectedItem}
					>
						References
					</button>
					<button
						className={`tab-button ${activeTab === "detail" ? "active" : ""}`}
						onClick={() => setActiveTab("detail")}
						disabled={!selectedItem}
					>
						Detail
					</button>
				</div>

				<button className="close-button" onClick={() => setShowPanel(false)}>
					×
				</button>
			</div>

			<div className="lsp-panel-content">
				{activeTab === "list" ? (
					PanelComponent ? (
						<PanelComponent
							className="lsp-provider-panel"
							onItemSelect={handleItemSelect}
						/>
					) : (
						<div className="no-provider">
							No LSP provider available
						</div>
					)
				) : (
					<div className="lsp-detail-view">
						<div className="detail-header">
							<button
								className="back-button"
								onClick={handleBackToList}
							>
								← Back to References
							</button>
						</div>
						<div className="detail-content">
							{selectedItem ? (
								<div className="reference-detail">
									<h4>{selectedItem.title || selectedItem.label}</h4>
									{selectedItem.authors && (
										<p><strong>Authors:</strong> {selectedItem.authors}</p>
									)}
									{selectedItem.year && (
										<p><strong>Year:</strong> {selectedItem.year}</p>
									)}
									{selectedItem.journal && (
										<p><strong>Journal:</strong> {selectedItem.journal}</p>
									)}
									{selectedItem.entryType && (
										<p><strong>Type:</strong> {selectedItem.entryType}</p>
									)}
									{selectedItem.key && (
										<p><strong>Citation Key:</strong> <code>{selectedItem.key}</code></p>
									)}
								</div>
							) : (
								<div className="no-selection">
									Select an item from the References tab to view details
								</div>
							)}
						</div>
					</div>
				)}
			</div>
		</div>
	);
};

export default LSPPanel;