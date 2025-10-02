// src/types/fileSync.ts
export interface FileSyncInfo {
	fileId: string;
	fileName: string;
	filePath: string;
	lastModified: number;
	size: number;
	checksum: string;
	userId: string;
	username: string;
	documentId?: string;
	deleted?: boolean;
}

export interface FileSyncHoldSignal {
	id: string;
	holderId: string;
	holderUsername: string;
	targetPeerId: string;
	timestamp: number;
	expiresAt: number;
	status: 'active' | 'expired' | 'released';
}

export interface FileSyncRequest {
	id: string;
	requesterId: string;
	requesterUsername: string;
	providerId: string;
	providerUsername?: string;
	files: string[];
	filePaths?: string[];
	remoteTimestamps?: number[];
	documentIds?: (string | undefined)[];
	deletionStates?: boolean[];
	timestamp: number;
	status: 'pending' | 'ready' | 'completed' | 'failed';
	filePizzaLink?: string;
	holdSignalId: string;
}

export interface FileSyncVerification {
	id: string;
	requestId: string;
	verifierId: string;
	verifierUsername: string;
	providerId: string;
	timestamp: number;
	status: 'success' | 'failure';
	message?: string;
}

export interface FileSyncNotification {
	id: string;
	type:
		| 'sync_progress'
		| 'sync_complete'
		| 'sync_error'
		| 'sync_request'
		| 'hold_signal'
		| 'verification';
	message: string;
	timestamp: number;
	data?: Record<string, any>;
}

export interface FileSyncContextType {
	isEnabled: boolean;
	isSyncing: boolean;
	lastSync: number | null;
	notifications: FileSyncNotification[];
	enableSync: () => void;
	disableSync: () => void;
	requestSync: () => Promise<void>;
	clearNotification: (id: string) => void;
	clearAllNotifications: () => void;
	cleanupStaleFileReferences: () => Promise<void>;
}
