// extras/viewers/milkdown/toolbar/MilkdownToolbar.tsx
import type React from 'react';
import { useInstance } from '@milkdown/react';
import { editorViewCtx } from '@milkdown/kit/core';

import { t } from '@/i18n';
import { milkdownToolbarItems } from './milkdownItems';
import { isToolbarButton } from './types';

const MilkdownToolbar: React.FC = () => {
	const [loading, getInstance] = useInstance();

	const run = (key: string) => {
		if (loading) return;

		const item = milkdownToolbarItems.find(
			(entry) => isToolbarButton(entry) && entry.key === key,
		);
		const editor = getInstance();

		if (!item || !isToolbarButton(item) || !editor) return;

		try {
			editor.action((ctx) => {
				const view = ctx.get(editorViewCtx);
				const didRun = item.command(view);

				if (!didRun) {
					console.warn(`Milkdown toolbar command did not apply: ${key}`);
				}
			});
		} catch (error) {
			console.warn('Milkdown toolbar command failed:', error);
		}
	};

	return (
		<div className='milkdown-toolbar'>
			{milkdownToolbarItems.map((item, index) => {
				if (!isToolbarButton(item)) {
					return item.type === 'space' ? (
						<div key={`space-${index}`} className='milkdown-toolbar-space' />
					) : (
						<div key={`split-${index}`} className='milkdown-toolbar-split' />
					);
				}

				return (
					<button
						key={item.key}
						type='button'
						className='milkdown-toolbar-button'
						data-item={item.key}
						title={t(item.title)}
						disabled={loading}
						onMouseDown={(event) => event.preventDefault()}
						onClick={() => run(item.key)}
					>
						{item.label}
					</button>
				);
			})}
		</div>
	);
};

export default MilkdownToolbar;
