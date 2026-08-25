// src/chelys/peer/TransportFraming.ts
import type { TransportPayload } from '../types/transport';

const HEADER_BYTES = 26;
const MAX_FRAME_BYTES = 16 * 1024;
const DEFAULT_IDLE_TIMEOUT_MS = 30_000;
const MAGIC = 0x545a;
const KIND_TEXT = 0;
const KIND_BINARY = 1;

export const MAX_FRAME_BODY = MAX_FRAME_BYTES - HEADER_BYTES;

interface FrameHeader {
	messageId: number;
	sequence: number;
	total: number;
	kind: typeof KIND_TEXT | typeof KIND_BINARY;
	length: number;
}

interface PendingMessage {
	chunks: Array<Uint8Array | undefined>;
	received: number;
	kind: FrameHeader['kind'];
	length: number;
	timer: ReturnType<typeof setTimeout>;
}

export interface FrameReassemblerOptions {
	idleTimeoutMs?: number;
	onError?: (error: Error) => void;
}

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
let nextMessageId = 1;

function allocateMessageId(): number {
	nextMessageId = (nextMessageId + 1) % 0xffffffff || 1;
	return nextMessageId;
}

function readHeader(data: ArrayBuffer): FrameHeader | null {
	if (data.byteLength < HEADER_BYTES) return null;
	const view = new DataView(data);
	if (view.getUint16(0) !== MAGIC) return null;

	const kind = view.getUint8(14);
	if (kind !== KIND_TEXT && kind !== KIND_BINARY) return null;

	return {
		messageId: view.getUint32(2),
		sequence: view.getUint32(6),
		total: view.getUint32(10),
		kind,
		length: view.getUint32(15),
	};
}

function validFrame(header: FrameHeader, bodyLength: number): boolean {
	if (header.total < 1 || header.sequence >= header.total) return false;
	if (bodyLength > MAX_FRAME_BODY) return false;
	if (header.length > header.total * MAX_FRAME_BODY) return false;
	if (header.total === 1) {
		return header.sequence === 0 && bodyLength === header.length;
	}
	return header.length > (header.total - 1) * MAX_FRAME_BODY;
}

function decodePayload(
	kind: FrameHeader['kind'],
	bytes: Uint8Array,
): TransportPayload {
	return kind === KIND_TEXT ? textDecoder.decode(bytes) : bytes;
}

export function encodeFrames(payload: TransportPayload): ArrayBuffer[] {
	const isText = typeof payload === 'string';
	const body = isText ? textEncoder.encode(payload) : payload;
	const total = Math.max(1, Math.ceil(body.byteLength / MAX_FRAME_BODY));
	const messageId = allocateMessageId();
	const frames = new Array<ArrayBuffer>(total);

	for (let sequence = 0; sequence < total; sequence++) {
		const start = sequence * MAX_FRAME_BODY;
		const chunk = body.subarray(start, start + MAX_FRAME_BODY);
		const frame = new ArrayBuffer(HEADER_BYTES + chunk.byteLength);
		const view = new DataView(frame);

		view.setUint16(0, MAGIC);
		view.setUint32(2, messageId);
		view.setUint32(6, sequence);
		view.setUint32(10, total);
		view.setUint8(14, isText ? KIND_TEXT : KIND_BINARY);
		view.setUint32(15, body.byteLength);
		new Uint8Array(frame).set(chunk, HEADER_BYTES);
		frames[sequence] = frame;
	}

	return frames;
}

export class FrameReassembler {
	private readonly pending = new Map<number, PendingMessage>();
	private readonly idleTimeoutMs: number;
	private readonly onError?: (error: Error) => void;

	constructor(options: FrameReassemblerOptions = {}) {
		this.idleTimeoutMs = options.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS;
		this.onError = options.onError;
	}

	push(data: ArrayBuffer): TransportPayload | null {
		const header = readHeader(data);
		if (!header) {
			this.report(new Error('Invalid transport frame header'));
			return null;
		}

		const body = new Uint8Array(data, HEADER_BYTES);
		if (!validFrame(header, body.byteLength)) {
			this.fail(
				header.messageId,
				new Error(
					`Invalid transport frame ${header.messageId}:${header.sequence}`,
				),
			);
			return null;
		}

		if (header.total === 1) return decodePayload(header.kind, body);

		const entry = this.getOrCreate(header);
		if (!entry) return null;

		if (entry.chunks[header.sequence] === undefined) {
			entry.chunks[header.sequence] = body;
			entry.received += 1;
			this.refreshTimer(header.messageId, entry);
		}
		if (entry.received < entry.chunks.length) return null;

		clearTimeout(entry.timer);
		this.pending.delete(header.messageId);
		return this.assemble(header.messageId, entry);
	}

	reset(): void {
		for (const entry of this.pending.values()) clearTimeout(entry.timer);
		this.pending.clear();
	}

	private getOrCreate(header: FrameHeader): PendingMessage | null {
		const existing = this.pending.get(header.messageId);
		if (existing) {
			if (
				existing.chunks.length === header.total &&
				existing.kind === header.kind &&
				existing.length === header.length
			) {
				return existing;
			}
			this.fail(
				header.messageId,
				new Error(`Conflicting transport frames for ${header.messageId}`),
			);
			return null;
		}

		const entry: PendingMessage = {
			chunks: new Array(header.total),
			received: 0,
			kind: header.kind,
			length: header.length,
			timer: this.createTimer(header.messageId),
		};
		this.pending.set(header.messageId, entry);
		return entry;
	}

	private assemble(
		messageId: number,
		entry: PendingMessage,
	): TransportPayload | null {
		const chunks = entry.chunks as Uint8Array[];
		const receivedLength = chunks.reduce(
			(total, chunk) => total + chunk.byteLength,
			0,
		);
		if (receivedLength !== entry.length) {
			this.report(
				new Error(
					`Transport message ${messageId} is incomplete (${receivedLength}/${entry.length} bytes)`,
				),
			);
			return null;
		}

		const merged = new Uint8Array(receivedLength);
		let offset = 0;
		for (const chunk of chunks) {
			merged.set(chunk, offset);
			offset += chunk.byteLength;
		}
		return decodePayload(entry.kind, merged);
	}

	private createTimer(messageId: number): ReturnType<typeof setTimeout> {
		return setTimeout(
			() =>
				this.fail(
					messageId,
					new Error(`Timed out reassembling transport message ${messageId}`),
				),
			this.idleTimeoutMs,
		);
	}

	private refreshTimer(messageId: number, entry: PendingMessage): void {
		clearTimeout(entry.timer);
		entry.timer = this.createTimer(messageId);
	}

	private fail(messageId: number, error: Error): void {
		const entry = this.pending.get(messageId);
		if (entry) clearTimeout(entry.timer);
		this.pending.delete(messageId);
		this.report(error);
	}

	private report(error: Error): void {
		this.onError?.(error);
	}
}
