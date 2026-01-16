// src/services/ProjectImportService.ts
import { t } from '@/i18n';
import type { Project } from '../types/projects';
import { authService } from './AuthService';
import { UnifiedDataStructureService } from './DataStructureService';
import { ProjectDataService } from './ProjectDataService';
import {
	DirectoryAdapter,
	StorageAdapterService,
	ZipAdapter,
} from './StorageAdapterService';

export interface ImportableProject {
	id: string;
	name: string;
	description: string;
	originalOwnerId: string;
	lastModified: number;
	source: 'backup' | 'zip' | 'directory';
	sourcePath?: string;
}

export interface ImportOptions {
	makeCollaborator?: boolean;
	conflictResolution?: 'skip' | 'overwrite' | 'create-new';
}

export interface ImportResult {
	imported: string[];
	skipped: string[];
	errors: { projectId: string; error: string }[];
}

class ProjectImportService {
	private dataSerializer = new ProjectDataService();
	private fileSystemManager = new StorageAdapterService();
	private unifiedService = new UnifiedDataStructureService();

	private generateNewDocumentUrl(): string {
		const projectId =
			Math.random().toString(36).substring(2, 15) +
			Math.random().toString(36).substring(2, 15);
		return `yjs:${projectId}`;
	}

	private generateUniqueProjectName(
		baseName: string,
		existingNames: Set<string>,
	): string {
		let candidateName = `${baseName} (imported)`;
		let counter = 2;

		while (existingNames.has(candidateName)) {
			candidateName = `${baseName} (imported ${counter})`;
			counter++;
		}

		return candidateName;
	}

	async scanBackupDirectory(
		rootHandle: FileSystemDirectoryHandle,
	): Promise<ImportableProject[]> {
		const importableProjects: ImportableProject[] = [];

		try {
			const adapter = new DirectoryAdapter(rootHandle);

			if (!(await adapter.exists(this.unifiedService.getPaths().MANIFEST))) {
				return [];
			}

			const data = await this.fileSystemManager.readUnifiedStructure(adapter);

			if (!this.unifiedService.validateStructure(data)) {
				return [];
			}

			const currentUser = authService.getCurrentUser();
			if (!currentUser) return [];

			const existingProjects = await authService.getProjectsByUser(
				currentUser.id,
			);
			const existingProjectIds = new Set(existingProjects.map((p) => p.id));

			for (const project of data.projects) {
				if (!existingProjectIds.has(project.id)) {
					importableProjects.push({
						id: project.id,
						name: project.name,
						description: project.description,
						originalOwnerId: project.ownerId,
						lastModified:
							project.lastSync || project.exportedAt || project.updatedAt,
						source: 'backup',
					});
				}
			}
		} catch (error) {
			console.error('Error scanning backup directory:', error);
		}

		return importableProjects;
	}

	async scanZipFile(file: File): Promise<ImportableProject[]> {
		const importableProjects: ImportableProject[] = [];

		try {
			const zipAdapter = new ZipAdapter();
			await zipAdapter.loadFromBlob(file);

			if (!(await zipAdapter.exists(this.unifiedService.getPaths().MANIFEST))) {
				return [];
			}

			const data =
				await this.fileSystemManager.readUnifiedStructure(zipAdapter);

			if (!this.unifiedService.validateStructure(data)) {
				return [];
			}

			for (const project of data.projects) {
				importableProjects.push({
					id: project.id,
					name: project.name,
					description: project.description,
					originalOwnerId: project.ownerId,
					lastModified:
						project.lastSync || project.exportedAt || project.updatedAt,
					source: 'zip',
					sourcePath: file.name,
				});
			}
		} catch (error) {
			console.error('Error scanning zip file:', error);
		}

		return importableProjects;
	}

	async importFromBackup(
		rootHandle: FileSystemDirectoryHandle,
		projectIds: string[],
		options: ImportOptions = {},
	): Promise<ImportResult> {
		const result: ImportResult = { imported: [], skipped: [], errors: [] };

		try {
			const adapter = new DirectoryAdapter(rootHandle);
			const data = await this.fileSystemManager.readUnifiedStructure(adapter);

			await this.processImport(data, projectIds, options, result);
		} catch (error) {
			console.error('Error importing from backup:', error);
			projectIds.forEach((id) => {
				result.errors.push({
					projectId: id,
					error: error instanceof Error ? error.message : t('Unknown error'),
				});
			});
		}

		return result;
	}

	async importFromZip(
		file: File,
		projectIds: string[],
		options: ImportOptions = {},
	): Promise<ImportResult> {
		const result: ImportResult = { imported: [], skipped: [], errors: [] };

		try {
			const zipAdapter = new ZipAdapter();
			await zipAdapter.loadFromBlob(file);
			const data =
				await this.fileSystemManager.readUnifiedStructure(zipAdapter);

			await this.processImport(data, projectIds, options, result);
		} catch (error) {
			console.error('Error importing from zip:', error);
			projectIds.forEach((id) => {
				result.errors.push({
					projectId: id,
					error: error instanceof Error ? error.message : t('Unknown error'),
				});
			});
		}

		return result;
	}

