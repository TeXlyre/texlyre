// src/utils/lineDiff.ts
export type DiffLine =
	| { kind: 'same'; text: string; oldLine: number; newLine: number }
	| { kind: 'removed'; text: string; oldLine: number }
	| { kind: 'added'; text: string; newLine: number }
	| { kind: 'skipped'; count: number };

// Beyond this many line pairs the LCS table gets expensive; such diffs fall
// back to "remove everything, add everything".
const MAX_CELLS = 2_000_000;

// Line diff via longest common subsequence after trimming the shared prefix and
// suffix, which keeps typical agent edits (a few lines in a long file) cheap.
// An empty string is no lines at all, so creating or emptying a file shows
// only additions or only removals.
const toLines = (text: string): string[] => (text ? text.split('\n') : []);

export function diffLines(before: string, after: string): DiffLine[] {
	const a = toLines(before);
	const b = toLines(after);

	let start = 0;
	while (start < a.length && start < b.length && a[start] === b[start]) {
		start++;
	}
	let endA = a.length;
	let endB = b.length;
	while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
		endA--;
		endB--;
	}

	const lines: DiffLine[] = [];
	for (let i = 0; i < start; i++) {
		lines.push({ kind: 'same', text: a[i], oldLine: i + 1, newLine: i + 1 });
	}

	const midA = a.slice(start, endA);
	const midB = b.slice(start, endB);
	lines.push(...diffMiddle(midA, midB, start, start));

	for (let i = 0; i < a.length - endA; i++) {
		lines.push({
			kind: 'same',
			text: a[endA + i],
			oldLine: endA + i + 1,
			newLine: endB + i + 1,
		});
	}
	return lines;
}

function diffMiddle(
	a: string[],
	b: string[],
	offsetA: number,
	offsetB: number,
): DiffLine[] {
	const removedAll = (): DiffLine[] => [
		...a.map((text, i) => ({
			kind: 'removed' as const,
			text,
			oldLine: offsetA + i + 1,
		})),
		...b.map((text, i) => ({
			kind: 'added' as const,
			text,
			newLine: offsetB + i + 1,
		})),
	];

	if (a.length === 0 || b.length === 0 || a.length * b.length > MAX_CELLS) {
		return removedAll();
	}

	// lcs[i][j] = LCS length of a[i..] and b[j..], stored row-major.
	const width = b.length + 1;
	const lcs = new Uint32Array((a.length + 1) * width);
	for (let i = a.length - 1; i >= 0; i--) {
		for (let j = b.length - 1; j >= 0; j--) {
			lcs[i * width + j] =
				a[i] === b[j]
					? lcs[(i + 1) * width + j + 1] + 1
					: Math.max(lcs[(i + 1) * width + j], lcs[i * width + j + 1]);
		}
	}

	const lines: DiffLine[] = [];
	let i = 0;
	let j = 0;
	while (i < a.length && j < b.length) {
		if (a[i] === b[j]) {
			lines.push({
				kind: 'same',
				text: a[i],
				oldLine: offsetA + i + 1,
				newLine: offsetB + j + 1,
			});
			i++;
			j++;
		} else if (lcs[(i + 1) * width + j] >= lcs[i * width + j + 1]) {
			lines.push({ kind: 'removed', text: a[i], oldLine: offsetA + i + 1 });
			i++;
		} else {
			lines.push({ kind: 'added', text: b[j], newLine: offsetB + j + 1 });
			j++;
		}
	}
	for (; i < a.length; i++) {
		lines.push({ kind: 'removed', text: a[i], oldLine: offsetA + i + 1 });
	}
	for (; j < b.length; j++) {
		lines.push({ kind: 'added', text: b[j], newLine: offsetB + j + 1 });
	}
	return lines;
}

// Keeps `context` unchanged lines around each change and folds the rest.
export function collapseUnchanged(lines: DiffLine[], context = 3): DiffLine[] {
	const keep = new Array<boolean>(lines.length).fill(false);
	lines.forEach((line, index) => {
		if (line.kind === 'same') return;
		for (
			let k = Math.max(0, index - context);
			k <= Math.min(lines.length - 1, index + context);
			k++
		) {
			keep[k] = true;
		}
	});

	const result: DiffLine[] = [];
	let skipped = 0;
	lines.forEach((line, index) => {
		if (keep[index]) {
			if (skipped) result.push({ kind: 'skipped', count: skipped });
			skipped = 0;
			result.push(line);
		} else {
			skipped++;
		}
	});
	if (skipped) result.push({ kind: 'skipped', count: skipped });
	return result;
}
