// extras/viewers/milkdown/toolbar/MilkdownToolbar.tsx
import type React from 'react';
import { useMemo } from 'react';
import { useInstance } from '@milkdown/react';
import { editorViewCtx } from '@milkdown/kit/core';

import { t } from '@/i18n';
import PluginToolbar, {
	type ToolbarEntry,
} from '@/components/common/PluginToolbar';
import { milkdownToolbarItems } from './milkdownItems';
import { isToolbarButton } from './types';

const MilkdownToolbar: React.FC = () => {
	const [loading, getInstance] = useInstance();

	const entries = useMemo<ToolbarEntry[]>(
		() =>
			milkdownToolbarItems.map((item) =>
				isToolbarButton(item)
					? { key: item.key, label: t(item.title), icon: item.label }
					: { type: item.type },
			),
		[],
	);

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

	return <PluginToolbar items={entries} onRun={run} disabled={loading} />;
};

export default MilkdownToolbar;
