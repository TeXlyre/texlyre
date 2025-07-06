// src/services/ProjectDataService.ts
import { openDB } from "idb";
import { IndexeddbPersistence } from "y-indexeddb";
import * as Y from "yjs";

import type { User } from "../types/auth";
import type { FileNode } from "../types/files";
import type { Project } from "../types/projects";
import { getMimeType, isBinaryFile } from "../utils/fileUtils";
import { authService } from "./AuthService";
import {
	type DataStructureService,
	type DocumentMetadata,
	type FileMetadata,
	type ProjectMetadata,
	UnifiedDataStructureService,
} from "./DataStructureService";

export class ProjectDataService {
	private unifiedService = new UnifiedDataStructureService();

	async serializeUserData(userId: string): Promise<User> {
		const user = await authService.getUserById(userId);
		if (!user) throw new Error("User not found");

		return {
			id: user.id,
			username: user.username,
			passwordHash: user.passwordHash,
			email: user.email,
			createdAt: user.createdAt,
			lastLogin: user.lastLogin,
			color: user.color,
			colorLight: user.colorLight,
		};
	}

	async serializeProjects(
		userId: string,
		mode: "backup" | "export",
		projectIds?: string[],
	): Promise<ProjectMetadata[]> {
		let projects;
		if (projectIds && projectIds.length > 0) {
			projects = [];
			for (const projectId of projectIds) {
				const specificProject = await authService.getProjectById(projectId);
				if (!specificProject) {
					console.warn(`Project ${projectId} not found, skipping`);
					continue;
				}
				if (specificProject.ownerId !== userId) {
					console.warn(
						`Project ${projectId} does not belong to user ${userId}, skipping`,
					);
					continue;
				}
				projects.push(specificProject);
			}
		} else {
			projects = await authService.getProjectsByUser(userId);
		}

		return projects.map((project) =>
			this.unifiedService.convertProjectToMetadata(project, mode),
		);
	}

	async serializeProjectDocuments(project: Project): Promise<{
		documents: DocumentMetadata[];
		documentContents: Map<
			string,
			{ yjsState?: Uint8Array; readableContent?: string }
		>;
	}> {
		const documents: DocumentMetadata[] = [];
		const documentContents = new Map<
			string,
			{ yjsState?: Uint8Array; readableContent?: string }
		>();

		if (!project.docUrl) {
			return { documents, documentContents };
		}

		const projectId = project.docUrl.startsWith("yjs:")
			? project.docUrl.slice(4)
			: project.docUrl;
		const dbName = `texlyre-project-${projectId}`;
		const metadataCollection = `${dbName}-yjs_metadata`;

		try {
			const metadataDoc = new Y.Doc();
			const metadataPersistence = new IndexeddbPersistence(
				metadataCollection,
				metadataDoc,
			);

			await new Promise<void>((resolve) => {
				const timeout = setTimeout(() => resolve(), 2000);
				metadataPersistence.once("synced", () => {
					clearTimeout(timeout);
					resolve();
				});
			});

			const dataMap = metadataDoc.getMap("data");
			const documentsArray = dataMap.get("documents") || [];

			if (Array.isArray(documentsArray)) {
				for (const doc of documentsArray) {
					if (!doc.id) continue;

					const docMetadata: DocumentMetadata = {
						id: doc.id,
						name: doc.name || `Document ${doc.id}`,
						lastModified: Date.now(),
						hasYjsState: true,
						hasReadableContent: true,
					};

					documents.push(docMetadata);

					const docCollection = `${dbName}-yjs_${doc.id}`;
					try {
						const docYDoc = new Y.Doc();
						const docPersistence = new IndexeddbPersistence(
							docCollection,
							docYDoc,
						);

						await new Promise<void>((resolve) => {
							const timeout = setTimeout(() => resolve(), 2000);
							docPersistence.once("synced", () => {
								clearTimeout(timeout);
								resolve();
							});
						});

						const yjsState = Y.encodeStateAsUpdate(docYDoc);
						const readableContent = docYDoc.getText("codemirror").toString();

						documentContents.set(doc.id, {
							yjsState,
							readableContent,
						});

						docPersistence.destroy();
						docYDoc.destroy();
					} catch (error) {
						console.error(`Error serializing document ${doc.id}:`, error);
					}
				}
			}

			metadataPersistence.destroy();
			metadataDoc.destroy();
		} catch (error) {
			console.error("Error serializing project documents:", error);
		}

		return { documents, documentContents };
	}

