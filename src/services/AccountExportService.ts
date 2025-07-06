// src/services/AccountExportService.ts
import { saveAs } from "file-saver";

import { authService } from "./AuthService";
import { UnifiedDataStructureService } from "./DataStructureService.ts";
import { ProjectDataService } from "./ProjectDataService.ts";
import { StorageAdapterService, ZipAdapter } from "./StorageAdapterService.ts";

export interface ExportOptions {
	includeAccount?: boolean;
	includeDocuments?: boolean;
	includeFiles?: boolean;
	projectIds?: string[];
	format?: "texlyre" | "files-only";
}

class AccountExportService {
	private dataSerializer = new ProjectDataService();
	private fileSystemManager = new StorageAdapterService();
	private unifiedService = new UnifiedDataStructureService();

	async exportAccount(
		userId: string,
		exportAllProjects = false,
	): Promise<void> {
		const options: ExportOptions = {
			includeAccount: true,
			includeDocuments: true,
			includeFiles: true,
			format: "texlyre",
		};

		const currentProjectId = exportAllProjects
			? undefined
			: sessionStorage.getItem("currentProjectId");

		if (currentProjectId) {
			options.projectIds = [currentProjectId];
		}

		await this.exportWithOptions(userId, options);
	}

	async exportProjects(
		projectIds: string[],
		options: ExportOptions = {},
	): Promise<void> {
		const user = authService.getCurrentUser();
		if (!user) {
			throw new Error("User not authenticated");
		}

		const exportOptions: ExportOptions = {
			includeAccount: false,
			includeDocuments: true,
			includeFiles: true,
			format: "texlyre",
			...options,
			projectIds,
		};

		await this.exportWithOptions(user.id, exportOptions);
	}

	private async exportWithOptions(
		userId: string,
		options: ExportOptions,
	): Promise<void> {
		try {
			const user = authService.getCurrentUser();
			if (!user || user.id !== userId) {
				throw new Error("User not authenticated or ID mismatch");
			}

			const account = options.includeAccount
				? await this.dataSerializer.serializeUserData(userId)
				: null;

			const projects = await this.dataSerializer.serializeProjects(
				userId,
				"export",
				options.projectIds,
			);

			const manifest = this.unifiedService.createManifest("export");
			const projectData = new Map();

			for (const project of projects) {
				if (options.projectIds && !options.projectIds.includes(project.id)) {
					continue;
				}

				let documents = { documents: [], documentContents: new Map() };
				let files = { files: [], fileContents: new Map() };

				if (options.includeDocuments) {
					documents = await this.dataSerializer.serializeProjectDocuments({
						id: project.id,
						name: project.name,
						description: project.description,
						docUrl: project.docUrl,
						createdAt: project.createdAt,
						updatedAt: project.updatedAt,
						ownerId: project.ownerId,
						tags: project.tags,
						isFavorite: project.isFavorite,
					});
				}

				if (options.includeFiles) {
					files = await this.dataSerializer.serializeProjectFiles({
						id: project.id,
						name: project.name,
						description: project.description,
						docUrl: project.docUrl,
						createdAt: project.createdAt,
						updatedAt: project.updatedAt,
						ownerId: project.ownerId,
						tags: project.tags,
						isFavorite: project.isFavorite,
					});
				}

				projectData.set(project.id, {
					metadata: project,
					documents: documents.documents,
					documentContents: documents.documentContents,
					files: files.files,
					fileContents: files.fileContents,
				});
			}

			const unifiedData = {
				manifest,
				account,
				projects,
				projectData,
			};

			const zipAdapter = new ZipAdapter();

			if (options.format === "files-only") {
				await this.writeFilesOnlyStructure(zipAdapter, unifiedData);
			} else {
				await this.fileSystemManager.writeUnifiedStructure(
					zipAdapter,
					unifiedData,
				);
			}

			const zipBlob = await zipAdapter.generateZip();
			const timestamp = new Date()
				.toISOString()
				.replace(/:/g, "-")
				.substring(0, 19);

			let fileName: string;
			if (options.includeAccount) {
				fileName = options.projectIds
					? `texlyre-project-export-${timestamp}.zip`
					: `texlyre-account-export-${timestamp}.zip`;
			} else {
				const formatSuffix =
					options.format === "files-only" ? "files" : "texlyre";
				fileName = `texlyre-projects-${formatSuffix}-${timestamp}.zip`;
			}

			saveAs(zipBlob, fileName);
		} catch (error) {
			console.error("Error exporting:", error);
			throw new Error("Failed to export data");
		}
	}

