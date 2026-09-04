import type { RecordsContextType } from '../contexts/RecordsContext';

const RECORD_KEY = 'workspace-activity';
const MAX_ENTRIES = 200;

export type WorkspaceActivityType =
	| 'connected'
	| 'reconnected'
	| 'folder-changed'
	| 'permission-lost'
	| 'imported'
	| 'exported'
	| 'pulled'
	| 'merged'
	| 'conflict'
	| 'annotations-dropped'
	| 'added'
	| 'removed'
	| 'renamed';

export interface WorkspaceActivity {
	id: string;
	type: WorkspaceActivityType;
	message: string;
	timestamp: number;
	data?: any;
}

export type WorkspaceActivityInput = Omit<
	WorkspaceActivity,
	'id' | 'timestamp'
>;

class WorkspaceActivityService {
	private recordsContext: RecordsContextType | null = null;
	private listeners: Array<(projectId: string) => void> = [];

	setRecordsContext(recordsContext: RecordsContextType): void {
		this.recordsContext = recordsContext;
	}

	addListener(listener: (projectId: string) => void): () => void {
		this.listeners.push(listener);
		return () => {
			this.listeners = this.listeners.filter((l) => l !== listener);
		};
	}

	async list(projectId: string): Promise<WorkspaceActivity[]> {
		if (!this.recordsContext) return [];

		return this.recordsContext
			.listRecords<WorkspaceActivityInput>(RECORD_KEY, {
				scope: 'project',
				projectId,
				limit: MAX_ENTRIES,
			})
			.map((entry) => ({
				id: entry.id,
				timestamp: entry.timestamp,
				...entry.data,
			}));
	}

	async record(
		projectId: string,
		activity: WorkspaceActivityInput,
	): Promise<void> {
		if (!this.recordsContext) return;

		this.recordsContext.appendRecord(RECORD_KEY, activity, {
			scope: 'project',
			projectId,
			maxEntries: MAX_ENTRIES,
		});
		this.notify(projectId);
	}

	async clear(projectId: string): Promise<void> {
		this.recordsContext?.clearRecords(RECORD_KEY, {
			scope: 'project',
			projectId,
		});
		this.notify(projectId);
	}

	private notify(projectId: string): void {
		for (const listener of this.listeners) listener(projectId);
	}
}

export const workspaceActivityService = new WorkspaceActivityService();
