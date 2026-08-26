// src/services/ProjectDataService.ts
import { openDB } from 'idb';
import { IndexeddbPersistence } from 'y-indexeddb';
import * as Y from 'yjs';

import { createNamedLogger } from '@/logging';
import type { User } from '../types/auth';
import type { FileNode } from '../types/files';
import type { Project, ProjectType, ProjectGroup } from '../types/projects';
import { getMimeType, isBinaryFile } from '../utils/fileUtils';
import { textFromYjsState } from '../utils/yjsUtils';
import { authService } from './AuthService';
import {
	type BackupLayoutService,
	type DocumentMetadata,
	type FileMetadata,
	type ProjectMetadata,
	UnifiedDataStructureService,
} from './BackupLayoutService';
import { collabService } from './CollabService';

const moduleLog = createNamedLogger('ProjectDataService');

export class ProjectDataService {
	private unifiedService = new UnifiedDataStructureService();

	async serializeUserData(userId: string): Promise<User> {
		const user = await authService.getUserById(userId);
		if (!user) throw new Error('User not found');

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
		mode: 'backup' | 'export',
		projectIds?: string[],
	): Promise<ProjectMetadata[]> {
		let projects: Project[];
		if (projectIds && projectIds.length > 0) {
			projects = [];
			for (const projectId of projectIds) {
				const specificProject = await authService.getProjectById(projectId);
				if (!specificProject) {
					moduleLog.warn(`Project ${projectId} not found, skipping`);
					continue;
				}
				if (specificProject.ownerId !== userId) {
					moduleLog.warn(
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

		const projectId = project.docUrl.startsWith('yjs:')
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
				metadataPersistence.once('synced', () => {
					clearTimeout(timeout);
					resolve();
				});
			});

			const dataMap = metadataDoc.getMap('data');
			const documentsArray = dataMap.get('documents') || [];

			if (Array.isArray(documentsArray)) {
				for (const doc of documentsArray) {
					if (!doc.id) continue;

					const docMetadata: DocumentMetadata = {
						id: doc.id,
						name: doc.name || `Document ${doc.id}`,
						createdAt: doc.createdAt,
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
							docPersistence.once('synced', () => {
								clearTimeout(timeout);
								resolve();
							});
						});

						const yjsState = Y.encodeStateAsUpdate(docYDoc);
						const readableContent = docYDoc.getText('codemirror').toString();

						documentContents.set(doc.id, {
							yjsState,
							readableContent,
						});

						docPersistence.destroy();
						docYDoc.destroy();
					} catch (error) {
						moduleLog.error(`Error serializing document ${doc.id}:`, error);
					}
				}
			}

			metadataPersistence.destroy();
			metadataDoc.destroy();
		} catch (error) {
			moduleLog.error('Error serializing project documents:', error);
		}

