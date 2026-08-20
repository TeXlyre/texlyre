// src/utils/storageUsageUtils.ts
import { createNamedLogger } from '@/logging';
import type { Project } from '../types/projects';

const moduleLog = createNamedLogger('storageUsageUtils');

const PROJECT_DB_PREFIX = 'texlyre-project-';
const TYPESETTER_CACHE_DB_PREFIXES = ['EM_FS_'];
const TYPESETTER_CACHE_DB_NAMES = new Set(['EM_PRELOAD_CACHE']);
const TYPESETTER_CACHE_PATH_PREFIX = '/.texlyre_cache/';
const APP_DATA_DB_NAMES = new Set(['texlyre-auth', 'texlyre-share-target']);
const TYPST_PACKAGE_HOST = 'packages.typst.org';
const TYPST_PACKAGE_PATH_PREFIX = '/preview/';

export type DetailedStorageSegmentId =
	| 'projects-documents'
	| 'typesetter-cache'
	| 'leftover-projects'
	| 'app-data'
	| 'offline-cache'
	| 'storage-overhead'
	| 'other';

export interface DetailedStorageUsageSegment {
	id: DetailedStorageSegmentId;
	bytes: number;
}

type Breakdown = Record<DetailedStorageSegmentId, number>;
type Measurement = { data: number; cache: number };

const SEGMENT_IDS: DetailedStorageSegmentId[] = [
	'projects-documents',
	'typesetter-cache',
	'leftover-projects',
	'app-data',
	'offline-cache',
	'storage-overhead',
	'other',
];

const INDEXED_DB_IDS = SEGMENT_IDS.filter(
	(id) => id !== 'offline-cache' && id !== 'storage-overhead',
);

const encoder = new TextEncoder();

const emptyBreakdown = (): Breakdown =>
	Object.fromEntries(SEGMENT_IDS.map((id) => [id, 0])) as Breakdown;

const projectId = (project: Project): string => {
	const value = project.docUrl ?? '';
	return value.startsWith('yjs:') ? value.slice(4) : value;
};

const projectBase = (id: string): string => `${PROJECT_DB_PREFIX}${id}`;
const belongsToProject = (name: string, base: string): boolean =>
	name === base || name.startsWith(`${base}-`);

export function isTypesetterCacheDatabase(name: string): boolean {
	return (
		TYPESETTER_CACHE_DB_NAMES.has(name) ||
		TYPESETTER_CACHE_DB_PREFIXES.some((prefix) => name.startsWith(prefix))
	);
}

export function isTypstPackageRequest(request: Request | string): boolean {
	try {
		const url = new URL(typeof request === 'string' ? request : request.url);
		return (
			url.hostname === TYPST_PACKAGE_HOST &&
			url.pathname.startsWith(TYPST_PACKAGE_PATH_PREFIX)
		);
	} catch {
		return false;
	}
}

function estimateValueBytes(
	value: unknown,
	seen = new WeakSet<object>(),
): number {
	if (value == null) return 0;
	if (typeof value === 'string') return encoder.encode(value).byteLength;
	if (typeof value === 'number' || typeof value === 'bigint') return 8;
	if (typeof value === 'boolean') return 1;
	if (typeof value !== 'object') return 0;

	if (value instanceof ArrayBuffer) return value.byteLength;
	if (
		typeof SharedArrayBuffer !== 'undefined' &&
		value instanceof SharedArrayBuffer
	)
		return value.byteLength;
	if (ArrayBuffer.isView(value)) return value.byteLength;
	if (typeof Blob !== 'undefined' && value instanceof Blob) return value.size;
	if (value instanceof Date) return 8;
	if (seen.has(value)) return 0;

	seen.add(value);

	if (Array.isArray(value)) {
		return value.reduce((sum, item) => sum + estimateValueBytes(item, seen), 0);
	}

	if (value instanceof Map) {
		let bytes = 0;
		for (const [key, item] of value) {
			bytes += estimateValueBytes(key, seen) + estimateValueBytes(item, seen);
		}
		return bytes;
	}

	if (value instanceof Set) {
		let bytes = 0;
		for (const item of value) bytes += estimateValueBytes(item, seen);
		return bytes;
	}

	return Object.entries(value as Record<string, unknown>).reduce(
		(sum, [key, item]) =>
			sum + encoder.encode(key).byteLength + estimateValueBytes(item, seen),
		0,
	);
}

