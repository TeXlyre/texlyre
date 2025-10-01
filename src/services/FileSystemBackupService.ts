// src/services/FileSystemBackupService.ts
import type {
	BackupActivity,
	BackupDiscoveryResult,
	BackupStatus,
} from "../types/backup";
import type { Project } from "../types/projects";
import { authService } from "./AuthService";
import { UnifiedDataStructureService } from "./DataStructureService";
import { ProjectDataService } from "./ProjectDataService";
import { projectImportService } from "./ProjectImportService";
import {
	DirectoryAdapter,
	StorageAdapterService,
} from "./StorageAdapterService";

class FileSystemBackupService {
	private rootHandle: FileSystemDirectoryHandle | null = null;
	private isEnabled = false;
	private status: BackupStatus = {
		isConnected: false,
		isEnabled: false,
		lastSync: null,
		status: "idle",
	};
	private listeners: Array<(status: BackupStatus) => void> = [];
	private dataSerializer = new ProjectDataService();
	private fileSystemManager = new StorageAdapterService();
	private unifiedService = new UnifiedDataStructureService();
	private activities: BackupActivity[] = [];
	private activityListeners: Array<(activities: BackupActivity[]) => void> = [];
	private discoveryListeners: Array<(result: BackupDiscoveryResult) => void> =
		[];

	addActivity(activity: Omit<BackupActivity, "id" | "timestamp">): void {
		const fullActivity: BackupActivity = {
			id: Math.random().toString(36).substring(2),
			timestamp: Date.now(),
			...activity,
		};

		this.activities = [...this.activities.slice(-50), fullActivity];
		this.notifyActivityListeners();
	}

	getActivities(): BackupActivity[] {
		return [...this.activities];
	}

	clearActivity(id: string): void {
		this.activities = this.activities.filter((a) => a.id !== id);
		this.notifyActivityListeners();
	}

	clearAllActivities(): void {
		this.activities = [];
		this.notifyActivityListeners();
	}

	addActivityListener(
		callback: (activities: BackupActivity[]) => void,
	): () => void {
		this.activityListeners.push(callback);
		return () => {
			this.activityListeners = this.activityListeners.filter(
				(l) => l !== callback,
			);
		};
	}

	addDiscoveryListener(
		callback: (result: BackupDiscoveryResult) => void,
	): () => void {
		this.discoveryListeners.push(callback);
		return () => {
			this.discoveryListeners = this.discoveryListeners.filter(
				(l) => l !== callback,
			);
		};
	}

	getRootHandle(): FileSystemDirectoryHandle | null {
		return this.rootHandle;
	}

	async requestAccess(isAutoStart = false): Promise<boolean> {
		try {
			if (!("showDirectoryPicker" in window)) {
				throw new Error("File System Access API not supported");
			}

			this.rootHandle = await (window as any).showDirectoryPicker({
				mode: "readwrite",
				id: "texlyre-backup",
			});

			this.updateStatus({
				isConnected: true,
				status: "idle",
				error: undefined,
			});
			this.performDiscoveryScan();
			return true;
		} catch (error) {
			this.handleAccessError(error, isAutoStart);
			return false;
		}
	}

	async changeDirectory(): Promise<boolean> {
		try {
			this.rootHandle = await (window as any).showDirectoryPicker({
				mode: "readwrite",
				id: "texlyre-backup-new",
			});

			this.updateStatus({
				isConnected: true,
				status: "idle",
				error: undefined,
			});
			this.addActivity({
				type: "backup_complete",
				message: "Backup directory changed successfully",
			});
			this.performDiscoveryScan();
			return true;
		} catch (error) {
			this.updateStatus({
				status: "error",
				error:
					error instanceof Error ? error.message : "Failed to change directory",
			});
			return false;
		}
	}

	async disconnect(): Promise<void> {
		this.rootHandle = null;
		this.isEnabled = false;
		this.updateStatus({ isConnected: false, isEnabled: false });
	}

	setEnabled(enabled: boolean): void {
		this.isEnabled = enabled;
		this.updateStatus({ isEnabled: enabled });
	}

	async exportToFileSystem(projectId?: string): Promise<void> {
		if (!this.canSync()) {
			this.addActivity({
				type: "backup_error",
				message: "Backup not enabled or folder not connected.",
			});
			return;
		}

		this.updateStatus({ status: "syncing" });
		this.addActivity({
			type: "backup_start",
			message: projectId
				? `Starting export for project: ${projectId}`
				: "Starting full export...",
		});

		try {
			const exportData = await this.prepareExportData(projectId);
			const adapter = new DirectoryAdapter(this.rootHandle!);

			await this.fileSystemManager.writeUnifiedStructure(adapter, exportData);

			this.addActivity({
				type: "backup_complete",
				message: "Export completed successfully",
			});
			this.updateStatus({
				status: "idle",
				lastSync: Date.now(),
				error: undefined,
			});
		} catch (error) {
			this.handleError("backup_error", "Export failed", error);
		}
	}