	async serializeProjectFiles(
		project: Project,
		includeDeleted = false,
	): Promise<{
		files: FileMetadata[];
		fileContents: Map<string, ArrayBuffer | string>;
		deletedFiles: FileMetadata[];
	}> {
		const files: FileMetadata[] = [];
		const deletedFiles: FileMetadata[] = [];
		const fileContents = new Map<string, ArrayBuffer | string>();

		if (!project.docUrl) {
			return { files, fileContents, deletedFiles };
		}

		const { fileStorageService } = await import("./FileStorageService");
		const actualProjectId = project.docUrl.startsWith("yjs:")
			? project.docUrl.slice(4)
			: project.docUrl;

		if (!fileStorageService.isConnectedToProject(actualProjectId)) {
			await fileStorageService.initialize(`yjs:${actualProjectId}`);
		}

		try {
			const allFiles = await fileStorageService.getAllFiles(includeDeleted);

			for (const file of allFiles) {
				const fileMetadata = this.unifiedService.convertFileToMetadata(file);

				if (file.isDeleted) {
					deletedFiles.push(fileMetadata);
				} else {
					files.push(fileMetadata);
					if (file.type === "file" && file.content !== undefined) {
						fileContents.set(file.path, file.content);
					}
				}
			}
		} catch (error) {
			console.error("Error serializing project files:", error);
		}

		return { files, fileContents, deletedFiles };
	}

	async deserializeToIndexedDB(
		data: DataStructureService,
		newProjectId?: string,
		newDocUrl?: string,
	): Promise<void> {
		console.log("Starting deserialization to IndexedDB...");
		console.log(`Found ${data.projectData.size} projects to deserialize`);

		for (const [originalProjectId, projectData] of data.projectData) {
			const projectId = newProjectId || originalProjectId;
			const docUrl = newDocUrl || projectData.metadata.docUrl;

			console.log(
				`Processing project ${projectId}: ${projectData.metadata.name}`,
			);
			console.log(`  - DocUrl: ${docUrl}`);
			console.log(`  - Documents: ${projectData.documents.length}`);
			console.log(`  - Files: ${projectData.files.length}`);

			const actualProjectId = docUrl.startsWith("yjs:")
				? docUrl.slice(4)
				: docUrl;

			console.log(`  - Using project ID for DB: ${actualProjectId}`);

			await this.deserializeProjectDocuments(
				actualProjectId,
				projectData.documents,
				projectData.documentContents,
				projectData.metadata.name,
				projectData.metadata.description,
			);
			await this.deserializeProjectFilesSafely(
				actualProjectId,
				projectData.files,
				projectData.fileContents,
			);
		}

		console.log("Deserialization to IndexedDB completed");
	}

	private async deserializeProjectDocuments(
		projectId: string,
		documents: DocumentMetadata[],
		documentContents: Map<
			string,
			{ yjsState?: Uint8Array; readableContent?: string }
		>,
		projectName?: string,
		projectDescription?: string,
	): Promise<void> {
		const dbName = `texlyre-project-${projectId}`;
		const metadataCollection = `${dbName}-yjs_metadata`;

		console.log(
			`Deserializing documents for project ${projectId} to database ${dbName}`,
		);

		try {
			// First, restore all individual document states
			for (const doc of documents) {
				const docContent = documentContents.get(doc.id);
				if (docContent?.yjsState) {
					const docCollection = `${dbName}-yjs_${doc.id}`;
					console.log(
						`Restoring document ${doc.id} to collection ${docCollection}`,
					);

					await this.restoreYjsDocument(docCollection, docContent.yjsState);
				}
			}

			// Then, create the metadata document
			await this.createMetadataDocument(
				metadataCollection,
				documents,
				documentContents,
				projectName,
				projectDescription,
			);

			console.log(
				`Successfully deserialized ${documents.length} documents for project ${projectId}`,
			);
		} catch (error) {
			console.error("Error deserializing project documents:", error);
		}
	}

