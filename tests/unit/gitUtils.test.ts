import {
	gitRemoteApiRequest,
	normalizeGitRepositoryInput,
} from '../../src/utils/gitUtils';

describe('gitUtils', () => {
	it('normalizes repository URLs and SSH paths', () => {
		expect(normalizeGitRepositoryInput('https://git.example/me/project.git')).toBe(
			'me/project',
		);
		expect(normalizeGitRepositoryInput('git@git.example:me/project.git')).toBe(
			'me/project',
		);
	});

	describe('remote API requests', () => {
		const originalFetch = global.fetch;

		afterEach(() => {
			global.fetch = originalFetch;
			jest.restoreAllMocks();
		});

		it('normalizes endpoints and applies provider authentication', async () => {
			const fetchMock = jest.fn(async () =>
				({
					ok: true,
					status: 200,
					statusText: 'OK',
					json: async () => ({ ok: true }),
				}) as Response,
			);
			global.fetch = fetchMock as typeof fetch;

			await expect(
				gitRemoteApiRequest<{ ok: boolean }>({
					providerName: 'Example',
					baseUrl: 'https://git.example/api/v1/',
					token: 'secret',
					endpoint: '/repos/me/project/git/commits/abc',
					requestTimeout: 30,
					authHeaders: (token) => ({ Authorization: `token ${token}` }),
				}),
			).resolves.toEqual({ ok: true });

			const [url, init] = fetchMock.mock.calls[0];
			expect(url).toBe(
				'https://git.example/api/v1/repos/me/project/git/commits/abc',
			);
			expect(new Headers(init?.headers).get('Authorization')).toBe('token secret');
		});

		it('preserves HTTP status on provider API errors', async () => {
			global.fetch = jest.fn(async () =>
				({
					ok: false,
					status: 404,
					statusText: 'Not Found',
					json: async () => ({ message: 'missing' }),
				}) as Response,
			) as typeof fetch;

			await expect(
				gitRemoteApiRequest({
					providerName: 'Example',
					baseUrl: 'https://git.example/api/v1',
					token: 'secret',
					endpoint: 'missing',
					requestTimeout: 30,
					authHeaders: () => ({}),
				}),
			).rejects.toEqual(
				expect.objectContaining({
					message: 'Example API request failed: missing',
					status: 404,
				}),
			);
		});
	});
});
