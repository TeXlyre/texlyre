// src/services/ShareTargetService.ts
import { openDB } from 'idb';

const DB_NAME = 'texlyre-share-target';
const STORE_NAME = 'pending-shares';
const DB_VERSION = 1;
const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000;

export interface PendingShare {
    id: string;
    files: PendingShareFile[];
    receivedAt: number;
}

export interface PendingShareFile {
    name: string;
    type: string;
    buffer: ArrayBuffer;
}

async function getDb() {
    return openDB(DB_NAME, DB_VERSION, {
        upgrade(db) {
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
        },
    });
}

async function getPendingShare(): Promise<PendingShare | null> {
    try {
        const db = await getDb();
        const all: PendingShare[] = await db.getAll(STORE_NAME);
        if (all.length === 0) return null;

        all.sort((a, b) => b.receivedAt - a.receivedAt);
        return all[0];
    } catch {
        return null;
    }
}

async function clearPendingShare(id: string): Promise<void> {
    try {
        const db = await getDb();
        await db.delete(STORE_NAME, id);
    } catch {
        // non-fatal
    }
}

async function clearStaleShares(): Promise<void> {
    try {
        const db = await getDb();
        const all: PendingShare[] = await db.getAll(STORE_NAME);
        const cutoff = Date.now() - STALE_THRESHOLD_MS;
        for (const share of all) {
            if (share.receivedAt < cutoff) {
                await db.delete(STORE_NAME, share.id);
            }
        }
    } catch {
        // non-fatal
    }
}

export const shareTargetService = { getPendingShare, clearPendingShare, clearStaleShares };
