// src/utils/dbDeleteUtils.ts
import { IndexeddbPersistence } from 'y-indexeddb';
import * as Y from 'yjs';

import { fileStorageService } from '../services/FileStorageService';
import { collabService } from '../services/CollabService';
import type { Project } from '../types/projects';
import { createNamedLogger } from '@/logging';

const moduleLog = createNamedLogger('dbDeleteUtils');

const PROJECT_DB_PREFIX = 'texlyre-project-';
const TYPESETTER_CACHE_PREFIX = 'EM_FS_';

export type ReclaimableKind = 'typesetter-cache' | 'orphan-project';

export interface ReclaimableDatabase {
	name: string;
	kind: ReclaimableKind;
}

export async function deleteDatabase(dbName: string): Promise<void> {
	return new Promise((resolve, reject) => {
		const deleteRequest = indexedDB.deleteDatabase(dbName);

		deleteRequest.onsuccess = () => {
			moduleLog.info(`Successfully deleted database: ${dbName}`);
			resolve();
		};

		deleteRequest.onerror = () => {
			moduleLog.error(`Failed to delete database: ${dbName}`);
			reject(new Error(`Failed to delete database: ${dbName}`));
		};

		deleteRequest.onblocked = () => {
			moduleLog.warn(`Database deletion blocked: ${dbName}. Retrying...`);
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
}

export async function closeActiveConnections(projectId: string): Promise<void> {
	try {
		if (fileStorageService.isConnectedToProject(projectId)) {
			fileStorageService.cleanup();
			moduleLog.info(
				`Closed FileStorageService connection for project: ${projectId}`,
			);
		}
		collabService.disconnectAll(projectId);
	} catch (error) {
		moduleLog.warn('Error closing FileStorageService connection:', error);
	}
}

export async function cleanupProjectDatabases(project: Project): Promise<void> {
	try {
		const projectId = project.docUrl.startsWith('yjs:')
			? project.docUrl.slice(4)
			: project.docUrl;

		const dbName = `${PROJECT_DB_PREFIX}${projectId}`;

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
				moduleLog.warn(`Failed to delete database ${collectionName}:`, error);
			}
		}

		moduleLog.info(`Cleaned up databases for project: ${project.name}`);
	} catch (error) {
		moduleLog.error('Error cleaning up project databases:', error);
	}
}

export async function cleanupDocumentDatabases(
	projectId: string,
): Promise<void> {
	try {
		const dbName = `${PROJECT_DB_PREFIX}${projectId}`;
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
						moduleLog.warn(
							`Failed to delete document database ${docCollection}:`,
							error,
						);
					}
				}
			}
		}
	} catch (error) {
		moduleLog.error('Error cleaning up document databases:', error);
	}
}

export function projectDbNames(docUrl: string): string[] {
	const projectId = docUrl.startsWith('yjs:') ? docUrl.slice(4) : docUrl;
	const dbName = `${PROJECT_DB_PREFIX}${projectId}`;
	return [
		`${dbName}-yjs_metadata`,
		`${dbName}-chat`,
		`${dbName}-file_sync`,
		dbName,
	];
}

export async function listReclaimableDatabases(
	projects: Project[],
): Promise<ReclaimableDatabase[]> {
	if (typeof indexedDB.databases !== 'function') return [];

	let names: string[];
	try {
		names = (await indexedDB.databases())
			.map((database) => database.name ?? '')
			.filter(Boolean);
	} catch (error) {
		moduleLog.warn('Failed to enumerate databases:', error);
		return [];
	}

	const currentProjectId = fileStorageService.getCurrentProjectId();
	const activePrefixes = projects
		.map((project) =>
			project.docUrl.startsWith('yjs:')
				? project.docUrl.slice(4)
				: project.docUrl,
		)
		.concat(currentProjectId ? [currentProjectId] : [])
		.map((projectId) => `${PROJECT_DB_PREFIX}${projectId}`);

	return names.reduce<ReclaimableDatabase[]>((reclaimable, name) => {
		if (name.startsWith(TYPESETTER_CACHE_PREFIX)) {
			reclaimable.push({ name, kind: 'typesetter-cache' });
		} else if (
			name.startsWith(PROJECT_DB_PREFIX) &&
			!activePrefixes.some((prefix) => name.startsWith(prefix))
		) {
			reclaimable.push({ name, kind: 'orphan-project' });
		}

		return reclaimable;
	}, []);
}

export async function deleteDatabases(names: string[]): Promise<number> {
	let deleted = 0;

	for (const name of names) {
		try {
			await deleteDatabase(name);
			deleted += 1;
		} catch (error) {
			moduleLog.warn(`Failed to delete database ${name}:`, error);
		}
	}

	return deleted;
}
