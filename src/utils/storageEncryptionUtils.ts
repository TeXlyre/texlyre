// src/utils/storageEncryptionUtils.ts
// Remote storage key derivation/wrapping and payload encryption (HKDF-SHA-256 + AES-256-GCM).
// Separate from Chelys identity derivation and SecretsContext password encryption.
import type { WrappedStorageKey } from '../types/storage';
import {
	concatBytes,
	fromBase64Url,
	toArrayBuffer,
	toBase64Url,
} from './fileUtils';

const STORAGE_WRAP_DOMAIN = 'texlyre-storage-wrap-v1';
const STORAGE_ENCRYPTION_DOMAIN = 'texlyre-storage-aes-gcm-v1';
const STORAGE_KEY_BITS = 256;
const IV_BYTES = 12;
const ENCRYPTED_BYTES_VERSION = 1;
const ENCRYPTED_BYTES_HEADER = 1 + IV_BYTES;

const encoder = new TextEncoder();

const frame = (...parts: Uint8Array[]): Uint8Array => {
	const framed: Uint8Array[] = [];
	for (const part of parts) {
		const length = new Uint8Array(4);
		new DataView(length.buffer).setUint32(0, part.byteLength, false);
		framed.push(length, part);
	}
	return concatBytes(...framed);
};

const additionalData = (purpose: string): Uint8Array =>
	encoder.encode(`${STORAGE_ENCRYPTION_DOMAIN}:${purpose}`);

const randomIv = (): Uint8Array =>
	crypto.getRandomValues(new Uint8Array(IV_BYTES));

const wrapKey = async (
	key: CryptoKey,
	wrappingKey: CryptoKey,
	purpose: 'account-key' | 'project-key',
): Promise<WrappedStorageKey> => {
	const iv = randomIv();
	const wrapped = await crypto.subtle.wrapKey('raw', key, wrappingKey, {
		name: 'AES-GCM',
		iv: toArrayBuffer(iv),
		additionalData: toArrayBuffer(additionalData(purpose)),
	});
	return {
		version: 1,
		iv: toBase64Url(iv),
		wrapped: toBase64Url(new Uint8Array(wrapped)),
	};
};

const unwrapKey = async (
	envelope: WrappedStorageKey,
	wrappingKey: CryptoKey,
	purpose: 'account-key' | 'project-key',
	keyUsages: KeyUsage[],
): Promise<CryptoKey> => {
	if (envelope.version !== 1) {
		throw new Error(
			`Unsupported wrapped storage key version: ${envelope.version}`,
		);
	}
	return crypto.subtle.unwrapKey(
		'raw',
		toArrayBuffer(fromBase64Url(envelope.wrapped)),
		wrappingKey,
		{
			name: 'AES-GCM',
			iv: toArrayBuffer(fromBase64Url(envelope.iv)),
			additionalData: toArrayBuffer(additionalData(purpose)),
		},
		{ name: 'AES-GCM', length: STORAGE_KEY_BITS },
		true,
		keyUsages,
	);
};

export interface StorageCredentialInputs {
	username: string;
	password: string;
	prfOutput: Uint8Array;
}

export async function deriveStorageWrappingKey({
	username,
	password,
	prfOutput,
}: StorageCredentialInputs): Promise<CryptoKey> {
	const input = frame(
		encoder.encode(username),
		encoder.encode(password),
		prfOutput,
	);
	const material = await crypto.subtle.importKey(
		'raw',
		toArrayBuffer(input),
		'HKDF',
		false,
		['deriveKey'],
	);
	return crypto.subtle.deriveKey(
		{
			name: 'HKDF',
			hash: 'SHA-256',
			salt: toArrayBuffer(new Uint8Array(0)),
			info: toArrayBuffer(encoder.encode(STORAGE_WRAP_DOMAIN)),
		},
		material,
		{ name: 'AES-GCM', length: STORAGE_KEY_BITS },
		true,
		['wrapKey', 'unwrapKey'],
	);
}

export async function exportStorageWrappingKey(
	key: CryptoKey,
): Promise<string> {
	const raw = new Uint8Array(await crypto.subtle.exportKey('raw', key));
	return toBase64Url(raw);
}