	async synchronize(projectId?: string): Promise<void> {
		await this.exportToFileSystem(projectId);
	}

	async importChanges(projectId?: string): Promise<void> {
		if (!this.canSync()) {
			this.addActivity({
				type: "import_error",
				message: "Backup not enabled or folder not connected.",
			});
			return;
		}

		this.updateStatus({ status: "syncing" });
		this.addActivity({
			type: "import_start",
			message: projectId
				? `Starting import for project: ${projectId}`
				: "Starting import from filesystem...",
		});

		try {
			const adapter = new DirectoryAdapter(this.rootHandle!);

			if (!(await adapter.exists(this.unifiedService.getPaths().MANIFEST))) {
				throw new Error("No backup data found in filesystem");
			}

			const filesystemData =
				await this.fileSystemManager.readUnifiedStructure(adapter);

			if (!this.unifiedService.validateStructure(filesystemData)) {
				throw new Error("Invalid backup structure");
			}

			await this.processImport(filesystemData, projectId);

			this.addActivity({
				type: "import_complete",
				message: projectId
					? `Successfully imported project: ${projectId}`
					: "Successfully imported projects from filesystem",
			});
			this.updateStatus({
				status: "idle",
				lastSync: Date.now(),
				error: undefined,
			});
		} catch (error) {
			this.handleError("import_error", "Import failed", error);
		}
	}

	getStatus(): BackupStatus {
		return { ...this.status };
	}

	addStatusListener(callback: (status: BackupStatus) => void): () => void {
		this.listeners.push(callback);
		return () => {
			this.listeners = this.listeners.filter((l) => l !== callback);
		};
	}

	private handleAccessError(error: any, isAutoStart: boolean): void {
		let errorMessage = "Failed to access file system";

		if (error instanceof DOMException) {
			if (error.name === "SecurityError" && isAutoStart) {
				errorMessage =
					"Auto-backup requires manual folder selection. Click to select backup folder.";
			} else if (error.name === "AbortError") {
				errorMessage = "Folder selection was cancelled";
			}
		} else if (error instanceof Error) {
			errorMessage = error.message;
		}

		this.updateStatus({ status: "error", error: errorMessage });
	}

	private async prepareExportData(projectId?: string) {
		const user = authService.getCurrentUser();
		if (!user) throw new Error("No authenticated user");

		const localProjects = projectId
			? [await authService.getProjectById(projectId)].filter(
				(p): p is Project => !!p,
			)
			: await authService.getProjectsByUser(user.id);

		if (localProjects.length === 0) {
			throw new Error(
				projectId ? `Project ${projectId} not found` : "No projects found",
			);
		}

		const account = await this.dataSerializer.serializeUserData(user.id);

		// Read existing projects from filesystem and merge with new ones
		const existingData = await this.readExistingBackupData();
		const mergedProjects = this.mergeProjectsData(
			existingData.projects,
			localProjects,
		);

		const projectData = new Map();
		for (const project of localProjects) {
			const [documents, files] = await Promise.all([
				this.dataSerializer.serializeProjectDocuments(project),
				this.dataSerializer.serializeProjectFiles(project),
			]);

			projectData.set(project.id, {
				metadata: this.unifiedService.convertProjectToMetadata(
					project,
					"backup",
				),
				documents: documents.documents,
				documentContents: documents.documentContents,
				files: files.files,
				fileContents: files.fileContents,
			});
		}

		// Merge existing project data with new project data
		const mergedProjectData = this.mergeProjectData(
			existingData.projectData,
			projectData,
		);

		return {
			manifest: this.unifiedService.createManifest("backup"),
			account,
			projects: mergedProjects,
			projectData: mergedProjectData,
		};
	}

	private async readExistingBackupData(): Promise<{
		projects: any[];
		projectData: Map<string, any>;
	}> {
		if (!this.rootHandle) {
			return { projects: [], projectData: new Map() };
		}

		try {
			const adapter = new DirectoryAdapter(this.rootHandle);

			if (!(await adapter.exists(this.unifiedService.getPaths().MANIFEST))) {
				return { projects: [], projectData: new Map() };
			}

			const existingData =
				await this.fileSystemManager.readUnifiedStructure(adapter);
			return {
				projects: existingData.projects || [],
				projectData: existingData.projectData || new Map(),
			};
		} catch (error) {
			console.warn("Could not read existing backup data:", error);
			return { projects: [], projectData: new Map() };
		}
	}

