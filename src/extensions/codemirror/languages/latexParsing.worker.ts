// src/extensions/codemirror/languages/latexParsing.worker.ts
import { latexLanguage } from 'codemirror-lang-latex';
import type { SyntaxNode } from '@lezer/common';

type Range = { from: number; to: number };

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

function serialize(node: SyntaxNode, buffer: number[]): void {
	const start = buffer.length;
	for (let child = node.firstChild; child; child = child.nextSibling) {
		serialize(child, buffer);
	}
	buffer.push(node.type.id, node.from, node.to, buffer.length - start + 4);
}

self.onmessage = (
	event: MessageEvent<{ id: number; text: string; masks: Range[] }>,
) => {
	const { id, text, masks } = event.data;
	try {
		const tree = latexLanguage.parser.parse(
			text,
			[],
			parseRanges(text.length, masks),
		);
		const buffer: number[] = [];
		for (
			let child = tree.topNode.firstChild;
			child;
			child = child.nextSibling
		) {
			serialize(child, buffer);
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
