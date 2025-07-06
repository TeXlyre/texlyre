// src/contexts/FileSystemBackupContext.tsx
import React, {
	createContext,
	useState,
	useEffect,
	type ReactNode,
	useCallback,
	useRef,
} from "react";
import { useSettings } from "../hooks/useSettings";
import { fileSystemBackupService } from "../services/FileSystemBackupService";
import type { ImportableProject } from "../services/ProjectImportService";

interface BackupStatus {
	isConnected: boolean;
	isEnabled: boolean;
	lastSync: number | null;
	status: "idle" | "syncing" | "error";
	error?: string;
}

interface BackupActivity {
	id: string;
	type:
		| "backup_start"
		| "backup_complete"
		| "backup_error"
		| "import_start"
		| "import_complete"
		| "import_error";
	message: string;
	timestamp: number;
	data?: any;
}

interface FileSystemBackupContextType {
	status: BackupStatus;
	activities: BackupActivity[];
	discoveredProjects: ImportableProject[];
	showDiscoveryModal: boolean;
	shouldShowAutoBackupModal: boolean;
	requestAccess: (isAutoStart?: boolean) => Promise<boolean>;
	disconnect: () => Promise<void>;
	setEnabled: (enabled: boolean, isAutoStart?: boolean) => Promise<void>;
	synchronize: (projectId?: string) => Promise<void>;
	exportToFileSystem: (projectId?: string) => Promise<void>;
	importChanges: (projectId?: string) => Promise<void>;
	clearActivity: (id: string) => void;
	clearAllActivities: () => void;
	changeDirectory: () => Promise<boolean>;
	dismissDiscovery: () => void;
	getRootHandle: () => FileSystemDirectoryHandle | null;
}

export const FileSystemBackupContext =
	createContext<FileSystemBackupContextType>({
		status: {
			isConnected: false,
			isEnabled: false,
			lastSync: null,
			status: "idle",
		},
		activities: [],
		discoveredProjects: [],
		showDiscoveryModal: false,
		shouldShowAutoBackupModal: false,
		requestAccess: async () => false,
		disconnect: async () => {},
		setEnabled: async () => {},
		synchronize: async () => {},
		exportToFileSystem: async () => {},
		importChanges: async () => {},
		clearActivity: () => {},
		clearAllActivities: () => {},
		changeDirectory: async () => false,
		dismissDiscovery: () => {},
		getRootHandle: () => null,
	});

interface FileSystemBackupProviderProps {
	children: ReactNode;
}

export const FileSystemBackupProvider: React.FC<
	FileSystemBackupProviderProps