function cachePath(value: unknown): boolean {
	return (
		typeof value === 'object' &&
		value !== null &&
		'path' in value &&
		String((value as { path?: unknown }).path ?? '').startsWith(
			TYPESETTER_CACHE_PATH_PREFIX,
		)
	);
}

async function measureStore(
	db: IDBDatabase,
	storeName: string,
	splitCache = false,
): Promise<Measurement> {
	return new Promise((resolve) => {
		let data = 0;
		let cache = 0;
		let settled = false;

		const finish = () => {
			if (!settled) {
				settled = true;
				resolve({ data, cache });
			}
		};

		try {
			const tx = db.transaction(storeName, 'readonly');
			const request = tx.objectStore(storeName).openCursor();

			request.onsuccess = () => {
				const cursor = request.result;
				if (!cursor) return;

				const bytes =
					estimateValueBytes(cursor.primaryKey) +
					estimateValueBytes(cursor.value);
				if (splitCache && cachePath(cursor.value)) cache += bytes;
				else data += bytes;
				cursor.continue();
			};

			request.onerror = finish;
			tx.oncomplete = finish;
			tx.onerror = finish;
			tx.onabort = finish;
		} catch {
			finish();
		}
	});
}

async function openExistingDatabase(name: string): Promise<IDBDatabase | null> {
	return new Promise((resolve) => {
		try {
			const request = indexedDB.open(name);
			let created = false;

			request.onupgradeneeded = (event) => {
				created = event.oldVersion === 0;
			};
			request.onerror = request.onblocked = () => resolve(null);
			request.onsuccess = () => {
				if (!created) return resolve(request.result);
				request.result.close();
				void indexedDB.deleteDatabase(name);
				resolve(null);
			};
		} catch {
			resolve(null);
		}
	});
}

async function measureDatabase(
	name: string,
	splitProjectCache = false,
): Promise<Measurement> {
	const db = await openExistingDatabase(name);
	if (!db) return { data: 0, cache: 0 };

	try {
		const result = { data: 0, cache: 0 };
		for (const storeName of Array.from(db.objectStoreNames)) {
			const measured = await measureStore(
				db,
				storeName,
				splitProjectCache && storeName === 'files',
			);
			result.data += measured.data;
			result.cache += measured.cache;
		}
		return result;
	} catch (error) {
		moduleLog.warn(`Failed to inspect database ${name}:`, error);
		return { data: 0, cache: 0 };
	} finally {
		db.close();
	}
}

async function databaseNames(): Promise<string[]> {
	if (
		typeof indexedDB === 'undefined' ||
		typeof indexedDB.databases !== 'function'
	)
		return [];

	return (await indexedDB.databases())
		.map(({ name }) => name ?? '')
		.filter(Boolean);
}

async function measureIndexedDb(
	projects: Project[],
	breakdown: Breakdown,
): Promise<void> {
	const bases = new Set(
		projects.map(projectId).filter(Boolean).map(projectBase),
	);

	for (const name of await databaseNames()) {
		if (isTypesetterCacheDatabase(name)) {
			breakdown['typesetter-cache'] += (await measureDatabase(name)).data;
			continue;
		}

		if (name.startsWith(PROJECT_DB_PREFIX)) {
			const activeBase = [...bases].find((base) =>
				belongsToProject(name, base),
			);
			if (!activeBase) {
				breakdown['leftover-projects'] += (await measureDatabase(name)).data;
				continue;
			}

			const measured = await measureDatabase(name, name === activeBase);
			breakdown['projects-documents'] += measured.data;
			breakdown['typesetter-cache'] += measured.cache;
			continue;
		}

		const bytes = (await measureDatabase(name)).data;
		breakdown[APP_DATA_DB_NAMES.has(name) ? 'app-data' : 'other'] += bytes;
	}
}

