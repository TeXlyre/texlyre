// src/utils/annotationTagUtils.ts
import type { CommentResponse } from '../types/comments';

export type AnnotationKind = 'comment' | 'review';

export const ANNOTATION_KINDS: readonly AnnotationKind[] = [
	'comment',
	'review',
];

export interface AnnotationTagPositions {
	openTagStart: number;
	openTagEnd: number;
	closeTagStart: number;
	closeTagEnd: number;
}

export interface AnnotationTagMatch extends AnnotationTagPositions {
	kind: AnnotationKind;
	id: string;
	openTagContent: string;
	innerText: string;
}

export interface AnnotationRange {
	from: number;
	to: number;
}

const openTagPattern = (kind: AnnotationKind) =>
	`<###(?:\\s|%)*${kind}(?:\\s|%)*id:`;

export function annotationDetectionRegex(kind: AnnotationKind): RegExp {
	return new RegExp(openTagPattern(kind));
}

export function containsAnnotationMarker(
	text: string,
	kind: AnnotationKind,
): boolean {
	return new RegExp(`<\\/?###(?:\\s|%)*${kind}`).test(text);
}

export function scanAnnotationTags(
	text: string,
	kind: AnnotationKind,
): AnnotationTagMatch[] {
	if (!annotationDetectionRegex(kind).test(text)) return [];

	const matches: AnnotationTagMatch[] = [];
	const openTagRegex = new RegExp(
		`${openTagPattern(kind)}(?:\\s|%)*([\\w-]+)`,
		'g',
	);
	let searchStart = 0;

	while (searchStart < text.length) {
		openTagRegex.lastIndex = searchStart;
		const openMatch = openTagRegex.exec(text);

		if (!openMatch) break;

		const openTagStart = openMatch.index;
		const id = openMatch[1];

		const backtickBefore = openTagStart > 0 && text[openTagStart - 1] === '`';

		const openTagEnd = text.indexOf('###>', openTagStart);
		if (openTagEnd === -1) {
			searchStart = openTagStart + 1;
			continue;
		}

		const backtickAfter =
			openTagEnd + 4 < text.length && text[openTagEnd + 4] === '`';

		const openTagContent = text
			.substring(openTagStart, openTagEnd + 4)
			.replace(/\n\s*%\s*/g, ' ');

		const closeTagRegex = new RegExp(
			`<\\/###(?:\\s|%)*${kind}(?:\\s|%)*id:(?:\\s|%)*${id}(?:\\s|%)*###>`,
			'g',
		);
		closeTagRegex.lastIndex = openTagEnd + 4;
		const closeMatch = closeTagRegex.exec(text);

		if (!closeMatch) {
			searchStart = openTagEnd + 4;
			continue;
		}

		const closeTagStart = closeMatch.index;
		const closeTagEnd = closeTagStart + closeMatch[0].length;

		const innerStart = openTagEnd + 4 + (backtickAfter ? 1 : 0);
		const innerEnd =
			closeTagStart -
			(backtickBefore && text[closeTagStart - 1] === '`' ? 1 : 0);

		matches.push({
			kind,
			id,
			openTagContent,
			innerText: text.substring(innerStart, innerEnd),
			openTagStart: backtickBefore ? openTagStart - 1 : openTagStart,
			openTagEnd: backtickAfter ? openTagEnd + 5 : openTagEnd + 4,
			closeTagStart:
				backtickBefore && text[closeTagStart - 1] === '`'
					? closeTagStart - 1
					: closeTagStart,
			closeTagEnd:
				backtickAfter && closeTagEnd < text.length && text[closeTagEnd] === '`'
					? closeTagEnd + 1
					: closeTagEnd,
		});

		searchStart = openTagEnd + 4;
	}

	return matches;
}

export function locateAnnotationTags(
	text: string,
	kind: AnnotationKind,
	id: string,
): AnnotationTagPositions | null {
	const match = scanAnnotationTags(text, kind).find((entry) => entry.id === id);

	if (!match) return null;

	return {
		openTagStart: match.openTagStart,
		openTagEnd: match.openTagEnd,
		closeTagStart: match.closeTagStart,
		closeTagEnd: match.closeTagEnd,
	};
}

export function collectAnnotationTagRanges(
	text: string,
	kinds: readonly AnnotationKind[] = ANNOTATION_KINDS,
): AnnotationRange[] {
	const ranges: AnnotationRange[] = [];

	for (const kind of kinds) {
		for (const match of scanAnnotationTags(text, kind)) {
			ranges.push({ from: match.openTagStart, to: match.openTagEnd });
			ranges.push({ from: match.closeTagStart, to: match.closeTagEnd });
		}
	}

	ranges.sort((a, b) => a.from - b.from);

	const merged: AnnotationRange[] = [];

	for (const range of ranges) {
		if (range.from >= range.to) continue;

		const last = merged[merged.length - 1];

		if (last && range.from <= last.to) {
			last.to = Math.max(last.to, range.to);
		} else {
			merged.push({ ...range });
		}
	}

	return merged;
}

