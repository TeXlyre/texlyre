// src/utils/chelysWebauthn.ts
import { WEBAUTHN_PRF_SALT, WEBAUTHN_RP_NAME, toHex } from '@chelys/protocol';

import { toArrayBuffer } from './fileUtils';

async function userHandle(username: string): Promise<ArrayBuffer> {
	return crypto.subtle.digest(
		'SHA-256',
		toArrayBuffer(new TextEncoder().encode(`chelys-user:${username}`)),
	);
}

function toBase64Url(bytes: Uint8Array): string {
	return btoa(String.fromCharCode(...bytes))
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/, '');
}

export async function signalUsernameChange(
	enrollmentUsername: string,
	newUsername: string,
): Promise<void> {
	const signal = (
		PublicKeyCredential as unknown as {
			signalCurrentUserDetails?: (options: {
				rpId: string;
				userId: string;
				name: string;
				displayName: string;
			}) => Promise<void>;
		}
	).signalCurrentUserDetails;
	if (!signal) return;

	const handle = await userHandle(enrollmentUsername);
	await signal({
		rpId: window.location.hostname,
		userId: toBase64Url(new Uint8Array(handle)),
		name: newUsername,
		displayName: newUsername,
	});
}

export async function enrollCredential(username: string): Promise<Uint8Array> {
	const challenge = crypto.getRandomValues(new Uint8Array(32));
	const handle = await userHandle(username);

	let credential: PublicKeyCredential | null;
	try {
		credential = (await navigator.credentials.create({
			publicKey: {
				challenge,
				rp: { name: WEBAUTHN_RP_NAME, id: window.location.hostname },
				user: { id: handle, name: username, displayName: username },
				pubKeyCredParams: [
					{ type: 'public-key', alg: -7 },
					{ type: 'public-key', alg: -257 },
				],
				authenticatorSelection: {
					residentKey: 'required',
					userVerification: 'preferred',
				},
				extensions: {
					prf: { eval: { first: toArrayBuffer(WEBAUTHN_PRF_SALT) } },
				} as AuthenticationExtensionsClientInputs,
				timeout: 60_000,
			},
		})) as PublicKeyCredential | null;
	} catch (error) {
		if (error instanceof Error && error.name === 'InvalidStateError') {
			throw new ChelysCredentialExistsError(username);
		}
		throw error;
	}

	if (!credential) throw new Error('Credential creation returned null');

	const extResults = credential.getClientExtensionResults() as {
		prf?: { enabled?: boolean; results?: { first?: ArrayBuffer } };
	};
	const prfFirst = extResults.prf?.results?.first;
	if (prfFirst) return new Uint8Array(prfFirst);

	if (extResults.prf?.enabled === false) {
		throw new Error('Authenticator does not support PRF extension');
	}

	return retrievePrfOutput();
}

export async function retrievePrfOutput(): Promise<Uint8Array> {
	const challenge = crypto.getRandomValues(new Uint8Array(32));

	const assertion = (await navigator.credentials.get({
		publicKey: {
			challenge,
			rpId: window.location.hostname,
			allowCredentials: [],
			userVerification: 'preferred',
			extensions: {
				prf: { eval: { first: toArrayBuffer(WEBAUTHN_PRF_SALT) } },
			} as AuthenticationExtensionsClientInputs,
			timeout: 60_000,
		},
	})) as PublicKeyCredential | null;

	if (!assertion) throw new Error('Assertion returned null');

	const extResults = assertion.getClientExtensionResults() as {
		prf?: { results?: { first?: ArrayBuffer } };
	};
	const prfFirst = extResults.prf?.results?.first;
	if (!prfFirst) throw new Error('Authenticator did not return PRF output');

	return new Uint8Array(prfFirst);
}

export function displayPrfHex(prf: Uint8Array): string {
	return toHex(prf);
}

export class ChelysAccountNotFoundError extends Error {
	constructor() {
		super('chelys-account-not-found');
		this.name = 'ChelysAccountNotFoundError';
	}
}

export class ChelysCredentialExistsError extends Error {
	constructor(public readonly label: string) {
		super('chelys-credential-exists');
		this.name = 'ChelysCredentialExistsError';
	}
}
