// src/utils/dbDeleteUtils.ts
import { IndexeddbPersistence } from 'y-indexeddb';
import * as Y from 'yjs';

import { createNamedLogger } from '@/logging';
import { fileStoreService } from '../services/FileStoreService';
import { collabService } from '../services/CollabService';
import { quotaService } from '../services/QuotaService';
import type { Project } from '../types/projects';
import {
	isTypesetterCacheDatabase,
	isTypstPackageRequest,
} from './storageUsageUtils';

const moduleLog = createNamedLogger('dbDeleteUtils');

const PROJECT_DB_PREFIX = 'texlyre-project-';
const TYPESETTER_CACHE_PATH_PREFIX = '/.texlyre_cache/';
const FILES_STORE = 'files';
const PATH_INDEX = 'path';

export type ReclaimableKind = 'typesetter-cache' | 'orphan-project';

export interface ReclaimableDatabase {
	name: string;
	kind: ReclaimableKind;
}

type TypstCacheEntry = { cache: Cache; request: Request };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function projectId(docUrl: string): string {
	return docUrl.startsWith('yjs:') ? docUrl.slice(4) : docUrl;
}

function projectBaseName(docUrl: string): string {
	return `${PROJECT_DB_PREFIX}${projectId(docUrl)}`;
}

function belongsToProject(dbName: string, baseName: string): boolean {
	return dbName === baseName || dbName.startsWith(`${baseName}-`);
}

async function listDatabaseNames(): Promise<string[] | null> {
	if (typeof indexedDB.databases !== 'function') return null;

	try {
		return (await indexedDB.databases())
			.map((database) => database.name ?? '')
			.filter(Boolean);
	} catch (error) {
		moduleLog.warn('Failed to enumerate databases:', error);
		return null;
	}
}

function requestResult<T>(request: IDBRequest<T>, fallback: T): Promise<T> {
	return new Promise((resolve) => {
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => resolve(fallback);
	});
}

function withExistingDatabase<T>(
	dbName: string,
	fallback: T,
	operation: (db: IDBDatabase) => T | Promise<T>,
): Promise<T> {
	return new Promise((resolve) => {
		try {
			const request = indexedDB.open(dbName);
			request.onupgradeneeded = () => request.transaction?.abort();
			request.onerror = () => resolve(fallback);
			request.onsuccess = async () => {
				const db = request.result;
				try {
					resolve(await operation(db));
				} catch {
					resolve(fallback);
				} finally {
					db.close();
				}
			};
		} catch {
			resolve(fallback);
		}
	});
}

async function listCurrentProjectTypesetterCacheIds(): Promise<string[]> {
	if (!fileStoreService.getCurrentProjectId()) return [];

	try {
		return (await fileStoreService.getAllFiles(true, false, false))
			.filter((file) => file.path.startsWith(TYPESETTER_CACHE_PATH_PREFIX))
			.map((file) => file.id);
	} catch (error) {
		moduleLog.warn(
			'Failed to inspect current project typesetter cache:',
			error,
		);
		return [];
	}
}

async function listProjectTypesetterCacheKeys(
	dbName: string,
): Promise<IDBValidKey[]> {
	return withExistingDatabase(dbName, [], (db) => {
		if (!db.objectStoreNames.contains(FILES_STORE)) return [];

		const store = db
			.transaction(FILES_STORE, 'readonly')
			.objectStore(FILES_STORE);
		if (!store.indexNames.contains(PATH_INDEX)) return [];

		const range = IDBKeyRange.bound(
			TYPESETTER_CACHE_PATH_PREFIX,
			`${TYPESETTER_CACHE_PATH_PREFIX}\uffff`,
		);
		return requestResult(store.index(PATH_INDEX).getAllKeys(range), []);
	});
}

async function deleteProjectTypesetterCacheKeys(
	dbName: string,
	keys: IDBValidKey[],
): Promise<number> {
	if (keys.length === 0) return 0;

	return withExistingDatabase(dbName, 0, (db) => {
		const tx = db.transaction(FILES_STORE, 'readwrite');
		const store = tx.objectStore(FILES_STORE);
		for (const key of keys) store.delete(key);

		return new Promise<number>((resolve) => {
			tx.oncomplete = () => {
				quotaService.markStale();
				resolve(keys.length);
			};
			tx.onerror = tx.onabort = () => resolve(0);
		});
	});
}

async function listStoredProjectDatabases(
	projects: Project[],
): Promise<string[]> {
	const existing = await listDatabaseNames();
	if (!existing) return [];

	const existingSet = new Set(existing);
	const currentId = fileStoreService.getCurrentProjectId();
	const currentBase = currentId ? projectBaseName(currentId) : '';

	return [
		...new Set(
			projects
				.map((project) => projectBaseName(project.docUrl))
				.filter((dbName) => existingSet.has(dbName) && dbName !== currentBase),
		),
	];
}

async function listTypstPackageCacheEntries(): Promise<TypstCacheEntry[]> {
	if (typeof caches === 'undefined') return [];

	try {
		const entries: TypstCacheEntry[] = [];
		for (const cacheName of await caches.keys()) {
			const cache = await caches.open(cacheName);
			for (const request of await cache.keys()) {
				if (isTypstPackageRequest(request)) entries.push({ cache, request });
			}
		}
		return entries;
	} catch (error) {
		moduleLog.warn('Failed to inspect Typst package cache:', error);
		return [];
	}
}