	private async processImport(
		data: any,
		projectIds: string[],
		options: ImportOptions,
		result: ImportResult,
	): Promise<void> {
		const currentUser = authService.getCurrentUser();
		if (!currentUser) throw new Error(t('No authenticated user'));

		const existingProjects = await authService.getProjectsByUser(
			currentUser.id,
		);
		const existingProjectNames = new Set(existingProjects.map((p) => p.name));

		for (const projectId of projectIds) {
			try {
				const projectMetadata = data.projects.find(
					(p: any) => p.id === projectId,
				);
				if (!projectMetadata) {
					result.errors.push({
						projectId,
						error: 'Project not found in source',
					});
					continue;
				}

				let finalProjectId = projectId;
				let finalProjectName = projectMetadata.name;
				let finalDocUrl = projectMetadata.docUrl;
				let shouldCreateNewProject = true;

				if (existingProjects.some((p) => p.id === projectId)) {
					if (options.conflictResolution === 'skip') {
						result.skipped.push(projectId);
						continue;
					}
					if (options.conflictResolution === 'overwrite') {
						await authService.deleteProject(projectId);
						shouldCreateNewProject = true;
					} else if (options.conflictResolution === 'create-new') {
						finalProjectId = crypto.randomUUID();
						finalProjectName = this.generateUniqueProjectName(
							projectMetadata.name,
							existingProjectNames,
						);
						finalDocUrl = this.generateNewDocumentUrl();
						shouldCreateNewProject = true;
					}
				}

				if (shouldCreateNewProject) {
					const projectToCreate: Omit<
						Project,
						'id' | 'createdAt' | 'updatedAt' | 'ownerId'
					> = {
						name: finalProjectName,
						description: projectMetadata.description,
						type: projectMetadata.type || 'latex',
						docUrl: finalDocUrl,
						tags: projectMetadata.tags || [],
						isFavorite: false,
					};

					await this.createProjectDirectly(
						projectToCreate,
						finalProjectId,
						currentUser.id,
					);
					existingProjectNames.add(finalProjectName);
				}

				const projectDataToImport = data.projectData.get(projectId);
				if (projectDataToImport) {
					const updatedMetadata = {
						...projectDataToImport.metadata,
						id: finalProjectId,
						name: finalProjectName,
						docUrl: finalDocUrl,
					};

					await this.importProjectDataSafely(
						finalProjectId,
						finalDocUrl,
						updatedMetadata,
						projectDataToImport,
					);
				}

				result.imported.push(projectId);
			} catch (error) {
				result.errors.push({
					projectId,
					error: error instanceof Error ? error.message : t('Unknown error'),
				});
			}
		}
	}

	private async importProjectDataSafely(
		projectId: string,
		docUrl: string,
		metadata: any,
		projectData: any,
	): Promise<void> {
		const filteredData = {
			manifest: {
				version: '1.0.0',
				lastSync: Date.now(),
				mode: 'import' as const,
			},
			account: null,
			projects: [metadata],
			projectData: new Map([[projectId, projectData]]),
		};

		await this.dataSerializer.deserializeToIndexedDB(
			filteredData,
			projectId,
			docUrl,
		);
	}

	private async createProjectDirectly(
		projectData: Omit<Project, 'id' | 'createdAt' | 'updatedAt' | 'ownerId'>,
		projectId: string,
		ownerId: string,
	): Promise<void> {
		const authDb =
			(await authService.db) ||
			(await authService.initialize().then(() => authService.db));

		if (!authDb) {
			throw new Error(t('Could not access auth database'));
		}

		const now = Date.now();
		const newProject: Project = {
			id: projectId,
			name: projectData.name,
			description: projectData.description,
			type: projectData.type || 'latex',
			docUrl: projectData.docUrl,
			createdAt: now,
			updatedAt: now,
			ownerId: ownerId,
			tags: projectData.tags,
			isFavorite: projectData.isFavorite,
			skipPeerCheck: true,
		};

		await authDb.put('projects', newProject);
	}

	private async updateProjectCollaborators(
		projectId: string,
		collaboratorIds: string[],
	): Promise<void> {
		try {
			const project = await authService.getProjectById(projectId);
			if (project) {
				const updatedProject = {
					...project,
					collaboratorIds,
				} as Project & { collaboratorIds: string[] };
				await authService.updateProject(updatedProject);
			}
		} catch (error) {
			console.error('Error updating project collaborators:', error);
		}
	}
}

export const projectImportService = new ProjectImportService();