	private async restoreYjsDocument(
		collection: string,
		yjsState: Uint8Array,
	): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			try {
				const docYDoc = new Y.Doc();

				// Apply the state before setting up persistence
				Y.applyUpdate(docYDoc, yjsState);

				const docPersistence = new IndexeddbPersistence(collection, docYDoc);

				// Wait for initial sync, then force a save
				docPersistence.once("synced", () => {
					// Force another transaction to ensure persistence
					docYDoc.transact(() => {
						// This empty transaction forces the persistence to save the applied state
					});

					setTimeout(() => {
						docPersistence.destroy();
						docYDoc.destroy();
						resolve();
					}, 1000);
				});
			} catch (error) {
				reject(error);
			}
		});
	}

	private async createMetadataDocument(
		metadataCollection: string,
		documents: DocumentMetadata[],
		documentContents: Map<
			string,
			{ yjsState?: Uint8Array; readableContent?: string }
		>,
		projectName?: string,
		projectDescription?: string,
	): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			try {
				const metadataDoc = new Y.Doc();
				const metadataPersistence = new IndexeddbPersistence(
					metadataCollection,
					metadataDoc,
				);

				metadataPersistence.once("synced", () => {
					metadataDoc.transact(() => {
						const dataMap = metadataDoc.getMap("data");

						const docsArray = documents.map((doc) => ({
							id: doc.id,
							name: doc.name,
							content: documentContents.get(doc.id)?.readableContent || "",
						}));

						dataMap.set("documents", docsArray);
						dataMap.set("currentDocId", documents[0]?.id || "");
						dataMap.set("cursors", []);
						dataMap.set("chatMessages", []);

						if (projectName && projectDescription !== undefined) {
							dataMap.set("projectMetadata", {
								name: projectName,
								description: projectDescription,
							});
						}
					});

					setTimeout(() => {
						metadataPersistence.destroy();
						metadataDoc.destroy();
						resolve();
					}, 1000);
				});
			} catch (error) {
				reject(error);
			}
		});
	}

	private async deserializeProjectFiles(
		projectId: string,
		files: FileMetadata[],
		fileContents: Map<string, ArrayBuffer | string>,
	): Promise<void> {
		if (files.length === 0) return;

		const docId = projectId.startsWith("yjs:") ? projectId.slice(4) : projectId;

		try {
			// Import the file storage service
			const { fileStorageService } = await import("./FileStorageService");

			// Initialize the service for this project
			await fileStorageService.initialize(`yjs:${docId}`);

			const filesToStore = files.map((file) => {
				const content =
					file.type === "file" ? fileContents.get(file.path) : undefined;

				return {
					id: file.id,
					name: file.name,
					path: file.path,
					type: file.type as "file" | "directory",
					lastModified: file.lastModified,
					size: file.size,
					mimeType: file.mimeType,
					isBinary: file.isBinary,
					documentId: file.documentId,
					content: content,
					isDeleted: false,
				};
			});

			// Use batchStoreFiles with conflict resolution disabled for import
			await fileStorageService.batchStoreFiles(filesToStore, {
				showConflictDialog: false,
				preserveTimestamp: true,
				preserveDeletionStatus: false,
			});

			console.log(
				`Successfully imported ${files.length} files for project ${projectId} using fileStorageService`,
			);
		} catch (error) {
			console.error(
				"Error importing files via fileStorageService, falling back to direct DB access:",
				error,
			);

			// Fallback to direct database access if fileStorageService fails
			const dbName = `texlyre-project-${docId}`;
			const db = await openDB(dbName, 1, {
				upgrade(db) {
					if (!db.objectStoreNames.contains("files")) {
						const store = db.createObjectStore("files", { keyPath: "id" });
						store.createIndex("path", "path", { unique: false });
					}
				},
			});

			const filesToStore = files.map((file) => {
				const content =
					file.type === "file" ? fileContents.get(file.path) : undefined;

				return {
					id: file.id,
					name: file.name,
					path: file.path,
					type: file.type,
					lastModified: file.lastModified,
					size: file.size,
					mimeType: file.mimeType,
					isBinary: file.isBinary,
					documentId: file.documentId,
					content: content,
					isDeleted: false,
				};
			});

			const tx = db.transaction("files", "readwrite");
			const store = tx.objectStore("files");

			await Promise.all(filesToStore.map((file) => store.put(file)));
			await tx.done;
			db.close();

			console.log(
				`Successfully imported ${files.length} files for project ${projectId} via fallback`,
			);
		}
	}

	private async deserializeProjectFilesSafely(
		projectId: string,
		files: FileMetadata[],
		fileContents: Map<string, ArrayBuffer | string>,
	): Promise<void> {
		if (files.length === 0) return;

		const { fileStorageService } = await import("./FileStorageService");

		await fileStorageService.initialize(`yjs:${projectId}`);

		const filesToStore: FileNode[] = files.map((file) => {
			const content =
				file.type === "file" ? fileContents.get(file.path) : undefined;

			return {
				id: file.id,
				name: file.name,
				path: file.path,
				type: file.type,
				lastModified: file.lastModified,
				size: file.size || 0,
				mimeType: file.mimeType,
				isBinary: file.isBinary,
				documentId: file.documentId,
				content: content,
				isDeleted: false,
			};
		});

		await fileStorageService.batchStoreFiles(filesToStore, {
			showConflictDialog: false,
			preserveTimestamp: true,
			preserveDeletionStatus: false,
		});

		console.log(
			`Successfully deserialized ${files.length} files for project ${projectId}`,
		);
	}

	async importProjectData(
		projectId: string,
		data: {
			documents: { id: string; content: string }[];
			files: { path: string; content: string | ArrayBuffer }[];
		},
	): Promise<void> {
		// Convert the simplified format to proper metadata format
		const fileMetadata: FileMetadata[] = data.files.map((file) => ({
			id: Math.random().toString(36).substring(2), // Generate ID if not provided
			name: file.path.split("/").pop() || "unknown",
			path: file.path,
			type: "file" as const,
			lastModified: Date.now(),
			size:
				typeof file.content === "string"
					? file.content.length
					: file.content.byteLength,
			mimeType: getMimeType(file.path),
			isBinary: isBinaryFile(file.path),
		}));

		const fileContents = new Map<string, ArrayBuffer | string>();
		data.files.forEach((file) => {
			fileContents.set(file.path, file.content);
		});

		await this.deserializeProjectFiles(projectId, fileMetadata, fileContents);

		// Handle documents if needed
		if (data.documents.length > 0) {
			console.log(
				`Importing ${data.documents.length} documents for project ${projectId}`,
			);
			// Documents are handled separately by the existing document deserialization
		}
	}
}