> = ({ children }) => {
	const [status, setStatus] = useState<BackupStatus>({
		isConnected: false,
		isEnabled: false,
		lastSync: null,
		status: "idle",
	});
	const [activities, setActivities] = useState<BackupActivity[]>([]);
	const [discoveredProjects, setDiscoveredProjects] = useState<
		ImportableProject[]
	>([]);
	const [showDiscoveryModal, setShowDiscoveryModal] = useState(false);
	const [shouldShowAutoBackupModal, setShouldShowAutoBackupModal] =
		useState(false);

	const [backupEnabledSetting, setBackupEnabledSetting] = useState(false);
	const [tempEnabled, setTempEnabled] = useState(false);

	const [autoBackupOnStartup, setAutoBackupOnStartup] = useState(false);
	const [autoSyncOnChange, setAutoSyncOnChange] = useState(false);

	const { registerSetting, getSetting } = useSettings();
	const settingsRegistered = useRef(false);

	const getEffectiveEnabled = useCallback(() => {
		return backupEnabledSetting || tempEnabled;
	}, [backupEnabledSetting, tempEnabled]);

	const requestAccess = useCallback(
		async (isAutoStart = false): Promise<boolean> => {
			const connected =
				await fileSystemBackupService.requestAccess(isAutoStart);
			if (connected) {
				setTempEnabled(true);
				fileSystemBackupService.setEnabled(true);
			}
			return connected;
		},
		[],
	);

	const disconnect = useCallback(async (): Promise<void> => {
		await fileSystemBackupService.disconnect();
		setTempEnabled(false);
	}, []);

	const setEnabled = useCallback(
		async (enabled: boolean, isAutoStart = false): Promise<void> => {
			setTempEnabled(enabled);
			return fileSystemBackupService.setEnabled(enabled);
		},
		[],
	);

	const synchronize = useCallback(
		async (projectId?: string): Promise<void> => {
			if (!getEffectiveEnabled()) {
				await setEnabled(true);
			}
			return fileSystemBackupService.synchronize(projectId);
		},
		[getEffectiveEnabled, setEnabled],
	);

	const exportToFileSystem = useCallback(
		async (projectId?: string): Promise<void> => {
			if (!getEffectiveEnabled()) {
				await setEnabled(true);
			}
			return fileSystemBackupService.exportToFileSystem(projectId);
		},
		[getEffectiveEnabled, setEnabled],
	);

	const importChanges = useCallback(
		async (projectId?: string): Promise<void> => {
			if (!getEffectiveEnabled()) {
				await setEnabled(true);
			}
			return fileSystemBackupService.importChanges(projectId);
		},
		[getEffectiveEnabled, setEnabled],
	);

	const changeDirectory = useCallback(async (): Promise<boolean> => {
		const changed = await fileSystemBackupService.changeDirectory();
		if (changed) {
			setTempEnabled(true);
			fileSystemBackupService.setEnabled(true);
		}
		return changed;
	}, []);

	const clearActivity = useCallback((id: string) => {
		fileSystemBackupService.clearActivity(id);
	}, []);

	const clearAllActivities = useCallback(() => {
		fileSystemBackupService.clearAllActivities();
	}, []);

	const dismissDiscovery = useCallback(() => {
		setShowDiscoveryModal(false);
		setDiscoveredProjects([]);
	}, []);

	const getRootHandle = useCallback((): FileSystemDirectoryHandle | null => {
		return fileSystemBackupService.getRootHandle();
	}, []);

	useEffect(() => {
		const unsubscribeStatus = fileSystemBackupService.addStatusListener(
			(newStatus) => {
				setStatus((prevStatus) => ({
					...newStatus,
					isEnabled: prevStatus.isEnabled || tempEnabled,
				}));
				const currentAutoBackupSetting =
					(getSetting("file-system-backup-auto-backup")?.value as boolean) ??
					false;
				setShouldShowAutoBackupModal(
					currentAutoBackupSetting && !newStatus.isConnected,
				);
			},
		);

		const unsubscribeActivities =
			fileSystemBackupService.addActivityListener(setActivities);
		const unsubscribeDiscovery = fileSystemBackupService.addDiscoveryListener(
			(result) => {
				if (result.hasImportableProjects) {
					setDiscoveredProjects(result.projects);
					setShowDiscoveryModal(true);
				}
			},
		);

		setActivities(fileSystemBackupService.getActivities());

		fileSystemBackupService.setEnabled(getEffectiveEnabled());

		return () => {
			unsubscribeStatus();
			unsubscribeActivities();
			unsubscribeDiscovery();
		};
	}, [getSetting, tempEnabled, getEffectiveEnabled]);

	useEffect(() => {
		if (settingsRegistered.current) return;
		settingsRegistered.current = true;

		const initialBackupEnabled =
			(getSetting("file-system-backup-enable")?.value as boolean) ?? false;
		const initialAutoBackup =
			(getSetting("file-system-backup-auto-backup")?.value as boolean) ?? false;
		const initialAutoSync =
			(getSetting("file-system-backup-auto-sync")?.value as boolean) ?? false;

		setBackupEnabledSetting(initialBackupEnabled);
		setAutoBackupOnStartup(initialAutoBackup);
		setAutoSyncOnChange(initialAutoSync);

		if (initialBackupEnabled) {
			fileSystemBackupService.setEnabled(true);
		} else {
			fileSystemBackupService.setEnabled(false);
		}

		registerSetting({
			id: "file-system-backup-enable",
			category: "Backup",
			subcategory: "File System",
			type: "checkbox",
			label: "Enable file system backup",
			description:
				"Sync your data to a local folder for backup and sharing via cloud storage",
			defaultValue: false,
			onChange: (value) => {
				const enabled = value as boolean;
				setBackupEnabledSetting(enabled);
				setTempEnabled(enabled);
				setEnabled(
					enabled,
					(getSetting("file-system-backup-auto-backup")?.value as boolean) ??
						false,
				);
			},
		});

		registerSetting({
			id: "file-system-backup-auto-backup",
			category: "Backup",
			subcategory: "File System",
			type: "checkbox",
			label: "Auto-backup connection on startup",
			description:
				"Automatically start connection to file system when the application loads (requires folder authorization)",
			defaultValue: false,
			onChange: (value) => {
				const autoBackup = value as boolean;
				setAutoBackupOnStartup(autoBackup);
				setShouldShowAutoBackupModal(autoBackup && !status.isConnected);
			},
		});
	}, [registerSetting, getSetting, status.isConnected, setEnabled]);

	const contextValue = React.useMemo(
		() => ({
			status: {
				...status,
				isEnabled: getEffectiveEnabled(),
			},
			activities,
			discoveredProjects,
			showDiscoveryModal,
			shouldShowAutoBackupModal,
			requestAccess,
			disconnect,
			setEnabled,
			synchronize,
			exportToFileSystem,
			importChanges,
			clearActivity,
			clearAllActivities,
			changeDirectory,
			dismissDiscovery,
			getRootHandle,
		}),
		[
			status,
			activities,
			discoveredProjects,
			showDiscoveryModal,
			shouldShowAutoBackupModal,
			requestAccess,
			disconnect,
			setEnabled,
			synchronize,
			exportToFileSystem,
			importChanges,
			clearActivity,
			clearAllActivities,
			changeDirectory,
			dismissDiscovery,
			getRootHandle,
			getEffectiveEnabled,
		],
	);

	return (
		<FileSystemBackupContext.Provider value={contextValue}>
			{children}
		</FileSystemBackupContext.Provider>
	);
};
