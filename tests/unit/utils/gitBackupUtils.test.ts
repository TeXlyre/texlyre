import type {
	GitBackupAdapter,
	ResolvedGitCredentials,
} from '@src/types/gitBackup';
import {
	gitContentToText,
	readGitFileAtRefBytesSafe,
	readGitFileBytes,
	readGitFileText,
} from '@src/utils/gitBackupUtils';

interface Target {
	id: string;
}

const credentials: ResolvedGitCredentials<Target> = {
	token: 'token',
	target: { id: 'target' },
	branch: 'main',
};

const toRemoteString = (bytes: Uint8Array): string =>
	Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');

const utf8RemoteString = (text: string): string =>
	toRemoteString(new TextEncoder().encode(text));

const createAdapter = (
	overrides: Partial<GitBackupAdapter<Target>> = {},
): GitBackupAdapter<Target> =>
	({
		displayName: 'Test',
		pluginId: 'test',
		tokenSecretKey: 'token',
		targetSecretKey: 'target',
		statusTargetKey: 'target',
		tokenType: 'token',
		importIdPrefix: 'test-import',
		testConnection: jest.fn(async () => true),
		listTargets: jest.fn(async () => []),
		parseTarget: jest.fn(() => ({ id: 'target' })),
		targetFromStoredValue: jest.fn(() => ({ id: 'target' })),
		getTargetLabel: jest.fn(() => 'target'),
		getTargetSecretValue: jest.fn(() => 'target'),
		getTargetMetadata: jest.fn(() => ({})),
		getRecursiveTree: jest.fn(async () => []),
		readFile: jest.fn(async () => ''),
		commitChanges: jest.fn(async () => { }),
		...overrides,
	}) as GitBackupAdapter<Target>;

describe('gitBackupUtils', () => {
	it('decodes UTF-8 text returned as a provider byte string', async () => {
		const arabic = 'يعود تاريخ أنظمة التنضيد الرقمية إلى أوائل السبعينيات';
		const adapter = createAdapter({
			readFile: jest.fn(async () => utf8RemoteString(arabic)),
		});

		await expect(readGitFileText(adapter, credentials, 'ref')).resolves.toBe(
			arabic,
		);
	});

	it('keeps arbitrary binary bytes unchanged', async () => {
		const expected = new Uint8Array([0, 255, 128, 1, 10, 200]);
		const adapter = createAdapter({
			readFile: jest.fn(async () => toRemoteString(expected)),
		});

		const actual = await readGitFileBytes(adapter, credentials, 'ref');
		expect(Array.from(actual)).toEqual(Array.from(expected));
	});

	it('prefers a true byte reader for reads at a ref', async () => {
		const expected = new Uint8Array([0, 255, 42, 128]);
		const readFileAtRef = jest.fn(async () => 'should-not-be-used');
		const adapter = createAdapter({
			readFileAtRef,
			readFileBytesAtRef: jest.fn(async () => expected.slice().buffer),
		});

		const actual = await readGitFileAtRefBytesSafe(
			adapter,
			credentials,
			'file.bin',
			'commit',
		);

		expect(Array.from(actual || [])).toEqual(Array.from(expected));
		expect(readFileAtRef).not.toHaveBeenCalled();
	});

	it('returns undefined instead of converting a failed ref read', async () => {
		const adapter = createAdapter({
			readFileAtRef: jest.fn(async () => {
				throw new Error('missing');
			}),
		});

		await expect(
			readGitFileAtRefBytesSafe(
				adapter,
				credentials,
				'missing.txt',
				'commit',
			),
		).resolves.toBeUndefined();
	});

	it('converts both Uint8Array and ArrayBuffer text content', () => {
		const text = 'مرحبا 🌍';
		const bytes = new TextEncoder().encode(text);

		expect(gitContentToText(bytes)).toBe(text);
		expect(gitContentToText(bytes.slice().buffer)).toBe(text);
	});
});
