// src/utils/annotationMerge.ts
import {
	ANNOTATION_KINDS,
	collectAnnotationTagRanges,
	findAnnotationTokens,
	scanAnnotationTags,
	stripOrphanAnnotationTags,
} from './annotationTagUtils';
import { stripAnnotations, hasAnnotations } from './fileCommentUtils';

const LCS_LINE_LIMIT = 1500;

export interface AnnotationMergeResult {
	content: string;
	preserved: number;
	dropped: number;
}

interface PositionedAnnotation {
	key: string;
	from: number;
	to: number;
	openTag: string;
	closeTag: string;
}

function annotationIds(text: string): Set<string> {
	const ids = new Set<string>();
	for (const kind of ANNOTATION_KINDS) {
		for (const match of scanAnnotationTags(text, kind)) {
			ids.add(`${kind}:${match.id}`);
		}
	}
	return ids;
}

function cleanLines(annotatedLines: string[], annotated: string): string[] {
	const cleaned = (stripAnnotations(annotated) as string).split('\n');
	if (cleaned.length === annotatedLines.length) return cleaned;
	return annotatedLines.map((line) => stripAnnotations(line) as string);
}

function cleanAlignedLines(
	annotated: string,
	annotatedLines: string[],
): string[] {
	const cleaned = (stripAnnotations(annotated) as string).split('\n');
	if (cleaned.length === annotatedLines.length) return cleaned;
	return annotatedLines.map((line) => stripAnnotations(line) as string);
}

function longestCommonSubsequence(a: string[], b: string[]): number[][] {
	const table: number[][] = Array.from({ length: a.length + 1 }, () =>
		new Array<number>(b.length + 1).fill(0),
	);

	for (let i = a.length - 1; i >= 0; i--) {
		for (let j = b.length - 1; j >= 0; j--) {
			table[i][j] =
				a[i] === b[j]
					? table[i + 1][j + 1] + 1
					: Math.max(table[i + 1][j], table[i][j + 1]);
		}
	}

	return table;
}

function reanchorLine(annotatedLine: string, incomingLine: string): string {
	if ((stripAnnotations(annotatedLine) as string) === incomingLine) {
		return annotatedLine;
	}

	const pairs = ANNOTATION_KINDS.flatMap((kind) =>
		scanAnnotationTags(annotatedLine, kind),
	).sort((a, b) => a.openTagStart - b.openTagStart);

	const paired = new Set<number>();
	let result = incomingLine;
	let cursor = 0;

	for (const pair of pairs) {
		paired.add(pair.openTagStart);
		paired.add(pair.closeTagStart);

		const openTag = annotatedLine.slice(pair.openTagStart, pair.openTagEnd);
		const closeTag = annotatedLine.slice(pair.closeTagStart, pair.closeTagEnd);
		const inner = annotatedLine.slice(pair.openTagEnd, pair.closeTagStart);
		if (!inner.trim()) continue;

		const index = result.indexOf(inner, cursor);
		if (index < 0) continue;

		result =
			result.slice(0, index) +
			openTag +
			inner +
			closeTag +
			result.slice(index + inner.length);
		cursor = index + openTag.length + inner.length + closeTag.length;
	}

	const lone = findAnnotationTokens(annotatedLine).filter(
		(token) => !paired.has(token.start),
	);

	for (const token of lone.reverse()) {
		const anchor = token.isClose
			? (stripAnnotations(annotatedLine.slice(0, token.start)) as string)
			: (stripAnnotations(annotatedLine.slice(token.end)) as string);

		if (anchor.trim().length === 0) continue;

		const index = result.indexOf(anchor);
		if (index < 0) continue;

		const at = token.isClose ? index + anchor.length : index;
		result = result.slice(0, at) + token.token + result.slice(at);
	}

	return result;
}

function mergeRegion(
	annotated: string[],
	cleaned: string[],
	incoming: string[],
): string[] {
	if (cleaned.length > LCS_LINE_LIMIT || incoming.length > LCS_LINE_LIMIT) {
		return incoming;
	}

	const table = longestCommonSubsequence(cleaned, incoming);
	const merged: string[] = [];
	let i = 0;
	let j = 0;

	while (i < cleaned.length && j < incoming.length) {
		if (cleaned[i] === incoming[j]) {
			merged.push(annotated[i]);
			i++;
			j++;
		} else if (table[i + 1][j] >= table[i][j + 1]) {
			i++;
		} else {
			merged.push(incoming[j]);
			j++;
		}
	}

	while (j < incoming.length) {
		merged.push(incoming[j]);
		j++;
	}

	return merged;
}

