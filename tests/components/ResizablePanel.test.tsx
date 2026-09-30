import { render } from '@testing-library/react';

import ResizablePanel, {
	ResizablePanelGroup,
	resizeStackSizes,
} from '@src/components/common/ResizablePanel';

describe('ResizablePanel stacked sizing', () => {
	it('exchanges percentage between adjacent expanded panels', () => {
		const next = resizeStackSizes({
			sizes: { branches: 34, changes: 26, history: 40 },
			order: ['branches', 'changes', 'history'],
			collapsed: {},
			minimums: { branches: 12, changes: 12, history: 12 },
			panelId: 'branches',
			alignment: 'start',
			deltaPercent: 6,
		});

		expect(next).toEqual({ branches: 40, changes: 20, history: 40 });
		expect(Object.values(next).reduce((sum, value) => sum + value, 0)).toBe(100);
	});

	it('skips collapsed panels when finding the resize neighbor', () => {
		const next = resizeStackSizes({
			sizes: { branches: 34, changes: 26, history: 40 },
			order: ['branches', 'changes', 'history'],
			collapsed: { changes: true },
			minimums: { branches: 12, changes: 12, history: 12 },
			panelId: 'branches',
			alignment: 'start',
			deltaPercent: 5,
		});

		expect(next).toEqual({ branches: 39, changes: 26, history: 35 });
	});

	it('clamps resizing to each panel minimum percentage', () => {
		const next = resizeStackSizes({
			sizes: { branches: 20, changes: 20, history: 60 },
			order: ['branches', 'changes', 'history'],
			collapsed: {},
			minimums: { branches: 12, changes: 12, history: 12 },
			panelId: 'branches',
			alignment: 'start',
			deltaPercent: 50,
		});

		expect(next).toEqual({ branches: 28, changes: 12, history: 60 });
	});

	it('moves collapsed stacked panels after expanded panels', () => {
		const { container } = render(
			<ResizablePanelGroup direction='vertical'>
				<ResizablePanel
					stackId='first'
					className='first'
					collapsed
					direction='vertical'
				>
					First
				</ResizablePanel>
				<ResizablePanel
					stackId='second'
					className='second'
					collapsed={false}
					direction='vertical'
				>
					Second
				</ResizablePanel>
			</ResizablePanelGroup>,
		);

		expect(container.querySelector('.first')).toHaveStyle({ order: '1' });
		expect(container.querySelector('.second')).toHaveStyle({ order: '0' });
	});
});