export function importStorageWrappingKey(encoded: string): Promise<CryptoKey> {
	return crypto.subtle.importKey(
		'raw',
		toArrayBuffer(fromBase64Url(encoded)),
		{ name: 'AES-GCM', length: STORAGE_KEY_BITS },
		true,
		['wrapKey', 'unwrapKey'],
	);
}

export function generateAccountStorageKey(): Promise<CryptoKey> {
	return crypto.subtle.generateKey(
		{ name: 'AES-GCM', length: STORAGE_KEY_BITS },
		true,
		['encrypt', 'decrypt', 'wrapKey', 'unwrapKey'],
	);
}

export function generateProjectStorageKey(): Promise<CryptoKey> {
	return crypto.subtle.generateKey(
		{ name: 'AES-GCM', length: STORAGE_KEY_BITS },
		true,
		['encrypt', 'decrypt'],
	);
}

export function wrapAccountStorageKey(
	accountKey: CryptoKey,
	wrappingKey: CryptoKey,
): Promise<WrappedStorageKey> {
	return wrapKey(accountKey, wrappingKey, 'account-key');
}

export function unwrapAccountStorageKey(
	envelope: WrappedStorageKey,
	wrappingKey: CryptoKey,
): Promise<CryptoKey> {
	return unwrapKey(envelope, wrappingKey, 'account-key', [
		'encrypt',
		'decrypt',
		'wrapKey',
		'unwrapKey',
	]);
}

export async function rewrapAccountStorageKey(
	envelope: WrappedStorageKey,
	oldWrappingKey: CryptoKey,
	newWrappingKey: CryptoKey,
): Promise<WrappedStorageKey> {
	const accountKey = await unwrapAccountStorageKey(envelope, oldWrappingKey);
	return wrapAccountStorageKey(accountKey, newWrappingKey);
}

export function wrapProjectStorageKey(
	projectKey: CryptoKey,
	accountKey: CryptoKey,
): Promise<WrappedStorageKey> {
	return wrapKey(projectKey, accountKey, 'project-key');
}

export function unwrapProjectStorageKey(
	envelope: WrappedStorageKey,
	accountKey: CryptoKey,
): Promise<CryptoKey> {
	return unwrapKey(envelope, accountKey, 'project-key', ['encrypt', 'decrypt']);
}

export async function exportProjectStorageKey(
	projectKey: CryptoKey,
): Promise<Uint8Array> {
	return new Uint8Array(await crypto.subtle.exportKey('raw', projectKey));
}

export function importProjectStorageKey(raw: Uint8Array): Promise<CryptoKey> {
	return crypto.subtle.importKey(
		'raw',
		toArrayBuffer(raw),
		{ name: 'AES-GCM', length: STORAGE_KEY_BITS },
		true,
		['encrypt', 'decrypt'],
	);
}

export async function encryptStorageBytes(
	key: CryptoKey,
	plaintext: Uint8Array,
	purpose = 'payload',
): Promise<Uint8Array> {
	const iv = randomIv();
	const ciphertext = await crypto.subtle.encrypt(
		{
			name: 'AES-GCM',
			iv: toArrayBuffer(iv),
			additionalData: toArrayBuffer(additionalData(purpose)),
		},
		key,
		toArrayBuffer(plaintext),
	);
	return concatBytes(
		new Uint8Array([ENCRYPTED_BYTES_VERSION]),
		iv,
		new Uint8Array(ciphertext),
	);
}

export async function decryptStorageBytes(
	key: CryptoKey,
	encrypted: Uint8Array,
	purpose = 'payload',
): Promise<Uint8Array> {
	if (encrypted.byteLength < ENCRYPTED_BYTES_HEADER + 16) {
		throw new Error('Invalid encrypted storage payload');
	}
	if (encrypted[0] !== ENCRYPTED_BYTES_VERSION) {
		throw new Error(
			`Unsupported encrypted storage payload version: ${encrypted[0]}`,
		);
	}
	const iv = encrypted.subarray(1, ENCRYPTED_BYTES_HEADER);
	const ciphertext = encrypted.subarray(ENCRYPTED_BYTES_HEADER);
	const plaintext = await crypto.subtle.decrypt(
		{
			name: 'AES-GCM',
			iv: toArrayBuffer(iv),
			additionalData: toArrayBuffer(additionalData(purpose)),
		},
		key,
		toArrayBuffer(ciphertext),
	);
	return new Uint8Array(plaintext);
}
