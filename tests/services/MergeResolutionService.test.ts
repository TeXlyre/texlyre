import {
	mergeResolutionService,
	type ConflictResolutionRequest,
} from '@src/services/MergeResolutionService';
import { stripAnnotations } from '@src/utils/fileCommentUtils';

const annotated = (id: string, text: string) =>
	`<### comment id:${id} ###>${text}</### comment id:${id} ###>`;
const clean = (value: string) => stripAnnotations(value) as string;

describe('MergeResolutionService comparison mode', () => {
	it('reuses the global merge modal request channel as a read-only comparison', async () => {
		let request: ConflictResolutionRequest | null = null;
		const removeListener = mergeResolutionService.addListener((next) => {
			request = next;
		});

		const comparison = mergeResolutionService.compareFiles(
			[
				{
					path: 'main.tex',
					isBinary: false,
					localContent: 'old',
					remoteContent: 'new',
					changeType: 'modified',
				},
			],
			{ local: 'abc1234', remote: 'Current' },
			'Compare abc1234 ↔ Current',
		);

		expect(request).toEqual(
			expect.objectContaining({
				mode: 'compare',
				title: 'Compare abc1234 ↔ Current',
				labels: { local: 'abc1234', remote: 'Current' },
			}),
		);

		request!.resolve(null);
		await comparison;
		removeListener();
	});

	it('uses the same modal channel for editable working-tree comparisons', async () => {
		let request: ConflictResolutionRequest | null = null;
		const save = jest.fn().mockResolvedValue(undefined);
		const removeListener = mergeResolutionService.addListener((next) => {
			request = next;
		});

		const editing = mergeResolutionService.editFiles(
			[
				{
					path: 'main.tex',
					isBinary: false,
					localContent: 'current',
					remoteContent: 'old',
					changeType: 'modified',
				},
			],
			{ local: 'Working tree', remote: 'old-branch' },
			'Edit Working Tree from old-branch',
			save,
		);

		expect(request).toEqual(
			expect.objectContaining({
				mode: 'edit',
				labels: { local: 'Working tree', remote: 'old-branch' },
			}),
		);

		await request!.save?.('main.tex', 'edited');
		expect(save).toHaveBeenCalledWith('main.tex', 'edited');
		request!.resolve(null);
		await editing;
		removeListener();
	});
});

describe('MergeResolutionService annotation-aware text merge', () => {
	const merge = (base: string, local: string, remote: string) =>
		mergeResolutionService.tryAutoMerge(base, local, remote, false);

	it('combines annotations when visible text matches without a base', () => {
		const local = `Alpha ${annotated('left', 'beta')} gamma`;
		const remote = `Alpha beta ${annotated('right', 'gamma')}`;
		const result = mergeResolutionService.tryAutoMerge(
			undefined,
			local,
			remote,
			false,
		);

		expect(result.resolved).toBe(true);
		if (!result.resolved) return;
		expect(clean(result.content)).toBe('Alpha beta gamma');
		expect(result.content).toContain('comment id:left');
		expect(result.content).toContain('comment id:right');
	});

	it('does not guess between different visible text without a base', () => {
		expect(
			mergeResolutionService.tryAutoMerge(
				undefined,
				'Alpha local',
				'Alpha remote',
				false,
			),
		).toEqual({ resolved: false });
	});

	it('keeps local annotations when the remote side is a clean projection', () => {
		const base = `Alpha ${annotated('one', 'beta')} gamma`;
		const remote = 'Alpha beta gamma changed';
		const result = merge(base, base, remote);

		expect(result.resolved).toBe(true);
		if (!result.resolved) return;
		expect(clean(result.content)).toBe(remote);
		expect(result.content).toContain('comment id:one');
	});

	it('keeps remote annotations when the local side is clean', () => {
		const base = 'Alpha beta gamma';
		const local = 'Alpha beta gamma changed';
		const remote = `Alpha ${annotated('two', 'beta')} gamma`;
		const result = merge(base, local, remote);

		expect(result.resolved).toBe(true);
		if (!result.resolved) return;
		expect(clean(result.content)).toBe(local);
		expect(result.content).toContain('comment id:two');
	});

	it('combines annotations from both current sides', () => {
		const base = 'Alpha beta gamma';
		const local = `${annotated('left', 'Alpha')} beta gamma`;
		const remote = `Alpha beta ${annotated('right', 'gamma')}`;
		const result = merge(base, local, remote);

		expect(result.resolved).toBe(true);
		if (!result.resolved) return;
		expect(clean(result.content)).toBe(base);
		expect(result.content).toContain('comment id:left');
		expect(result.content).toContain('comment id:right');
	});

	it('does not resurrect an annotation that exists only in the base', () => {
		expect(
			merge(
				`Alpha ${annotated('old', 'beta')} gamma`,
				'Alpha beta gamma',
				'Alpha beta gamma',
			),
		).toEqual({
			resolved: true,
			content: 'Alpha beta gamma',
			unchanged: false,
		});
	});

	it('leaves genuine text conflicts unresolved', () => {
		expect(merge('same line', 'local line', 'remote line')).toEqual({
			resolved: false,
		});
	});
});