async function measureTypstPackageCache(): Promise<number> {
	if (typeof caches === 'undefined') return 0;

	let bytes = 0;
	try {
		for (const cacheName of await caches.keys()) {
			const cache = await caches.open(cacheName);
			for (const request of await cache.keys()) {
				if (!isTypstPackageRequest(request)) continue;

				const response = await cache.match(request);
				if (!response) continue;

				const length = Number(response.headers.get('content-length'));
				if (Number.isFinite(length) && length > 0) {
					bytes += length;
					continue;
				}

				try {
					bytes += (await response.clone().arrayBuffer()).byteLength;
				} catch {
					// Browser cache totals remain authoritative for unreadable entries.
				}
			}
		}
	} catch (error) {
		moduleLog.warn('Failed to measure Typst package cache:', error);
	}
	return bytes;
}

const sum = (breakdown: Breakdown, ids = SEGMENT_IDS): number =>
	ids.reduce((total, id) => total + breakdown[id], 0);

function scale(breakdown: Breakdown, factor: number, ids = SEGMENT_IDS): void {
	for (const id of ids) breakdown[id] *= factor;
}

function reconcile(
	breakdown: Breakdown,
	reported: number,
	ids: DetailedStorageSegmentId[],
	remainder: DetailedStorageSegmentId,
): void {
	const measured = sum(breakdown, ids);
	if (reported > 0 && measured > reported) {
		scale(breakdown, reported / measured, ids);
	} else if (reported > measured) {
		breakdown[remainder] += reported - measured;
	}
}

async function addCacheUsage(
	breakdown: Breakdown,
	reportedCaches: number,
): Promise<void> {
	if (reportedCaches <= 0) return;

	const typst = await measureTypstPackageCache();
	const contribution = Math.min(typst, reportedCaches);
	breakdown['typesetter-cache'] += contribution;
	breakdown['offline-cache'] += reportedCaches - contribution;
}

function toSegments(breakdown: Breakdown): DetailedStorageUsageSegment[] {
	const result: DetailedStorageUsageSegment[] = [];
	for (const id of SEGMENT_IDS) {
		const bytes = Math.round(breakdown[id]);
		if (bytes > 0) result.push({ id, bytes });
	}
	return result;
}

export async function estimateDetailedStorageUsage(
	projects: Project[],
): Promise<DetailedStorageUsageSegment[]> {
	if (
		typeof navigator === 'undefined' ||
		typeof navigator.storage?.estimate !== 'function'
	)
		return [];

	try {
		const estimate = await navigator.storage.estimate();
		const details = (
			estimate as StorageEstimate & { usageDetails?: Record<string, number> }
		).usageDetails;
		if (!details) return [];

		const breakdown = emptyBreakdown();

		await measureIndexedDb(projects, breakdown);
		reconcile(
			breakdown,
			details.indexedDB ?? 0,
			INDEXED_DB_IDS,
			'storage-overhead',
		);

		await addCacheUsage(breakdown, details.caches ?? 0);

		for (const [key, bytes] of Object.entries(details)) {
			if (key !== 'indexedDB' && key !== 'caches' && bytes > 0) {
				breakdown.other += bytes;
			}
		}

		reconcile(breakdown, estimate.usage ?? 0, SEGMENT_IDS, 'storage-overhead');
		return toSegments(breakdown);
	} catch (error) {
		moduleLog.warn('Failed to build detailed storage usage:', error);
		return [];
	}
}