	private mergeProjectsData(
		existingProjects: any[],
		newProjects: Project[],
	): any[] {
		const existingProjectsMap = new Map();
		existingProjects.forEach((project) => {
			existingProjectsMap.set(project.docUrl, project);
		});

		// Convert new projects to metadata and update/add them
		newProjects.forEach((project) => {
			const metadata = this.unifiedService.convertProjectToMetadata(
				project,
				"backup",
			);
			existingProjectsMap.set(project.docUrl, metadata);
		});

		return Array.from(existingProjectsMap.values());
	}

	private mergeProjectData(
		existingProjectData: Map<string, any>,
		newProjectData: Map<string, any>,
	): Map<string, any> {
		const mergedData = new Map(existingProjectData);

		for (const [projectId, data] of newProjectData) {
			mergedData.set(projectId, data);
		}

		return mergedData;
	}

	private async processImport(
		filesystemData: any,
		projectId?: string,
	): Promise<void> {
		const user = authService.getCurrentUser();
		if (!user) throw new Error("No authenticated user");

		const projectsToProcess = projectId
			? filesystemData.projects.filter((p: any) => p.id === projectId)
			: filesystemData.projects;

		if (projectId && projectsToProcess.length === 0) {
			throw new Error(`Project ${projectId} not found in backup data`);
		}

		for (const projectMetadata of projectsToProcess) {
			const existingProject = await authService.getProjectById(
				projectMetadata.id,
			);

			if (!existingProject) {
				await this.createProjectDirectly(projectMetadata, user.id);
			}

			const projectData = filesystemData.projectData.get(projectMetadata.id);
			if (projectData) {
				await this.dataSerializer.deserializeToIndexedDB({
					manifest: filesystemData.manifest,
					account: null,
					projects: [projectMetadata],
					projectData: new Map([[projectMetadata.id, projectData]]),
				});
			}
		}
	}

	private async createProjectDirectly(
		projectMetadata: any,
		ownerId: string,
	): Promise<void> {
		const authDb =
			(await authService.db) ||
			(await authService.initialize().then(() => authService.db));
		if (!authDb) throw new Error("Could not access auth database");

		const newProject = {
			id: projectMetadata.id,
			name: projectMetadata.name,
			description: projectMetadata.description,
			type: projectMetadata.type || "latex",
			docUrl: projectMetadata.docUrl,
			createdAt: projectMetadata.createdAt,
			updatedAt: Date.now(),
			ownerId: ownerId,
			tags: projectMetadata.tags,
			isFavorite: projectMetadata.isFavorite,
		};

		await authDb.put("projects", newProject);
	}

	private async performDiscoveryScan(): Promise<void> {
		if (!this.rootHandle) return;

		setTimeout(async () => {
			try {
				const projects = await projectImportService.scanBackupDirectory(
					this.rootHandle!,
				);
				if (projects.length > 0) {
					this.addActivity({
						type: "backup_complete",
						message: `Found ${projects.length} importable project${projects.length === 1 ? "" : "s"} in backup directory`,
					});
					this.notifyDiscoveryListeners({
						hasImportableProjects: true,
						projects,
					});
				}
			} catch (_error) {
				this.addActivity({
					type: "backup_error",
					message: "Error scanning for importable projects",
				});
			}
		}, 1000);
	}

	private updateStatus(updates: Partial<BackupStatus>): void {
		this.status = { ...this.status, ...updates };
		this.notifyListeners();
	}

	private handleError(type: string, message: string, error: any): void {
		const errorMessage = `${message}: ${error instanceof Error ? error.message : "Unknown error"}`;
		this.addActivity({ type: type as any, message: errorMessage });
		this.updateStatus({
			status: "error",
			error: error instanceof Error ? error.message : message,
		});
	}

	private canSync(): boolean {
		return this.rootHandle !== null && this.isEnabled;
	}

	private notifyListeners(): void {
		this.listeners.forEach((listener) => listener(this.status));
	}

	private notifyActivityListeners(): void {
		this.activityListeners.forEach((listener) => listener(this.activities));
	}

	private notifyDiscoveryListeners(result: BackupDiscoveryResult): void {
		this.discoveryListeners.forEach((listener) => listener(result));
	}
}

export const fileSystemBackupService = new FileSystemBackupService();