export async function hasCurrentProjectTypesetterCache(): Promise<boolean> {
	return (await listCurrentProjectTypesetterCacheIds()).length > 0;
}

export async function deleteCurrentProjectTypesetterCache(): Promise<number> {
	const ids = await listCurrentProjectTypesetterCacheIds();
	if (ids.length === 0) return 0;

	await fileStoreService.batchDeleteFiles(ids, {
		showDeleteDialog: false,
		hardDelete: true,
	});
	return ids.length;
}

export async function hasProjectTypesetterCache(
	projects: Project[],
): Promise<boolean> {
	if (await hasCurrentProjectTypesetterCache()) return true;

	for (const dbName of await listStoredProjectDatabases(projects)) {
		if ((await listProjectTypesetterCacheKeys(dbName)).length > 0) return true;
	}
	return false;
}

export async function deleteProjectTypesetterCaches(
	projects: Project[],
): Promise<number> {
	let deleted = await deleteCurrentProjectTypesetterCache();

	for (const dbName of await listStoredProjectDatabases(projects)) {
		const keys = await listProjectTypesetterCacheKeys(dbName);
		deleted += await deleteProjectTypesetterCacheKeys(dbName, keys);
	}
	return deleted;
}

export async function hasTypstPackageCache(): Promise<boolean> {
	return (await listTypstPackageCacheEntries()).length > 0;
}

export async function deleteTypstPackageCache(): Promise<number> {
	let deleted = 0;

	for (const { cache, request } of await listTypstPackageCacheEntries()) {
		try {
			if (await cache.delete(request)) deleted += 1;
		} catch (error) {
			moduleLog.warn(
				`Failed to delete Typst package cache entry ${request.url}:`,
				error,
			);
		}
	}

	if (deleted > 0) quotaService.markStale();
	return deleted;
}

export function deleteDatabase(dbName: string): Promise<void> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.deleteDatabase(dbName);

		request.onsuccess = () => {
			moduleLog.info(`Successfully deleted database: ${dbName}`);
			quotaService.markStale();
			resolve();
		};
		request.onerror = () => {
			moduleLog.error(`Failed to delete database: ${dbName}`);
			reject(new Error(`Failed to delete database: ${dbName}`));
		};
		request.onblocked = () => {
			moduleLog.warn(`Database deletion blocked: ${dbName}. Retrying...`);
			setTimeout(() => void deleteDatabase(dbName).then(resolve, reject), 1000);
		};
	});
}

export async function closeActiveConnections(projectId: string): Promise<void> {
	try {
		const isCurrentProject =
			fileStoreService.getCurrentProjectId() === projectId;

		if (fileStoreService.isConnectedToProject(projectId)) {
			fileStoreService.cleanup();
			moduleLog.info(
				`Closed FileStoreService connection for project: ${projectId}`,
			);
		}

		if (isCurrentProject) fileStoreService.setProjectId('');
		collabService.disconnectAll(projectId);
	} catch (error) {
		moduleLog.warn('Error closing FileStoreService connection:', error);
	}
}

export async function cleanupProjectDatabases(project: Project): Promise<void> {
	try {
		const id = projectId(project.docUrl);
		await closeActiveConnections(id);

		const names = await listDatabaseNames();
		let databasesToDelete: string[];

		if (names) {
			const baseName = projectBaseName(id);
			databasesToDelete = names.filter((name) =>
				belongsToProject(name, baseName),
			);
		} else {
			await cleanupDocumentDatabases(id);
			databasesToDelete = projectDbNames(id);
		}

		await deleteDatabases(databasesToDelete);
		moduleLog.info(
			`Cleaned up ${databasesToDelete.length} databases for project: ${project.name}`,
		);
	} catch (error) {
		moduleLog.error('Error cleaning up project databases:', error);
	}
}

export async function cleanupDocumentDatabases(
	projectId: string,
): Promise<void> {
	try {
		const dbName = projectBaseName(projectId);
		const metadataDoc = new Y.Doc();
		const persistence = new IndexeddbPersistence(
			`${dbName}-yjs_metadata`,
			metadataDoc,
		);

		await new Promise<void>((resolve) => {
			const timeout = setTimeout(resolve, 2000);
			persistence.once('synced', () => {
				clearTimeout(timeout);
				resolve();
			});
		});

		const documents = metadataDoc.getMap('data').get('documents') || [];
		persistence.destroy();
		metadataDoc.destroy();
		await sleep(300);

		if (Array.isArray(documents)) {
			await deleteDatabases(
				documents
					.filter((doc) => doc?.id)
					.map((doc) => `${dbName}-yjs_${doc.id}`),
			);
		}
	} catch (error) {
		moduleLog.error('Error cleaning up document databases:', error);
	}
}

export function projectDbNames(docUrl: string): string[] {
	const dbName = projectBaseName(docUrl);
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
	const names = await listDatabaseNames();
	if (!names) return [];

	const activeProjects = projects.map((project) =>
		projectBaseName(project.docUrl),
	);

	const reclaimable: ReclaimableDatabase[] = [];
	for (const name of names) {
		if (isTypesetterCacheDatabase(name)) {
			reclaimable.push({ name, kind: 'typesetter-cache' });
		} else if (
			name.startsWith(PROJECT_DB_PREFIX) &&
			!activeProjects.some((baseName) => belongsToProject(name, baseName))
		) {
			reclaimable.push({ name, kind: 'orphan-project' });
		}
	}
	return reclaimable;
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
