// src/types/backup.ts
import type { ImportableProject } from '../services/ProjectImportService.ts';

export interface BackupStatus {
	isConnected: boolean;
	isEnabled: boolean;
	lastSync: number | null;
	status: 'idle' | 'syncing' | 'error';
	error?: string;
}

export interface BackupActivity {
	id: string;
	type:
		| 'backup_start'
		| 'backup_complete'
		| 'backup_error'
		| 'import_start'
		| 'import_complete'
		| 'import_error';
	message: string;
	timestamp: number;
	data?: any;
}

export interface BackupDiscoveryResult {
	hasImportableProjects: boolean;
	projects: ImportableProject[];
}
export interface BackupServiceInterface {
	getStatus(): BackupStatus;
	requestAccess(): Promise<boolean>;
	disconnect(): Promise<void>;
	synchronize(projectId?: string): Promise<void>;
	exportData(projectId?: string): Promise<void>;
	importChanges(projectId?: string): Promise<void>;
	addStatusListener(callback: (status: BackupStatus) => void): () => void;
}
