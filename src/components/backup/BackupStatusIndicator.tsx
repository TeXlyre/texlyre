// src/components/backup/BackupStatusIndicator.tsx
import type React from "react";
import { useState } from "react";

import { useFileSystemBackup } from "../../hooks/useFileSystemBackup";
import { pluginRegistry } from "../../plugins/PluginRegistry";
import { BackupIcon, ChevronDownIcon, FileSystemIcon } from "../common/Icons";
import BackupModal from "./BackupModal";

interface BackupStatusIndicatorProps {
	className?: string;
	currentProjectId?: string | null;
	isInEditor?: boolean;
}

const BackupStatusIndicator: React.FC<BackupStatusIndicatorProps> = ({
	className = "",
	currentProjectId,
	isInEditor = false,
}) => {
	const fileSystemBackup = useFileSystemBackup();
	const [showDropdown, setShowDropdown] = useState(false);
	const [showFileSystemModal, setShowFileSystemModal] = useState(false);
	const [activePlugin, setActivePlugin] = useState<string | null>(null);

	const backupPlugins = pluginRegistry.getBackup();

	const getEnabledServices = () => {
		const enabled = [];

		if (fileSystemBackup.status.isConnected) {
			enabled.push({ type: "filesystem", name: "File System" });
		}

		backupPlugins.forEach((plugin) => {
			const status = plugin.getService().getStatus();
			if (status.isConnected) {
				enabled.push({ type: "plugin", name: plugin.name, id: plugin.id });
			}
		});

		return enabled;
	};

	const enabledServices = getEnabledServices();

	const handleMainButtonClick = () => {
		if (enabledServices.length === 0) {
			setShowDropdown(!showDropdown);
		} else if (enabledServices.length === 1) {
			// Open the single enabled service directly
			const service = enabledServices[0];
			if (service.type === "filesystem") {
				setShowFileSystemModal(true);
			} else {
				setActivePlugin(service.id);
			}
		} else {
			// Multiple services enabled, show dropdown
			setShowDropdown(!showDropdown);
		}
	};

	const handleDropdownToggle = (e: React.MouseEvent) => {
		e.stopPropagation();
		setShowDropdown(!showDropdown);
	};

	const handleFileSystemClick = () => {
		setShowFileSystemModal(true);
		setShowDropdown(false);
	};

	const handlePluginClick = (pluginId: string) => {
		setActivePlugin(pluginId);
		setShowDropdown(false);
	};

	const getMainStatus = () => {
		const { status } = fileSystemBackup;
		const pluginStatuses = backupPlugins.map((plugin) =>
			plugin.getService().getStatus(),
		);

		const hasConnectedService =
			status.isConnected || pluginStatuses.some((s) => s.isConnected);
		const isSyncing =
			status.status === "syncing" ||
			pluginStatuses.some((s) => s.status === "syncing");

		return { connected: hasConnectedService, syncing: isSyncing };
	};

	const mainStatus = getMainStatus();

	const getStatusColor = () => {
		if (!mainStatus.connected) return "#666";
		if (mainStatus.syncing) return "#ffc107";
		return "#28a745";
	};

	const getServiceStatusIndicator = (
		serviceType: string,
		serviceId?: string,
	) => {
		if (serviceType === "filesystem") {
			return fileSystemBackup.status.isConnected ? "🟢" : "";
		} else if (serviceId) {
			const plugin = backupPlugins.find((p) => p.id === serviceId);
			if (plugin) {
				const status = plugin.getService().getStatus();
				return status.isConnected ? "🟢" : "";
			}
		}
		return "";
	};

	return (
		<>
			<div className="backup-status-dropdown-container">
				<div className="backup-button-group">
					<div
						className={`backup-status-indicator main-button ${className} ${
							backupPlugins.length === 0 ? "single-service" : ""
						} ${mainStatus.connected ? "connected" : "disconnected"}`}
						onClick={handleMainButtonClick}
						title={
							enabledServices.length === 1
								? `Open ${enabledServices[0].name}`
								: "Backup Options"
						}
					>
						<div
							className="status-dot"
							style={{ backgroundColor: getStatusColor() }}
						/>
						<BackupIcon />
						<span className="backup-label"> Backup </span>
					</div>

					{backupPlugins.length > 0 && (
						<button
							className={`backup-dropdown-toggle ${mainStatus.connected ? "connected" : "disconnected"}`}
							onClick={handleDropdownToggle}
							title="Backup Options"
						>
							<ChevronDownIcon />
						</button>
					)}
				</div>

				{showDropdown && (
					<div className="backup-dropdown">
						<button
							className="backup-dropdown-item"
							onClick={handleFileSystemClick}
						>
							<span className="service-indicator">
								{getServiceStatusIndicator("filesystem")}
							</span>
							<FileSystemIcon /> File System
						</button>

						{backupPlugins.map((plugin) => {
							const IconComponent = plugin.icon;
							return (
								<button
									key={plugin.id}
									className="backup-dropdown-item"
									onClick={() => handlePluginClick(plugin.id)}
								>
									<span className="service-indicator">
										{getServiceStatusIndicator("plugin", plugin.id)}
									</span>
									<IconComponent /> {plugin.name}
								</button>
							);
						})}
					</div>
				)}
			</div>

			<BackupModal
				isOpen={showFileSystemModal}
				onClose={() => setShowFileSystemModal(false)}
				status={fileSystemBackup.status}
				activities={fileSystemBackup.activities}
				onRequestAccess={fileSystemBackup.requestAccess}
				onSynchronize={fileSystemBackup.synchronize}
				onExportToFileSystem={fileSystemBackup.synchronize}
				onImportChanges={fileSystemBackup.importChanges}
				onDisconnect={fileSystemBackup.disconnect}
				onClearActivity={fileSystemBackup.clearActivity}
				onClearAllActivities={fileSystemBackup.clearAllActivities}
				onChangeDirectory={fileSystemBackup.changeDirectory}
				currentProjectId={currentProjectId}
				isInEditor={isInEditor}
			/>

			{backupPlugins.map((plugin) => {
				const PluginModal = plugin.renderModal;
				return (
					<PluginModal
						key={plugin.id}
						isOpen={activePlugin === plugin.id}
						onClose={() => setActivePlugin(null)}
						currentProjectId={currentProjectId}
						isInEditor={isInEditor}
					/>
				);
			})}

			{showDropdown && (
				<div
					className="dropdown-overlay"
					onClick={() => setShowDropdown(false)}
				/>
			)}
		</>
	);
};

export default BackupStatusIndicator;
