// extras/viewers/milkdown/plugins/frontmatter.ts
import remarkFrontmatter from 'remark-frontmatter';
import { $nodeSchema, $remark } from '@milkdown/kit/utils';

export const remarkFrontmatterPlugin = $remark(
	'remarkFrontmatter',
	() => remarkFrontmatter,
	['yaml', 'toml'],
);

export const frontmatterSchema = $nodeSchema('front_matter', () => ({
	content: 'text*',
	group: 'block',
	marks: '',
	code: true,
	defining: true,
	isolating: true,

	attrs: {
		fence: { default: '---' },
	},

	parseDOM: [
		{
			tag: 'pre[data-type="front-matter"]',
			preserveWhitespace: 'full',
			getAttrs: (dom) => ({
				fence:
					dom instanceof HTMLElement ? (dom.dataset.fence ?? '---') : '---',
			}),
		},
	],

	toDOM: (node) => [
		'pre',
		{
			'data-type': 'front-matter',
			'data-fence': node.attrs.fence,
			class: 'milkdown-front-matter',
		},
		['code', 0],
	],

	parseMarkdown: {
		match: (node) => node.type === 'yaml' || node.type === 'toml',
		runner: (state, node, type) => {
			const value = String(node.value ?? '');
			state.openNode(type, { fence: node.type === 'toml' ? '+++' : '---' });
			if (value) state.addText(value);
			state.closeNode();
		},
	},

	toMarkdown: {
		match: (node) => node.type.name === 'front_matter',
		runner: (state, node) => {
			state.addNode(
				node.attrs.fence === '+++' ? 'toml' : 'yaml',
				undefined,
				node.textContent,
			);
		},
	},
}));
