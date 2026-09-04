// src/services/QuotaService.ts
import { t } from '@/i18n';
import { createNamedLogger } from '@/logging';
import { formatFileSize } from '../utils/fileUtils';

const moduleLog = createNamedLogger('QuotaService');

const SNAPSHOT_TTL_MS = 30000;
const SPACE_SAFETY_FACTOR = 10;

export interface StorageUsageSegment {
	id: string;
	label: string;
	bytes: number;
}

export interface StorageQuotaStatus {
	isSupported: boolean;
	isPersisted: boolean;
	usageBytes: number;
	quotaBytes: number;
	availableBytes: number;
	usedRatio: number;
	segments: StorageUsageSegment[];
	updatedAt: number;
}

export class StorageQuotaError extends Error {
	readonly requiredBytes: number;

	constructor(requiredBytes: number) {
		super(
			t('Not enough browser storage. This operation needs {required}.', {
				required: formatFileSize(requiredBytes),
			}),
		);
		this.name = 'StorageQuotaError';
		this.requiredBytes = requiredBytes;
	}
}

export function isQuotaExceededError(error: unknown): boolean {
	if (!error || typeof error !== 'object') return false;

	const candidate = error as { name?: string; code?: number; cause?: unknown };
	if (
		candidate.name === 'QuotaExceededError' ||
		candidate.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
		candidate.code === 22
	) {
		return true;
	}

	return candidate.cause ? isQuotaExceededError(candidate.cause) : false;
}

function isStorageManagerAvailable(): boolean {
	return (
		typeof navigator !== 'undefined' &&
		typeof navigator.storage?.estimate === 'function'
	);
}

class QuotaService {
	private listeners = new Set<(status: StorageQuotaStatus) => void>();
	private pending: Promise<StorageQuotaStatus> | null = null;
	private refreshTimeout: ReturnType<typeof setTimeout> | null = null;

	private status: StorageQuotaStatus = {
		isSupported: isStorageManagerAvailable(),
		isPersisted: false,
		usageBytes: 0,
		quotaBytes: 0,
		availableBytes: 0,
		usedRatio: 0,
		segments: [],
		updatedAt: 0,
	};

	getStatus(): StorageQuotaStatus {
		return this.status;
	}

	addStatusListener(
		callback: (status: StorageQuotaStatus) => void,
	): () => void {
		this.listeners.add(callback);
		return () => {
			this.listeners.delete(callback);
		};
	}

	async refresh(force = false): Promise<StorageQuotaStatus> {
		if (!isStorageManagerAvailable()) return this.status;

		if (!force && Date.now() - this.status.updatedAt < SNAPSHOT_TTL_MS) {
			return this.status;
		}

		if (this.pending) return this.pending;

		this.pending = (async () => {
			try {
				const estimate = await navigator.storage.estimate();
				const usageBytes = estimate.usage ?? 0;
				const quotaBytes = estimate.quota ?? 0;

				this.setStatus({
					isSupported: true,
					isPersisted: await this.readPersisted(),
					usageBytes,
					quotaBytes,
					availableBytes: Math.max(quotaBytes - usageBytes, 0),
					usedRatio: quotaBytes > 0 ? Math.min(usageBytes / quotaBytes, 1) : 0,
					segments: this.buildSegments(
						(estimate as { usageDetails?: Record<string, number> })
							.usageDetails,
					),
					updatedAt: Date.now(),
				});
			} catch (error) {
				moduleLog.warn('Failed to read storage estimate:', error);
			} finally {
				this.pending = null;
			}

			return this.status;
		})();

		return this.pending;
	}

	async requestPersistence(): Promise<boolean> {
		if (
			typeof navigator === 'undefined' ||
			typeof navigator.storage?.persist !== 'function'
		) {
			return false;
		}

		try {
			const granted = await navigator.storage.persist();
			this.setStatus({ ...this.status, isPersisted: granted });
			return granted;
		} catch (error) {
			moduleLog.warn('Failed to request persistent storage:', error);
			return false;
		}
	}

	async ensureSpace(bytes: number): Promise<void> {
		if (!(bytes > 0) || !isStorageManagerAvailable()) return;

		if (
			this.status.updatedAt > 0 &&
			this.status.quotaBytes > 0 &&
			this.status.availableBytes > bytes * SPACE_SAFETY_FACTOR
		) {
			return;
		}

		const status = await this.refresh(true);
		if (status.quotaBytes <= 0 || status.availableBytes >= bytes) return;

		throw new StorageQuotaError(bytes);
	}

	markStale(): void {
		if (!isStorageManagerAvailable()) return;

		this.status = { ...this.status, updatedAt: 0 };

		if (this.listeners.size === 0 || this.refreshTimeout) return;

		this.refreshTimeout = setTimeout(() => {
			this.refreshTimeout = null;
			void this.refresh(true);
		}, SNAPSHOT_TTL_MS);
	}

	private async readPersisted(): Promise<boolean> {
		if (typeof navigator.storage?.persisted !== 'function') return false;

		try {
			return await navigator.storage.persisted();
		} catch (error) {
			moduleLog.warn('Failed to read storage persistence:', error);
			return false;
		}
	}

	private buildSegments(
		usageDetails?: Record<string, number>,
	): StorageUsageSegment[] {
		if (!usageDetails) return [];

		const segments: StorageUsageSegment[] = [];
		let otherBytes = 0;

		for (const [key, bytes] of Object.entries(usageDetails)) {
			if (!bytes) continue;

			if (key === 'indexedDB') {
				segments.push({
					id: key,
					label: t('Projects and documents'),
					bytes,
				});
			} else if (key === 'caches') {
				segments.push({ id: key, label: t('Offline app cache'), bytes });
			} else {
				otherBytes += bytes;
			}
		}

		if (otherBytes > 0) {
			segments.push({
				id: 'other',
				label: t('Other browser data'),
				bytes: otherBytes,
			});
		}

		return segments;
	}

	private setStatus(status: StorageQuotaStatus): void {
		this.status = status;
		this.listeners.forEach((callback) => {
			callback(status);
		});
	}
}

export const quotaService = new QuotaService();
