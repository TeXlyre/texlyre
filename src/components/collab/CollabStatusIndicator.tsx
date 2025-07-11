// src/components/collab/CollabStatusIndicator.tsx
import type React from "react";
import { useState } from "react";

import { useCollab } from "../../hooks/useCollab";
import { useFileSync } from "../../hooks/useFileSync";
import { collabService } from "../../services/CollabService";
import {
	ChevronDownIcon,
	FileIcon,
	SyncIcon,
	UsersIcon,
} from "../common/Icons";
import CollabModal from "./CollabModal";
import FileSyncModal from "./FileSyncModal";

interface CollabStatusIndicatorProps {
	className?: string;
	docUrl: string;
}

const CollabStatusIndicator: React.FC<CollabStatusIndicatorProps> = ({
	className = "",
	docUrl,
}) => {
	const { isConnected: isCollabConnected } = useCollab();
	const { isEnabled: isFileSyncEnabled, isSyncing: isFileSyncing } =
		useFileSync();
	const [showDropdown, setShowDropdown] = useState(false);
	const [showCollabModal, setShowCollabModal] = useState(false);
	const [showFileSyncModal, setShowFileSyncModal] = useState(false);
	const [isSyncing, setIsSyncing] = useState(false);

	const getMainStatus = () => {
		const hasConnectedService = isCollabConnected;
		const isSyncingAny = isFileSyncing || isSyncing;

		return { connected: hasConnectedService, syncing: isSyncingAny };
	};

	const mainStatus = getMainStatus();

	const getStatusColor = () => {
		if (!mainStatus.connected) return "#666";
		if (mainStatus.syncing) return "#ffc107";
		return "#28a745";
	};

	const getStatusText = () => {
		if (!isCollabConnected) return "Collaboration disconnected";
		if (mainStatus.syncing) return "Syncing...";
		return "Collaboration active";
	};

	const handleSyncAll = async () => {
		if (isSyncing) return;

		setIsSyncing(true);
		try {
			const projectId = docUrl.startsWith("yjs:") ? docUrl.slice(4) : docUrl;
			await collabService.syncAllDocuments(projectId, (_current, _total) => {
				// Progress updates could be shown in modal if needed
			});
		} catch (error) {
			console.error("Error syncing documents:", error);
		} finally {
			setIsSyncing(false);
		}
	};

	const handleMainButtonClick = () => {
		if (!isCollabConnected) {
			// Only collab modal when disconnected
			setShowCollabModal(true);
		} else if (!isFileSyncEnabled) {
			// Only collab enabled, open collab directly
			setShowCollabModal(true);
		} else {
			// Both enabled, show dropdown
			setShowDropdown(!showDropdown);
		}
	};

	const handleDropdownToggle = (e: React.MouseEvent) => {
		e.stopPropagation();
		setShowDropdown(!showDropdown);
	};

	const handleCollabClick = () => {
		setShowCollabModal(true);
		setShowDropdown(false);
	};

	const handleFileSyncClick = () => {
		if (isCollabConnected) {
			setShowFileSyncModal(true);
		}
		setShowDropdown(false);
	};

	const getServiceStatusIndicator = (serviceType: string) => {
		if (serviceType === "collab") {
			return isCollabConnected ? "🟢" : "";
		}
		if (serviceType === "filesync") {
			return isFileSyncEnabled ? "🟢" : "";
		}
		return "";
	};

	return (
		<>
			<div className="collab-status-dropdown-container">
				<div className="collab-button-group">
					<div
						className={`collab-status-indicator main-button ${className} ${
							mainStatus.connected ? "connected" : "disconnected"
						}`}
						onClick={handleMainButtonClick}
						title={
							isFileSyncEnabled && isCollabConnected
								? "Collaboration Options"
								: getStatusText()
						}
					>
						<div
							className="status-dot"
							style={{
								backgroundColor: getStatusColor(),
								animation: mainStatus.syncing ? "pulse 1.5s infinite" : "none",
							}}
						/>
						<UsersIcon />
						<span className="collab-label">Collab</span>
					</div>

					<button
						className={`collab-dropdown-toggle ${mainStatus.connected ? "connected" : "disconnected"}`}
						onClick={handleDropdownToggle}
						title="Collaboration Options"
					>
						<ChevronDownIcon />
					</button>
				</div>

				{showDropdown && (
					<div className="collab-dropdown">
						<div className="collab-dropdown-item" onClick={handleCollabClick}>
							<span className="service-indicator">
								{getServiceStatusIndicator("collab")}
							</span>
							<SyncIcon /> Real-time
						</div>

						<div
							className="collab-dropdown-item"
							onClick={handleFileSyncClick}
							aria-disabled={!isCollabConnected}
						>
							<span className="service-indicator">
								{getServiceStatusIndicator("filesync")}
							</span>
							<FileIcon /> Files
						</div>
					</div>
				)}
			</div>

			<CollabModal
				isOpen={showCollabModal}
				onClose={() => setShowCollabModal(false)}
				isConnected={isCollabConnected}
				isSyncing={isSyncing}
				onSyncAll={handleSyncAll}
				docUrl={docUrl}
			/>

			<FileSyncModal
				isOpen={showFileSyncModal}
				onClose={() => setShowFileSyncModal(false)}
			/>

			{showDropdown && (
				<div
					className="dropdown-overlay"
					onClick={() => setShowDropdown(false)}
				/>
			)}
		</>
	);
};

export default CollabStatusIndicator;
