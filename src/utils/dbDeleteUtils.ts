// src/utils/dbDeleteUtils.ts
import { IndexeddbPersistence } from 'y-indexeddb';
import * as Y from 'yjs';

import { fileStorageService } from '../services/FileStorageService';
import type { Project } from '../types/projects';

export const deleteDatabase = async (dbName: string): Promise<void> => {
	return new Promise((resolve, reject) => {
		const deleteRequest = indexedDB.deleteDatabase(dbName);

		deleteRequest.onsuccess = () => {
			console.log(`[dbDeleteUtils] Successfully deleted database: ${dbName}`);
			resolve();
		};

		deleteRequest.onerror = () => {
			console.error(`Failed to delete database: ${dbName}`);
			reject(new Error(`Failed to delete database: ${dbName}`));
		};

		deleteRequest.onblocked = () => {
			console.warn(`Database deletion blocked: ${dbName}. Retrying...`);
			setTimeout(async () => {
				try {
					await deleteDatabase(dbName);
					resolve();
				} catch (error) {
					reject(error);
				}
			}, 1000);
		};
	});
};

export const closeActiveConnections = async (
	projectId: string,
): Promise<void> => {
	try {
		if (fileStorageService.isConnectedToProject(projectId)) {
			fileStorageService.cleanup();
			console.log(
				`[dbDeleteUtils] Closed FileStorageService connection for project: ${projectId}`,
			);
		}
	} catch (error) {
		console.warn('Error closing FileStorageService connection:', error);
	}
};

export const cleanupProjectDatabases = async (
	project: Project,
): Promise<void> => {
	try {
		const projectId = project.docUrl.startsWith('yjs:')
			? project.docUrl.slice(4)
			: project.docUrl;

		const dbName = `texlyre-project-${projectId}`;

		await closeActiveConnections(projectId);
		await new Promise((resolve) => setTimeout(resolve, 500));

		const collectionsToDelete = [
			`${dbName}-yjs_metadata`,
			`${dbName}-chat`,
			`${dbName}-file_sync`,
			dbName,
		];

		if (project.docUrl) {
			await cleanupDocumentDatabases(projectId);
		}

		for (const collectionName of collectionsToDelete) {
			try {
				await deleteDatabase(collectionName);
			} catch (error) {
				console.warn(`Failed to delete database ${collectionName}:`, error);
			}
		}

		console.log(`[dbDeleteUtils] Cleaned up databases for project: ${project.name}`);
	} catch (error) {
		console.error('Error cleaning up project databases:', error);
	}
};

export const cleanupDocumentDatabases = async (
	projectId: string,
): Promise<void> => {
	try {
		const dbName = `texlyre-project-${projectId}`;
		const metadataCollection = `${dbName}-yjs_metadata`;

		const metadataDoc = new Y.Doc();
		const persistence = new IndexeddbPersistence(
			metadataCollection,
			metadataDoc,
		);

		await new Promise<void>((resolve) => {
			const timeout = setTimeout(() => resolve(), 2000);
			persistence.once('synced', () => {
				clearTimeout(timeout);
				resolve();
			});
		});

		const dataMap = metadataDoc.getMap('data');
		const documents = dataMap.get('documents') || [];

		persistence.destroy();
		metadataDoc.destroy();
		await new Promise((resolve) => setTimeout(resolve, 300));

		if (Array.isArray(documents)) {
			for (const doc of documents) {
				if (doc.id) {
					const docCollection = `${dbName}-yjs_${doc.id}`;
					try {
						await deleteDatabase(docCollection);
					} catch (error) {
						console.warn(
							`Failed to delete document database ${docCollection}:`,
							error,
						);
					}
				}
			}
		}
	} catch (error) {
		console.error('Error cleaning up document databases:', error);
	}
};
