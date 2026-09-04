jest.mock('@/i18n', () => ({
	t: (message: string) => message,
}));

jest.mock('@src/services/AuthService', () => ({
	authService: {
		getCurrentUser: jest.fn(),
	},
}));

jest.mock('@src/services/FileStoreService', () => ({
	fileStorageEventEmitter: { emitChange: jest.fn() },
}));

jest.mock('@src/services/GitBackupSyncService', () => ({
	GitBackupSyncService: jest.fn(),
}));

jest.mock('@src/services/GitBackupImportService', () => ({
	GitBackupImportService: jest.fn(),
}));

import {
	GitBackupService,
	type GitBackupAdapter,
	type GitBackupChange,
	type GitTreeItem,
} from '@src/services/GitBackupService';

interface Target {
	id: string;
}

const createAdapter = (): GitBackupAdapter<Target> => ({
	displayName: 'Test',
	pluginId: 'test',
	tokenSecretKey: 'token',
	targetSecretKey: 'target',
	statusTargetKey: 'target',
	tokenType: 'token',
	importIdPrefix: 'test-import',
	setBaseUrl: jest.fn(),
	setRequestTimeout: jest.fn(),
	testConnection: jest.fn(async () => true),
	listTargets: jest.fn(async () => [{ id: 'repo-1' }]),
	parseTarget: jest.fn(() => ({ id: 'target' })),
	targetFromStoredValue: jest.fn(() => ({ id: 'target' })),
	getTargetLabel: jest.fn(() => 'target'),
	getTargetSecretValue: jest.fn(() => 'target'),
	getTargetMetadata: jest.fn(() => ({})),
	getRecursiveTree: jest.fn(async () => []),
	readFile: jest.fn(async () => ''),
	commitChanges: jest.fn(async () => {}),
});

describe('GitBackupService', () => {
	it('keeps the provider-facing adapter exports usable', async () => {
		const adapter = createAdapter();
		const service = new GitBackupService(adapter);
		const result = await service.connectWithToken('token');

		expect(result).toEqual({
			success: true,
			targets: [{ id: 'repo-1' }],
			repositories: [{ id: 'repo-1' }],
			projects: [{ id: 'repo-1' }],
		});

		const treeItem: GitTreeItem = { type: 'blob', path: 'file.tex', sha: 'sha' };
		const change: GitBackupChange = {
			type: 'update',
			path: treeItem.path || '',
			content: 'content',
		};
		expect(change.path).toBe('file.tex');
	});

	it('continues forwarding provider-specific settings to the adapter', () => {
		const adapter = createAdapter();
		const service = new GitBackupService(adapter);

		service.setSettings({
			apiEndpoint: 'https://git.example/api',
			requestTimeout: 42,
		});

		expect(adapter.setBaseUrl).toHaveBeenCalledWith('https://git.example/api');
		expect(adapter.setRequestTimeout).toHaveBeenCalledWith(42);
	});
});
