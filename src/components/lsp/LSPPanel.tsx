import type React from "react";
import { useEffect, useState } from "react";
import { pluginRegistry } from "../../plugins/PluginRegistry";
import type { LSPPlugin } from "../../plugins/PluginInterface";
import { SyncIcon, ChevronDownIcon } from "../common/Icons";

interface LSPPanelProps {
	className?: string;
}

const LSPPanel: React.FC<LSPPanelProps> = ({ className = "" }) => {
	const [showPanel, setShowPanel] = useState(false);
	const [activeTab, setActiveTab] = useState<"list" | "detail">("list");
	const [selectedProvider, setSelectedProvider] = useState<string | "all">("all");
	const [availableProviders, setAvailableProviders] = useState<LSPPlugin[]>([]);
	const [selectedItem, setSelectedItem] = useState<any>(null);
	const [showDropdown, setShowDropdown] = useState(false);
	const [isRefreshing, setIsRefreshing] = useState(false);

	useEffect(() => {
		const providers = pluginRegistry.getAllLSPPlugins();
		setAvailableProviders(providers);

		if (providers.length > 0 && selectedProvider === "all") {
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

	const handleProviderSelect = (providerId: string | "all") => {
		setSelectedProvider(providerId);
		setShowDropdown(false);
		setActiveTab("list");
		setSelectedItem(null);
	};

	const handleRefresh = async () => {
		setIsRefreshing(true);
		try {
			if (selectedProvider === "all") {
				for (const provider of availableProviders) {
					await provider.initialize?.();
				}
			} else if (currentProvider) {
				await currentProvider.initialize?.();
			}
		} catch (error) {
			console.error("Error refreshing LSP provider:", error);
		} finally {
			setIsRefreshing(false);
		}
	};

	const getConnectionStatus = () => {
		if (selectedProvider === "all") {
			const connectedCount = availableProviders.filter(p =>
				p.getConnectionStatus() === "connected"
			).length;
			if (connectedCount === availableProviders.length) return "connected";
			if (connectedCount > 0) return "connecting";
			return "disconnected";
		}
		return currentProvider?.getConnectionStatus() || "disconnected";
	};

	const getStatusColor = () => {
		const status = getConnectionStatus();
		switch (status) {
			case "connected": return "#28a745";
			case "connecting": return "#ffc107";
			case "error": return "#dc3545";
			default: return "#666";
		}
	};

	if (!showPanel) {
		return null;
	}

	return (
		<div className={`lsp-panel ${className}`}>
			<div className="lsp-panel-header">
				<h3>Bib Manager</h3>

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
			</div>
			<div className="lsp-panel-content">
				<div className="lsp-controls">
					<div className="lsp-indicator-group">
						<div
							className={`lsp-status-indicator main-button ${getConnectionStatus()}`}
							onClick={() => setShowDropdown(!showDropdown)}
						>
							<div
								className="status-dot"
								style={{ backgroundColor: getStatusColor() }}
							/>
							{selectedProvider === "all" ? (
								<>
									<span className="lsp-label">All LSP</span>
								</>
							) : currentProvider ? (
								<>
									<currentProvider.icon />
									<span className="lsp-label">{currentProvider.name}</span>
								</>
							) : (
								<span className="lsp-label">No LSP</span>
							)}
						</div>

						<button
							className={`lsp-dropdown-toggle ${getConnectionStatus()}`}
							onClick={() => setShowDropdown(!showDropdown)}
						>
							<ChevronDownIcon />
						</button>

						{showDropdown && (
							<div className="lsp-dropdown">
								<div
									className="lsp-dropdown-item"
									onClick={() => handleProviderSelect("all")}
								>
									All LSP
								</div>
								{availableProviders.map((provider) => {
									const IconComponent = provider.icon;
									const status = provider.getConnectionStatus();
									return (
										<div
											key={provider.id}
											className="lsp-dropdown-item"
											onClick={() => handleProviderSelect(provider.id)}
										>
											<span className="service-indicator">
												{status === "connected" ? "🟢" : ""}
											</span>
											<IconComponent /> {provider.name}
										</div>
									);
								})}
							</div>
						)}
					</div>

					<button
						className="lsp-refresh-button"
						onClick={handleRefresh}
						disabled={isRefreshing}
						title={selectedProvider === "all" ? "Refresh all LSP providers" : `Refresh ${currentProvider?.name || "LSP"}`}
					>
						<SyncIcon />
					</button>
				</div>

				{activeTab === "list" ? (
					PanelComponent ? (
						<PanelComponent
							className="lsp-provider-panel"
							onItemSelect={handleItemSelect}
						/>
					) : (
						<div className="no-provider">
							{selectedProvider === "all"
								? "Select a specific LSP provider"
								: "No LSP provider available"}
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
									<h4>{selectedItem.title || selectedItem.label || selectedItem.key}</h4>
									{Object.entries(selectedItem)
										.filter(([key]) => key !== 'title' && key !== 'label')
										.sort(([keyA], [keyB]) => {
											const isObjectA = typeof selectedItem[keyA] === 'object' && !Array.isArray(selectedItem[keyA]);
											const isObjectB = typeof selectedItem[keyB] === 'object' && !Array.isArray(selectedItem[keyB]);
											const isRawA = keyA === 'rawEntry';
											const isRawB = keyB === 'rawEntry';

											if ((isObjectA || isRawA) && !(isObjectB || isRawB)) return 1;
											if (!(isObjectA || isRawA) && (isObjectB || isRawB)) return -1;
											if (isRawA && !isRawB) return 1;
											if (!isRawA && isRawB) return -1;
											return 0;
										})
										.map(([key, value]) => {
											if (!value || (Array.isArray(value) && value.length === 0)) return null;

											if (typeof value === 'object' && !Array.isArray(value)) {
												return (
													<div key={key}>
														<p><strong>{key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1')}:</strong></p>
														<div style={{ marginLeft: '20px' }}>
															{Object.entries(value).map(([subKey, subValue]) => (
																<p key={subKey}>
																	<strong>{subKey}:</strong> {String(subValue)}
																</p>
															))}
														</div>
													</div>
												);
											}

											const displayValue = Array.isArray(value) ? value.join(', ') : String(value);
											const displayKey = key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1');

											const renderValue = () => {
												switch (key) {
													case 'key':
														return <code>{displayValue}</code>;
													case 'rawEntry':
														return <pre style={{ whiteSpace: 'pre-wrap', fontSize: '0.9em', background: '#f5f5f5', padding: '8px', borderRadius: '4px' }}>{displayValue}</pre>;
													default:
														return displayValue;
												}
											};

											return (
												<p key={key}>
													<strong>{displayKey}:</strong> {renderValue()}
												</p>
											);
										})
									}
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

			{showDropdown && (
				<div
					className="dropdown-overlay"
					onClick={() => setShowDropdown(false)}
				/>
			)}
		</div>
	);
};

export default LSPPanel;