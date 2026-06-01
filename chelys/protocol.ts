const PROTOCOL_VERSION = "chelys-v1";
const ARGON2_TIME = 3;
const ARGON2_MEMORY = 64 * 1024;
const ARGON2_PARALLELISM = 1;

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
    const buffer = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(buffer).set(bytes);
    return buffer;
}

async function argon2Hash(password: string, salt: Uint8Array): Promise<Uint8Array> {
    const { argon2id } = await import("hash-wasm");
    const hex = await argon2id({
        password,
        salt,
        iterations: ARGON2_TIME,
        memorySize: ARGON2_MEMORY,
        parallelism: ARGON2_PARALLELISM,
        hashLength: 32,
        outputType: "hex",
    });
    return fromHex(hex);
}

function utf8(s: string): Uint8Array {
    return new TextEncoder().encode(s);
}

function concat(...parts: Uint8Array[]): Uint8Array {
    const total = parts.reduce((n, p) => n + p.length, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    for (const p of parts) {
        out.set(p, offset);
        offset += p.length;
    }
    return out;
}

async function hkdf(ikm: Uint8Array, info: string): Promise<Uint8Array> {
    const key = await crypto.subtle.importKey("raw", toArrayBuffer(ikm), "HKDF", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits(
        {
            name: "HKDF",
            hash: "SHA-256",
            salt: toArrayBuffer(utf8(PROTOCOL_VERSION)),
            info: toArrayBuffer(utf8(info)),
        },
        key,
        256,
    );
    return new Uint8Array(bits);
}

export function toHex(bytes: Uint8Array): string {
    return Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
}

export function fromHex(hex: string): Uint8Array {
    const clean = hex.trim().toLowerCase();
    if (clean.length % 2 !== 0) throw new Error("invalid hex length");
    const out = new Uint8Array(clean.length / 2);
    for (let i = 0; i < out.length; i++) {
        out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
    }
    return out;
}

export interface DerivationInputs {
    username: string;
    password: string;
    prfOutput: Uint8Array;
}

export interface DerivedIdentity {
    roomId: string;
    roomKey: string;
}

export async function deriveIdentity(inputs: DerivationInputs): Promise<DerivedIdentity> {
    const usernameSalt = await crypto.subtle.digest(
        "SHA-256",
        toArrayBuffer(utf8(`${PROTOCOL_VERSION}:${inputs.username}`)),
    );
    const pwHash = await argon2Hash(inputs.password, new Uint8Array(usernameSalt));
    const ikm = concat(utf8(inputs.username), pwHash, inputs.prfOutput);
    const roomIdBytes = await hkdf(ikm, "room-id");
    const roomKeyBytes = await hkdf(ikm, "room-key");
    return {
        roomId: toHex(roomIdBytes),
        roomKey: toHex(roomKeyBytes),
    };
}

export const WEBAUTHN_PRF_SALT = utf8(`${PROTOCOL_VERSION}:prf-salt`);
export const WEBAUTHN_RP_NAME = "Chelys";