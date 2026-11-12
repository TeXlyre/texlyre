// src/extensions/codemirror/languages/typstParsing.worker.ts
import type { SyntaxNode } from '@lezer/common';
import { typst_lezer } from 'codemirror-lang-typst/lezer';

type Range = { from: number; to: number };

const parser = typst_lezer().language.parser;

function parseRanges(length: number, masks: readonly Range[]): Range[] {
	const ranges: Range[] = [];
	let position = 0;
	for (const mask of masks) {
		const from = Math.max(mask.from, 1);
		const to = Math.min(mask.to, length - 1);
		if (to <= from || to <= position) continue;
		if (from > position) ranges.push({ from: position, to: from });
		position = Math.max(position, to);
	}
	if (position < length) ranges.push({ from: position, to: length });
	return ranges.length ? ranges : [{ from: 0, to: length }];
}

function documentPosition(
	position: number,
	ranges: readonly Range[],
	assoc: -1 | 1,
): number {
	let virtualStart = 0;
	for (let index = 0; index < ranges.length; index++) {
		const range = ranges[index];
		const virtualEnd = virtualStart + range.to - range.from;
		if (position < virtualEnd) return range.from + position - virtualStart;
		if (position === virtualEnd) {
			return assoc < 0 || index === ranges.length - 1
				? range.to
				: ranges[index + 1].from;
		}
		virtualStart = virtualEnd;
	}
	return ranges[ranges.length - 1]?.to ?? position;
}

function serialize(
	node: SyntaxNode,
	ranges: readonly Range[],
	buffer: number[],
): void {
	const start = buffer.length;
	for (let child = node.firstChild; child; child = child.nextSibling) {
		serialize(child, ranges, buffer);
	}
	const from = documentPosition(node.from, ranges, 1);
	const to = documentPosition(node.to, ranges, node.from === node.to ? 1 : -1);
	buffer.push(
		node.type.id,
		from,
		Math.max(from, to),
		buffer.length - start + 4,
	);
}

self.onmessage = (
	event: MessageEvent<{
		id: number;
		text: string;
		masks: Range[];
	}>,
) => {
	const { id, text, masks } = event.data;
	try {
		const ranges = parseRanges(text.length, masks);
		const tree = parser.parse(text, [], ranges);
		const buffer: number[] = [];
		for (
			let child = tree.topNode.firstChild;
			child;
			child = child.nextSibling
		) {
			serialize(child, ranges, buffer);
		}
		self.postMessage({
			id,
			buffer,
			topID: tree.topNode.type.id,
			length: text.length,
		});
	} catch (error) {
		self.postMessage({ id, error: String(error) });
	}
};