export function stripAnnotationTags(
	text: string,
	kinds: readonly AnnotationKind[] = ANNOTATION_KINDS,
): string {
	const ranges = collectAnnotationTagRanges(text, kinds);
	if (!ranges.length) return text;

	let stripped = '';
	let pos = 0;

	for (const range of ranges) {
		if (range.from > pos) stripped += text.substring(pos, range.from);
		pos = Math.max(pos, range.to);
	}

	return stripped + text.substring(pos);
}

function hasBinaryAnnotationTags(
	buffer: ArrayBuffer,
	kinds: readonly AnnotationKind[],
): boolean {
	const view = new Uint8Array(buffer);
	const encoder = new TextEncoder();
	const backtick = 0x60;
	const percent = 0x25;
	const openMarker = encoder.encode('<###');
	const idMarker = encoder.encode('id:');
	const kindMarkers = kinds.map((kind) => encoder.encode(kind));
	const whitespaceChars = [0x20, 0x09, 0x0a, 0x0d];

	const isSeparator = (byte: number) =>
		whitespaceChars.includes(byte) || byte === percent;

	const matchAt = (pos: number, marker: Uint8Array): boolean => {
		if (pos + marker.length > view.length) return false;
		for (let j = 0; j < marker.length; j++) {
			if (view[pos + j] !== marker[j]) return false;
		}
		return true;
	};

	const skipSeparators = (pos: number): number => {
		while (pos < view.length && isSeparator(view[pos])) pos++;
		return pos;
	};

	for (let i = 0; i < view.length; i++) {
		let pos = i;
		if (view[pos] === backtick) pos++;

		if (!matchAt(pos, openMarker)) continue;
		pos += openMarker.length;

		const afterOpen = skipSeparators(pos);

		for (const kindMarker of kindMarkers) {
			if (!matchAt(afterOpen, kindMarker)) continue;

			const afterKind = skipSeparators(afterOpen + kindMarker.length);
			if (matchAt(afterKind, idMarker)) return true;
		}
	}

	return false;
}

export function hasAnnotationTags(
	content: string | ArrayBuffer,
	kinds: readonly AnnotationKind[] = ANNOTATION_KINDS,
): boolean {
	if (typeof content !== 'string') {
		return hasBinaryAnnotationTags(content as ArrayBuffer, kinds);
	}

	return kinds.some((kind) => annotationDetectionRegex(kind).test(content));
}

export function calculateLineNumber(content: string, position: number): number {
	return content.substring(0, position).split('\n').length;
}

export function encodeAnnotationText(text: string): string {
	const bytes = new TextEncoder().encode(text);
	let binary = '';

	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}

	return btoa(binary);
}

export function decodeAnnotationText(encoded: string): string {
	try {
		const binary = atob(encoded.trim());
		const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
		return new TextDecoder().decode(bytes);
	} catch {
		return '';
	}
}

export function parseAnnotationResponses(
	openTagContent: string,
): CommentResponse[] {
	const responsesMatch = openTagContent.match(/responses:\s*\[(.*?)\]/s);
	const responsesString = responsesMatch ? responsesMatch[1] : '';

	if (!responsesString?.trim()) return [];

	const responses: CommentResponse[] = [];
	const cleanedResponsesString = responsesString.replace(/\n\s*%\s*/g, ' ');
	const responseRegex =
		/<####(?:\s|%)*response(?:\s|%)*id:(?:\s|%)*'([\w-]+)',(?:\s|%)*user:(?:\s|%)*([^,]+?),(?:\s|%)*time:(?:\s|%)*(\d+),(?:\s|%)*content:(?:\s|%)*'([^']*)'(?:\s|%)*####\/>/g;
	let responseMatch: RegExpExecArray | null;

	while (
		(responseMatch = responseRegex.exec(cleanedResponsesString)) !== null
	) {
		const [, id, user, timestamp, content] = responseMatch;

		responses.push({
			id,
			user: user.trim(),
			timestamp: Number.parseInt(timestamp),
			content: content.replace(/\s+/g, ' ').trim(),
		});
	}

	return responses;
}

export function formatAnnotationResponses(
	responses: readonly CommentResponse[],
): string {
	return responses
		.map(
			(response) =>
				`<#### response id: '${response.id}', user: ${response.user}, time: ${response.timestamp}, content: '${response.content}' ####/>`,
		)
		.join(', ');
}