function positionedAnnotations(text: string): PositionedAnnotation[] {
	const ranges = collectAnnotationTagRanges(text);
	const shiftFor = (offset: number): number => {
		let removed = 0;
		for (const range of ranges) {
			if (range.to <= offset) removed += range.to - range.from;
			else if (range.from < offset) removed += offset - range.from;
			else break;
		}
		return offset - removed;
	};

	const positioned: PositionedAnnotation[] = [];
	for (const kind of ANNOTATION_KINDS) {
		for (const match of scanAnnotationTags(text, kind)) {
			const from = shiftFor(match.openTagEnd);
			const to = shiftFor(match.closeTagStart);
			if (from >= to) continue;
			positioned.push({
				key: `${kind}:${match.id}`,
				from,
				to,
				openTag: text.slice(match.openTagStart, match.openTagEnd),
				closeTag: text.slice(match.closeTagStart, match.closeTagEnd),
			});
		}
	}
	return positioned;
}

export function mergeAnnotatedContent(
	annotated: string,
	incoming: string,
): AnnotationMergeResult {
	if (!hasAnnotations(annotated)) {
		return { content: incoming, preserved: 0, dropped: 0 };
	}

	const before = annotationIds(annotated);

	const annotatedLines = annotated.split('\n');
	const cleanedLines = cleanAlignedLines(annotated, annotatedLines);
	const incomingLines = incoming.split('\n');

	let prefix = 0;
	while (
		prefix < cleanedLines.length &&
		prefix < incomingLines.length &&
		cleanedLines[prefix] === incomingLines[prefix]
	) {
		prefix++;
	}

	let suffix = 0;
	while (
		suffix < cleanedLines.length - prefix &&
		suffix < incomingLines.length - prefix &&
		cleanedLines[cleanedLines.length - 1 - suffix] ===
			incomingLines[incomingLines.length - 1 - suffix]
	) {
		suffix++;
	}

	const region = mergeRegion(
		annotatedLines.slice(prefix, annotatedLines.length - suffix),
		cleanedLines.slice(prefix, cleanedLines.length - suffix),
		incomingLines.slice(prefix, incomingLines.length - suffix),
	);

	const annotatedRegion = annotatedLines.slice(
		prefix,
		annotatedLines.length - suffix,
	);
	const rescued = region.map((line, index) => {
		const original = annotatedRegion[index];
		return original && original !== line ? reanchorLine(original, line) : line;
	});

	const merged = [
		...annotatedLines.slice(0, prefix),
		...rescued,
		...annotatedLines.slice(annotatedLines.length - suffix),
	];

	const content = stripOrphanAnnotationTags(merged.join('\n'));
	const after = annotationIds(content);
	let preserved = 0;
	for (const id of before) {
		if (after.has(id)) preserved++;
	}

	return { content, preserved, dropped: before.size - preserved };
}

export function mergeAnnotatedSources(
	sources: string[],
	incoming: string,
): AnnotationMergeResult {
	const cleanIncoming = stripAnnotations(incoming) as string;
	const before = new Set<string>();
	const positioned = new Map<string, PositionedAnnotation>();

	for (const source of sources) {
		for (const id of annotationIds(source)) before.add(id);
		if (!hasAnnotations(source)) continue;

		const mapped = mergeAnnotatedContent(source, cleanIncoming).content;
		for (const annotation of positionedAnnotations(mapped)) {
			if (!positioned.has(annotation.key)) {
				positioned.set(annotation.key, annotation);
			}
		}
	}

	const opens = new Map<number, PositionedAnnotation[]>();
	const closes = new Map<number, PositionedAnnotation[]>();
	for (const annotation of positioned.values()) {
		const open = opens.get(annotation.from) ?? [];
		open.push(annotation);
		opens.set(annotation.from, open);

		const close = closes.get(annotation.to) ?? [];
		close.push(annotation);
		closes.set(annotation.to, close);
	}

	let content = '';
	for (let i = 0; i <= cleanIncoming.length; i++) {
		const closing = closes.get(i);
		if (closing) {
			for (const annotation of [...closing].reverse()) {
				content += annotation.closeTag;
			}
		}

		const opening = opens.get(i);
		if (opening) {
			for (const annotation of opening) content += annotation.openTag;
		}

		if (i < cleanIncoming.length) content += cleanIncoming[i];
	}

	return {
		content: stripOrphanAnnotationTags(content),
		preserved: positioned.size,
		dropped: Math.max(0, before.size - positioned.size),
	};
}
