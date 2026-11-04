// src/utils/binaryUtils.ts
export function arrayBufferToString(buffer: ArrayBuffer | Uint8Array): string {
	return new TextDecoder().decode(buffer);
}

export function stringToArrayBuffer(str: string): ArrayBuffer {
	return new TextEncoder().encode(str).buffer;
}

export function latin1ToBytes(latin1: string): Uint8Array {
	const bytes = new Uint8Array(latin1.length);
	for (let i = 0; i < latin1.length; i++)
		bytes[i] = latin1.charCodeAt(i) & 0xff;
	return bytes;
}

export function toArrayBuffer(
	content: string | ArrayBuffer | SharedArrayBuffer | ArrayBufferView,
): ArrayBuffer {
	if (typeof content === 'string') return stringToArrayBuffer(content);
	if (content instanceof ArrayBuffer) return content;
	if (ArrayBuffer.isView(content)) {
		const { buffer, byteOffset, byteLength } = content;
		if (
			buffer instanceof ArrayBuffer &&
			byteOffset === 0 &&
			byteLength === buffer.byteLength
		)
			return buffer;
		const out = new Uint8Array(byteLength);
		out.set(new Uint8Array(buffer, byteOffset, byteLength));
		return out.buffer;
	}
	if (
		typeof SharedArrayBuffer !== 'undefined' &&
		content instanceof SharedArrayBuffer
	) {
		const src = new Uint8Array(content);
		const out = new Uint8Array(src.byteLength);
		out.set(src);
		return out.buffer;
	}
	throw new Error('Unsupported binary content type');
}

export function toBytes(
	content: string | Uint8Array | ArrayBuffer,
): Uint8Array {
	if (typeof content === 'string') return new TextEncoder().encode(content);
	return content instanceof Uint8Array ? content : new Uint8Array(content);
}

export function concatBytes(...parts: Uint8Array[]): Uint8Array {
	const result = new Uint8Array(
		parts.reduce((length, part) => length + part.byteLength, 0),
	);
	let offset = 0;
	for (const part of parts) {
		result.set(part, offset);
		offset += part.byteLength;
	}
	return result;
}

export function toBase64(content: string | Uint8Array | ArrayBuffer): string {
	const uint8Array =
		typeof content === 'string'
			? new TextEncoder().encode(content)
			: content instanceof ArrayBuffer
				? new Uint8Array(content)
				: content;

	let binaryString = '';

	for (let i = 0; i < uint8Array.length; i++) {
		binaryString += String.fromCharCode(uint8Array[i]);
	}

	return btoa(binaryString);
}

export function toBase64Url(
	content: string | Uint8Array | ArrayBuffer,
): string {
	return toBase64(content)
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/g, '');
}

export function fromBase64Url(value: string): Uint8Array {
	const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
	const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='));
	return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}