		return { documents, documentContents };
	}

	async serializeProjectFiles(
		project: Project,
		includeDeleted = false,
		includeTemporaryFiles = true,
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

		const { fileStoreService } = await import('./FileStoreService');
		const actualProjectId = project.docUrl.startsWith('yjs:')
			? project.docUrl.slice(4)
			: project.docUrl;

		if (!fileStoreService.isConnectedToProject(actualProjectId)) {
			await fileStoreService.initialize(`yjs:${actualProjectId}`);
		}

		try {
			let allFiles = await fileStoreService.getAllFiles(includeDeleted);

			if (!includeTemporaryFiles) {
				const { isTemporaryFile } = await import('../utils/fileUtils');
				allFiles = allFiles.filter((file) => !isTemporaryFile(file.path));
			}

			for (const file of allFiles) {
				const fileMetadata = this.unifiedService.convertFileToMetadata(file);

				if (file.isDeleted) {
					deletedFiles.push(fileMetadata);
				} else {
					files.push(fileMetadata);
					if (file.type === 'file' && file.content !== undefined) {
						fileContents.set(file.path, file.content);
					}
				}
			}
		} catch (error) {
			moduleLog.error('Error serializing project files:', error);
		}

		return { files, fileContents, deletedFiles };
	}

	async deserializeToIndexedDB(
		data: BackupLayoutService,
		newProjectId?: string,
		newDocUrl?: string,
	): Promise<void> {
		moduleLog.info('Starting deserialization to IndexedDB...');
		moduleLog.info(`Found ${data.projectData.size} projects to deserialize`);

		for (const [originalProjectId, projectData] of data.projectData) {
			const projectId = newProjectId || originalProjectId;
			const docUrl = newDocUrl || projectData.metadata.docUrl;

			moduleLog.info(
				`Processing project ${projectId}: ${projectData.metadata.name}`,
			);
			moduleLog.info(`  - DocUrl: ${docUrl}`);
			moduleLog.info(`  - Documents: ${projectData.documents.length}`);
			moduleLog.info(`  - Files: ${projectData.files.length}`);

			const actualProjectId = docUrl.startsWith('yjs:')
				? docUrl.slice(4)
				: docUrl;

			moduleLog.info(`  - Using project ID for DB: ${actualProjectId}`);

			await this.deserializeProjectFilesSafely(
				actualProjectId,
				projectData.files,
				projectData.fileContents,
			);
			await this.deserializeProjectDocuments(
				actualProjectId,
				projectData.documents,
				projectData.documentContents,
				projectData.metadata.name,
				projectData.metadata.description,
				projectData.metadata.type,
			);
		}

		moduleLog.info('Deserialization to IndexedDB completed');
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
		projectType?: ProjectType,
		projectGroup?: ProjectGroup,
	): Promise<void> {
		const dbName = `texlyre-project-${projectId}`;
		const metadataCollection = `${dbName}-yjs_metadata`;

		moduleLog.info(
			`Deserializing documents for project ${projectId} to database ${dbName} ...`,
		);

		try {
			const linkedContents = await this.getLinkedDocumentContents(projectId);

			for (const doc of documents) {
				const docContent = documentContents.get(doc.id) ?? {};
				documentContents.set(doc.id, docContent);

				const incoming =
					linkedContents.get(doc.id) ??
					docContent.readableContent ??
					(docContent.yjsState
						? textFromYjsState(docContent.yjsState)
						: undefined);

				if (incoming === undefined) continue;

				docContent.readableContent = incoming;

				await collabService.updateDocumentContent(
					projectId,
					doc.id,
					() => incoming,
				);
			}

			await this.createMetadataDocument(
				metadataCollection,
				documents,
				documentContents,
				projectName,
				projectDescription,
				projectType,
				projectGroup,
			);

			moduleLog.info(
				`Successfully deserialized ${documents.length} documents for project ${projectId}`,
			);
		} catch (error) {
			moduleLog.error('Error deserializing project documents:', error);
			throw error;
		}
	}

	private async getLinkedDocumentContents(
		projectId: string,
	): Promise<Map<string, string>> {
		const { fileStoreService } = await import('./FileStoreService');

		if (!fileStoreService.isConnectedToProject(projectId)) {
			await fileStoreService.initialize(`yjs:${projectId}`);
		}

		const linkedContents = new Map<string, string>();
		const files = await fileStoreService.getAllFiles(false, false, false);

		for (const file of files) {
			if (
				file.type !== 'file' ||
				!file.documentId ||
				file.content === undefined ||
				file.isBinary ||
				isBinaryFile(file.path)
			) {
				continue;
			}

			const content =
				typeof file.content === 'string'
					? file.content
					: file.content instanceof ArrayBuffer
						? new TextDecoder().decode(file.content)
						: undefined;

			if (content !== undefined) {
				linkedContents.set(file.documentId, content);
			}
		}

		return linkedContents;
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
		projectType?: ProjectType,
		projectGroup?: ProjectGroup,
	): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			try {
				const metadataDoc = new Y.Doc();
				const metadataPersistence = new IndexeddbPersistence(
					metadataCollection,
					metadataDoc,
				);

				metadataPersistence.once('synced', () => {
					metadataDoc.transact(() => {
						const dataMap = metadataDoc.getMap('data');

						const docsArray = documents.map((doc) => ({
							id: doc.id,
							name: doc.name,
							content: documentContents.get(doc.id)?.readableContent || '',
							createdAt: doc.createdAt,
						}));

						dataMap.set('documents', docsArray);
						dataMap.set('currentDocId', documents[0]?.id || '');
						dataMap.set('cursors', []);
						dataMap.set('chatMessages', []);

						if (projectName && projectDescription !== undefined) {
							dataMap.set('projectMetadata', {
								name: projectName,
								description: projectDescription,
								type: projectType || 'latex',
								group: projectGroup,
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

		const docId = projectId.startsWith('yjs:') ? projectId.slice(4) : projectId;

		try {
			// Import the file storage service
			const { fileStoreService } = await import('./FileStoreService');

			// Initialize the service for this project
			await fileStoreService.initialize(`yjs:${docId}`);

			const filesToStore = files.map((file) => {
				const content =
					file.type === 'file' ? fileContents.get(file.path) : undefined;

				return {
					id: file.id,
					name: file.name,
					path: file.path,
					type: file.type as 'file' | 'directory',
					createdAt: file.createdAt,
					lastModified: file.lastModified,
					size: file.size,
					mimeType: file.mimeType,
					isBinary: file.isBinary,
					documentId: file.documentId,
					content: content,
					isDeleted: false,
				};
			});

			await fileStoreService.batchStoreFiles(filesToStore, {
				showConflictDialog: false,
				preserveTimestamp: true,
				preserveDeletionStatus: false,
			});

			moduleLog.info(
				`Successfully imported ${files.length} files for project ${projectId} using fileStoreService`,
			);
		} catch (error) {
			moduleLog.error(
				'Error importing files via fileStoreService, falling back to direct DB access:',
				error,
			);

			// Fallback to direct database access if fileStoreService fails
			const dbName = `texlyre-project-${docId}`;
			const db = await openDB(dbName, 1, {
				upgrade(db) {
					if (!db.objectStoreNames.contains('files')) {
						const store = db.createObjectStore('files', { keyPath: 'id' });
						store.createIndex('path', 'path', { unique: false });
					}
				},
			});

			const filesToStore = files.map((file) => {
				const content =
					file.type === 'file' ? fileContents.get(file.path) : undefined;

				return {
					id: file.id,
					name: file.name,
					path: file.path,
					type: file.type,
					createdAt: file.createdAt ?? file.lastModified,
					lastModified: file.lastModified,
					size: file.size,
					mimeType: file.mimeType,
					isBinary: file.isBinary,
					documentId: file.documentId,
					content: content,
					isDeleted: false,
				};
			});

			const tx = db.transaction('files', 'readwrite');
			const store = tx.objectStore('files');

			await Promise.all(filesToStore.map((file) => store.put(file)));
			await tx.done;
			db.close();

			moduleLog.info(
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

		const { fileStoreService } = await import('./FileStoreService');

		await fileStoreService.initialize(`yjs:${projectId}`);

		const filesToStore: FileNode[] = files.map((file) => {
			const content =
				file.type === 'file' ? fileContents.get(file.path) : undefined;

			return {
				id: file.id,
				name: file.name,
				path: file.path,
				type: file.type,
				createdAt: file.createdAt,
				lastModified: file.lastModified,
				size: file.size || 0,
				mimeType: file.mimeType,
				isBinary: file.isBinary,
				documentId: file.documentId,
				content: content,
				isDeleted: false,
			};
		});

		await fileStoreService.batchStoreFiles(filesToStore, {
			showConflictDialog: false,
			preserveTimestamp: true,
			preserveDeletionStatus: false,
		});

		moduleLog.info(
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
		const fileMetadata: FileMetadata[] = data.files.map((file) => ({
			id: Math.random().toString(36).substring(2),
			name: file.path.split('/').pop() || 'unknown',
			path: file.path,
			type: 'file' as const,
			lastModified: Date.now(),
			size:
				typeof file.content === 'string'
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

		if (data.documents.length > 0) {
			moduleLog.info(
				`Importing ${data.documents.length} documents for project ${projectId}`,
			);
		}
	}
}
