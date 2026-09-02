// src/services/DiskHandleStore.ts
const STORE_NAME = 'handles';

export class DiskHandleStore<T extends FileSystemHandle> {
	private db: IDBDatabase | null = null;

	constructor(private readonly dbName: string) {}

	private async getDb(): Promise<IDBDatabase> {
		if (this.db) return this.db;
		this.db = await new Promise<IDBDatabase>((resolve, reject) => {
			const request = indexedDB.open(this.dbName, 1);
			request.onupgradeneeded = () =>
				request.result.createObjectStore(STORE_NAME);
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
		return this.db;
	}

	async save(scope: string, handle: T): Promise<void> {
		const db = await this.getDb();
		await new Promise<void>((resolve, reject) => {
			const tx = db.transaction(STORE_NAME, 'readwrite');
			tx.objectStore(STORE_NAME).put(handle, scope);
			tx.oncomplete = () => resolve();
			tx.onerror = () => reject(tx.error);
		});
	}

	async load(scope: string): Promise<T | null> {
		const db = await this.getDb();
		return new Promise((resolve, reject) => {
			const request = db
				.transaction(STORE_NAME, 'readonly')
				.objectStore(STORE_NAME)
				.get(scope);
			request.onsuccess = () => resolve(request.result ?? null);
			request.onerror = () => reject(request.error);
		});
	}

	async savePending(scope: string): Promise<void> {
		const db = await this.getDb();
		await new Promise<void>((resolve, reject) => {
			const tx = db.transaction(STORE_NAME, 'readwrite');
			tx.objectStore(STORE_NAME).put(true, `${scope}:pending`);
			tx.oncomplete = () => resolve();
			tx.onerror = () => reject(tx.error);
		});
	}

	async isPending(scope: string): Promise<boolean> {
		const db = await this.getDb();
		return new Promise((resolve, reject) => {
			const request = db
				.transaction(STORE_NAME, 'readonly')
				.objectStore(STORE_NAME)
				.get(`${scope}:pending`);
			request.onsuccess = () => resolve(Boolean(request.result));
			request.onerror = () => reject(request.error);
		});
	}

	async clearPending(scope: string): Promise<void> {
		await this.clear(`${scope}:pending`);
	}

	async clear(scope: string): Promise<void> {
		const db = await this.getDb();
		await new Promise<void>((resolve, reject) => {
			const tx = db.transaction(STORE_NAME, 'readwrite');
			tx.objectStore(STORE_NAME).delete(scope);
			tx.oncomplete = () => resolve();
			tx.onerror = () => reject(tx.error);
		});
	}
}

export async function ensurePermission(
	handle: FileSystemHandle,
	mode: 'read' | 'readwrite',
	prompt = true,
): Promise<boolean> {
	try {
		const options = { mode } as const;
		let permission = await (handle as any).queryPermission(options);
		if (permission !== 'granted' && prompt) {
			permission = await (handle as any).requestPermission(options);
		}
		return permission === 'granted';
	} catch {
		return false;
	}
}
