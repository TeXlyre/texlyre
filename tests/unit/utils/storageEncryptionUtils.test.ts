import { webcrypto } from 'node:crypto';

import {
	decryptStorageBytes,
	deriveStorageWrappingKey,
	exportStorageWrappingKey,
	importStorageWrappingKey,
	encryptStorageBytes,
	generateAccountStorageKey,
	generateProjectStorageKey,
	rewrapAccountStorageKey,
	unwrapAccountStorageKey,
	unwrapProjectStorageKey,
	wrapAccountStorageKey,
	wrapProjectStorageKey,
} from '../../../src/utils/storageEncryptionUtils';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const credentials = {
	username: 'alice',
	password: 'correct horse battery staple',
	prfOutput: Uint8Array.from({ length: 32 }, (_, i) => i + 1),
};

let originalSubtle: SubtleCrypto;
let originalGetRandomValues: Crypto['getRandomValues'];

beforeAll(() => {
	originalSubtle = globalThis.crypto.subtle;
	originalGetRandomValues = globalThis.crypto.getRandomValues;
	(globalThis.crypto as { subtle: SubtleCrypto }).subtle = webcrypto.subtle;
	globalThis.crypto.getRandomValues = webcrypto.getRandomValues.bind(webcrypto);
});

afterAll(() => {
	(globalThis.crypto as { subtle: SubtleCrypto }).subtle = originalSubtle;
	globalThis.crypto.getRandomValues = originalGetRandomValues;
});

describe('storageEncryptionUtils', () => {
	it('recovers the account key from the same authentication inputs', async () => {
		const accountKey = await generateAccountStorageKey();
		const firstWrappingKey = await deriveStorageWrappingKey(credentials);
		const envelope = await wrapAccountStorageKey(accountKey, firstWrappingKey);
		const secondWrappingKey = await deriveStorageWrappingKey(credentials);
		const recovered = await unwrapAccountStorageKey(envelope, secondWrappingKey);

		const plaintext = encoder.encode('account catalogue');
		const encrypted = await encryptStorageBytes(accountKey, plaintext, 'catalogue');
		const decrypted = await decryptStorageBytes(recovered, encrypted, 'catalogue');

		expect(decoder.decode(decrypted)).toBe('account catalogue');
	});

	it('rejects wrong credentials and authenticated ciphertext tampering', async () => {
		const accountKey = await generateAccountStorageKey();
		const wrappingKey = await deriveStorageWrappingKey(credentials);
		const envelope = await wrapAccountStorageKey(accountKey, wrappingKey);
		const wrongWrappingKey = await deriveStorageWrappingKey({
			...credentials,
			password: 'different password',
		});

		await expect(
			unwrapAccountStorageKey(envelope, wrongWrappingKey),
		).rejects.toBeDefined();

		const encrypted = await encryptStorageBytes(
			accountKey,
			encoder.encode('main.tex contents'),
			'object',
		);
		encrypted[encrypted.length - 1] ^= 0x01;
		await expect(
			decryptStorageBytes(accountKey, encrypted, 'object'),
		).rejects.toBeDefined();
	});

	it('rewraps only the account key when account credentials change', async () => {
		const accountKey = await generateAccountStorageKey();
		const oldWrappingKey = await deriveStorageWrappingKey(credentials);
		const oldEnvelope = await wrapAccountStorageKey(accountKey, oldWrappingKey);
		const newWrappingKey = await deriveStorageWrappingKey({
			...credentials,
			password: 'new password',
		});
		const newEnvelope = await rewrapAccountStorageKey(
			oldEnvelope,
			oldWrappingKey,
			newWrappingKey,
		);
		const recovered = await unwrapAccountStorageKey(newEnvelope, newWrappingKey);

		const encrypted = await encryptStorageBytes(accountKey, encoder.encode('project'));
		expect(decoder.decode(await decryptStorageBytes(recovered, encrypted))).toBe(
			'project',
		);
		await expect(
			unwrapAccountStorageKey(newEnvelope, oldWrappingKey),
		).rejects.toBeDefined();
	});

	it('wraps project keys under the account key without exposing project plaintext', async () => {
		const accountKey = await generateAccountStorageKey();
		const projectKey = await generateProjectStorageKey();
		const projectEnvelope = await wrapProjectStorageKey(projectKey, accountKey);
		const recoveredProjectKey = await unwrapProjectStorageKey(
			projectEnvelope,
			accountKey,
		);
		const manifest = encoder.encode(
			'projects/abc/files/main.tex\nRobot Fairness Paper\nparticipants.csv',
		);
		const encrypted = await encryptStorageBytes(
			recoveredProjectKey,
			manifest,
			'revision-manifest',
		);

		const decrypted = await decryptStorageBytes(
			projectKey,
			encrypted,
			'revision-manifest',
		);
		expect(decoder.decode(decrypted)).toBe(decoder.decode(manifest));
		expect(new TextDecoder('latin1').decode(encrypted)).not.toContain('main.tex');
		expect(new TextDecoder('latin1').decode(encrypted)).not.toContain(
			'Robot Fairness Paper',
		);
		expect(new TextDecoder('latin1').decode(encrypted)).not.toContain(
			'participants.csv',
		);
	});

	it('keeps project keys isolated between accounts', async () => {
		const accountKey = await generateAccountStorageKey();
		const otherAccountKey = await generateAccountStorageKey();
		const projectKey = await generateProjectStorageKey();
		const envelope = await wrapProjectStorageKey(projectKey, accountKey);

		await expect(
			unwrapProjectStorageKey(envelope, otherAccountKey),
		).rejects.toBeDefined();
	});

	it('restores an unlocked wrapping key across a same-session reload', async () => {
		const wrappingKey = await deriveStorageWrappingKey(credentials);
		const accountKey = await generateAccountStorageKey();
		const wrapped = await wrapAccountStorageKey(accountKey, wrappingKey);
		const encoded = await exportStorageWrappingKey(wrappingKey);
		const restoredWrappingKey = await importStorageWrappingKey(encoded);

		const restoredAccountKey = await unwrapAccountStorageKey(
			wrapped,
			restoredWrappingKey,
		);
		const payload = new TextEncoder().encode('session continuity');
		const encrypted = await encryptStorageBytes(
			restoredAccountKey,
			payload,
			'catalogue',
		);
		expect(
			new TextDecoder().decode(
				await decryptStorageBytes(accountKey, encrypted, 'catalogue'),
			),
		).toBe('session continuity');
	});
});
