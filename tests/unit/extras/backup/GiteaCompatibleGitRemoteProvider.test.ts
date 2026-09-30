import { forgejoAPIService } from '@extras/backup/forgejo/ForgejoAPIService';
import { forgejoGitRemoteProvider } from '@extras/backup/forgejo/ForgejoGitRemoteProvider';
import { giteaAPIService } from '@extras/backup/gitea/GiteaAPIService';
import { giteaGitRemoteProvider } from '@extras/backup/gitea/GiteaGitRemoteProvider';

const response = (status: number, body: unknown): Response =>
	({
		ok: status >= 200 && status < 300,
		status,
		statusText: status === 409 ? 'Conflict' : 'OK',
		json: jest.fn(async () => body),
	}) as unknown as Response;

const originalFetch = globalThis.fetch;

const initialCommit = {
	branch: 'main',
	parents: [],
	expectedBranchHead: null,
	updateBranch: true,
	message: 'Initial commit',
	author: {
		name: 'Author',
		email: 'author@example.com',
		date: '2026-09-23T10:00:00Z',
	},
	committer: {
		name: 'Author',
		email: 'author@example.com',
		date: '2026-09-23T10:00:00Z',
	},
	changes: [
		{
			path: 'main.tex',
			type: 'create' as const,
			mode: '100644',
			content: new TextEncoder().encode('content'),
		},
	],
};

describe.each([
	['Gitea', giteaGitRemoteProvider, giteaAPIService],
	['Forgejo', forgejoGitRemoteProvider, forgejoAPIService],
] as const)('%s compatible GitRemoteProvider', (_name, provider, apiService) => {
	beforeEach(() => {
		jest.restoreAllMocks();
	});

	afterEach(() => {
		if (originalFetch) {
			globalThis.fetch = originalFetch;
		} else {
			Reflect.deleteProperty(globalThis, 'fetch');
		}
	});

	it('treats an empty repository as having no branch head and creates the root commit', async () => {
		jest
			.spyOn(apiService, 'getBranchHeadSha')
			.mockRejectedValue(new Error('Git Repository is empty.'));

		const fetchMock = jest.fn(
			async (
				input: Parameters<typeof fetch>[0],
				init?: Parameters<typeof fetch>[1],
			) => {
				const url = String(input);
				if (url.endsWith('/repos/owner/repo/contents') && init?.method === 'POST') {
					return response(201, {
						commit: {
							sha: 'root-sha',
							message: 'Initial commit',
							parents: [],
							tree: { sha: 'tree-sha' },
							author: initialCommit.author,
							committer: initialCommit.committer,
						},
					});
				}
				throw new Error(`Unexpected request: ${init?.method ?? 'GET'} ${url}`);
			},
		);
		globalThis.fetch = fetchMock as typeof fetch;

		const created = await provider.historyTransport.createCommit(
			'token',
			'owner/repo',
			initialCommit,
		);

		expect(created).toEqual(
			expect.objectContaining({ oid: 'root-sha', parents: [] }),
		);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual(
			expect.objectContaining({
				branch: 'main',
				message: 'Initial commit',
				files: [
					expect.objectContaining({
						operation: 'create',
						path: 'main.tex',
					}),
				],
			}),
		);
	});
});
