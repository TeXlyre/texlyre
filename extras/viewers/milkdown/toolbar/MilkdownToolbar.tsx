// extras/viewers/milkdown/toolbar/MilkdownToolbar.tsx
import { t } from '@/i18n';
import type React from 'react';
import { useInstance } from '@milkdown/react';
import { callCommand } from '@milkdown/kit/utils';

import { milkdownToolbarItems } from './milkdownItems';

const MilkdownToolbar: React.FC = () => {
	const [loading, getInstance] = useInstance();

	const run = (
		command: Parameters<typeof callCommand>[0],
		payload?: unknown,
	) => {
		if (loading || !command) return;
		const editor = getInstance();
		if (!editor) return;
		try {
			editor.action(callCommand(command, payload));
		} catch (error) {
			console.warn('Milkdown toolbar command failed:', error);
		}
	};

	return (
		<div className='milkdown-toolbar'>
			{milkdownToolbarItems.map((item) => (
				<button
					key={item.key}
					type='button'
					className='milkdown-toolbar-button'
					title={t(item.title)}
					onMouseDown={(e) => e.preventDefault()}
					onClick={() => run(item.command, item.payload)}
				>
					{item.label}
				</button>
			))}
		</div>
	);
};

export default MilkdownToolbar;