	private async writeFilesOnlyStructure(
		adapter: ZipAdapter,
		data: any,
	): Promise<void> {
		const { fileStorageService } = await import("./FileStorageService");
		const { fileCommentProcessor } = await import("./FileCommentProcessor");

		for (const [projectId, projectData] of data.projectData) {
			const projectName = projectData.metadata.name.replace(
				/[/\\?%*:|"<>]/g,
				"-",
			);
			const projectPath = `${projectName}`;

			await adapter.createDirectory(projectPath);

			const actualProjectId = projectData.metadata.docUrl.startsWith("yjs:")
				? projectData.metadata.docUrl.slice(4)
				: projectData.metadata.docUrl;

			let filesExported = false;

			// Try to use live FileStorageService first
			if (!fileStorageService.isConnectedToProject(actualProjectId)) {
				try {
					await fileStorageService.initialize(`yjs:${actualProjectId}`);
				} catch (error) {
					console.warn(
						`Could not initialize FileStorageService for project ${projectId}:`,
						error,
					);
				}
			}

			if (fileStorageService.isConnectedToProject(actualProjectId)) {
				try {
					const allFiles = await fileStorageService.getAllFiles(false);
					const fileFiles = allFiles.filter((f) => f.type === "file");

					for (const file of fileFiles) {
						if (file.content) {
							// Process the file to remove comments
							const processedFile = fileCommentProcessor.processFile(file);

							const cleanPath = file.path.startsWith("/")
								? file.path.slice(1)
								: file.path;
							const exportPath = `${projectPath}/${cleanPath}`;

							const dirPath = exportPath.substring(
								0,
								exportPath.lastIndexOf("/"),
							);
							if (dirPath && dirPath !== projectPath) {
								await adapter.createDirectory(dirPath);
							}

							await adapter.writeFile(exportPath, processedFile.content!);
							filesExported = true;
						}
					}
				} catch (error) {
					console.error(
						`Error exporting files from FileStorageService for project ${projectId}:`,
						error,
					);
				}
			}

			// Fallback to serialized data if live service didn't work or no files were exported
			if (!filesExported && projectData.files && projectData.files.length > 0) {
				try {
					for (const file of projectData.files) {
						if (file.type === "file") {
							const content = projectData.fileContents.get(file.path);
							if (content) {
								// Clean the content using FileCommentProcessor
								const cleanedContent =
									fileCommentProcessor.cleanContent(content);

								const cleanPath = file.path.startsWith("/")
									? file.path.slice(1)
									: file.path;
								const exportPath = `${projectPath}/${cleanPath}`;

								const dirPath = exportPath.substring(
									0,
									exportPath.lastIndexOf("/"),
								);
								if (dirPath && dirPath !== projectPath) {
									await adapter.createDirectory(dirPath);
								}

								await adapter.writeFile(exportPath, cleanedContent);
								filesExported = true;
							}
						}
					}
				} catch (error) {
					console.error(
						`Error exporting files from serialized data for project ${projectId}:`,
						error,
					);
				}
			}

			// If still no files exported, log a warning
			if (!filesExported) {
				console.warn(
					`No files were exported for project ${projectData.metadata.name}. The project folder will be empty.`,
				);
			}
		}
	}

	async importAccount(file: File): Promise<void> {
		try {
			const zipAdapter = new ZipAdapter();
			await zipAdapter.loadFromBlob(file);

			const unifiedData =
				await this.fileSystemManager.readUnifiedStructure(zipAdapter);

			if (!this.unifiedService.validateStructure(unifiedData)) {
				throw new Error("Invalid export file format");
			}

			const isAccountExport =
				unifiedData.manifest.mode === "export" &&
				unifiedData.account &&
				unifiedData.projects.length > 0;

			let importedUser = null;
			if (isAccountExport) {
				importedUser = await this.importUserData(unifiedData.account);
			}

			await this.importProjectsData(unifiedData.projects, importedUser);

			await this.dataSerializer.deserializeToIndexedDB(unifiedData);

			if (importedUser) {
				await this.authenticateImportedUser(importedUser);
			}
		} catch (error) {
			console.error("Error importing account:", error);
			throw new Error("Failed to import account data");
		}
	}

	private async importUserData(userData: any): Promise<any> {
		try {
			const existingUser = await authService.getUserById(userData.id);

			if (existingUser) {
				console.warn(
					`User ${userData.username} already exists - skipping user import`,
				);
				return existingUser;
			}

			const importedUser = await this.createUserFromImport(userData);

			console.log(`Successfully imported user: ${userData.username}`);
			return importedUser;
		} catch (error) {
			console.error("Error importing user data:", error);
			console.warn(
				"User import failed - projects will be imported for current user",
			);
			return null;
		}
	}

	private async createUserFromImport(userData: any): Promise<any> {
		const authDb =
			(await authService.db) ||
			(await authService.initialize().then(() => authService.db));

		if (!authDb) {
			throw new Error("Could not access auth database");
		}

		const userToImport = {
			id: userData.id,
			username: userData.username,
			name: userData.name || "",
			color: userData.color || "",
			colorLight: userData.colorLight || "",
			passwordHash: userData.passwordHash,
			email: userData.email,
			createdAt: userData.createdAt,
			lastLogin: Date.now(),
		};

		await authDb.put("users", userToImport);

		console.log(`Successfully imported user: ${userData.username}`);
		return userToImport;
	}

	private async authenticateImportedUser(user: any): Promise<void> {
		const authenticatedUser = await authService.setCurrentUser(user.id);

		if (!authenticatedUser) {
			throw new Error("Failed to authenticate imported user");
		}

		console.log(`Successfully authenticated imported user: ${user.username}`);
	}

	private async importProjectsData(
		projects: any[],
		importedUser?: any,
	): Promise<void> {
		let targetUser = authService.getCurrentUser();

		if (!targetUser && importedUser) {
			targetUser = importedUser;
		}

		if (!targetUser) {
			throw new Error(
				"No user available for project import. Please log in first.",
			);
		}

		for (const projectData of projects) {
			const existingProject = await authService.getProjectById(projectData.id);

			if (!existingProject) {
				await this.createProjectDirectly(projectData, targetUser.id);

				console.log(
					`Imported project: ${projectData.name} for user: ${targetUser.username}`,
				);
			} else {
				if (
					projectData.exportedAt &&
					projectData.exportedAt > existingProject.updatedAt
				) {
					await authService.updateProject({
						...existingProject,
						name: projectData.name,
						description: projectData.description,
						tags: projectData.tags,
						isFavorite: projectData.isFavorite,
					});

					console.log(`Updated existing project: ${projectData.name}`);
				}
			}
		}
	}

	private async createProjectDirectly(
		projectData: any,
		ownerId: string,
	): Promise<void> {
		const authDb =
			(await authService.db) ||
			(await authService.initialize().then(() => authService.db));

		if (!authDb) {
			throw new Error("Could not access auth database");
		}

		const now = Date.now();
		const newProject = {
			id: projectData.id,
			name: projectData.name,
			description: projectData.description,
			docUrl: projectData.docUrl,
			createdAt: projectData.createdAt,
			updatedAt: now,
			ownerId: ownerId,
			tags: projectData.tags,
			isFavorite: projectData.isFavorite,
		};

		await authDb.put("projects", newProject);

		console.log(
			`Created project directly: ${projectData.name} with docUrl: ${projectData.docUrl}`,
		);
	}
}

export const accountExportService = new AccountExportService();
